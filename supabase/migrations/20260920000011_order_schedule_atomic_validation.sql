-- ==============================================================================
-- Migration: 20260920000011_order_schedule_atomic_validation.sql
-- Description: F04 Remediation - Atomic Order Schedule Validation in PostgreSQL
--
-- Fact-Forcing Metadata:
-- - Importers/Callers:
--   - supabase/functions/public-api/index.ts (create_order RPC)
--   - supabase/functions/_shared/concierge/runtime.ts (create_order RPC)
-- - Affected API:
--   - POST /functions/v1/public-api/orders
--   - POST /functions/v1/public-api/order-quotes
-- - Data Schemas:
--   - public.business_closures (date date, service_type text, reason text)
--   - public.business_hours (weekday int, service_type text, open_time time, close_time time, active boolean)
--   - public.orders (order_type text, status text, created_at timestamptz)
-- - Verbatim Instructions:
--   - "BƯỚC 6 — F04: TRUSTED CLOCK VÀ LỊCH PHỤC VỤ"
--   - "Kiểm tra lại logic lịch: validate business hours / closures một cách atomic / transaction-safe khi tạo order/reservation, không để lọt trường hợp restaurant closure phủ nhận delivery service (all vs restaurant scope)."
-- ==============================================================================

-- 1. Drop existing 10-parameter signature to prevent ambiguous function call errors
DROP FUNCTION IF EXISTS public.create_order(text, text, text, text, uuid, jsonb, jsonb, jsonb, text, text);

-- 2. Create 11-parameter create_order with atomic schedule & closure checks
CREATE OR REPLACE FUNCTION public.create_order(
    p_idempotency_key_hash text,
    p_actor_scope text,
    p_request_hash text,
    p_order_type text,
    p_customer_user_id uuid,
    p_dine_in_context jsonb,
    p_delivery_context jsonb,
    p_items jsonb,
    p_note text,
    p_claim_secret_hash text DEFAULT NULL,
    p_reference_now timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    -- Idempotency variables
    v_existing_response jsonb;
    v_existing_actor text;
    v_existing_req_hash text;

    -- Time & Schedule variables
    v_now timestamptz;
    v_vn_now timestamptz;
    v_vn_date date;
    v_vn_time time;
    v_weekday int;
    v_service_type text;
    v_closure_types text[];
    v_closure record;
    v_open_time time;
    v_close_time time;

    -- Settings & context variables
    v_settings record;
    v_table record;
    v_visit record;
    v_table_id uuid;
    v_table_visit_id uuid;
    v_epoch int;
    v_table_name_snapshot text;

    -- Delivery context variables
    v_delivery_zone_id uuid;
    v_customer_name text;
    v_customer_phone text;
    v_address text;
    v_expected_shipping_fee bigint;
    v_zone record;
    v_zone_name_snapshot text := NULL;

    -- Menu validation variables
    v_item_ids uuid[];
    v_item_record record;
    v_item_elem jsonb;
    v_item_idx int;
    v_item_id uuid;
    v_item_name text;
    v_unit_price bigint;
    v_qty int;
    v_item_note text;
    v_line_total bigint;
    v_subtotal_vnd bigint := 0;
    v_shipping_fee_vnd bigint := 0;
    v_total_vnd bigint := 0;

    -- Order creation variables
    v_order_code text;
    v_new_order_id uuid;
    v_new_order_code text;
    v_new_created_at timestamptz;
    v_receipt jsonb;
BEGIN
    -- 1. Advisory transaction lock on the idempotency key hash to strictly serialize
    -- concurrent requests with identical keys and prevent insert races.
    PERFORM pg_advisory_xact_lock(hashtext('idempotency:create_order:' || p_idempotency_key_hash));

    -- 2. Idempotency Check:
    -- Query existing idempotency request BEFORE business/intake checks so retries
    -- of already-committed orders safely return the receipt even if the store closed.
    SELECT response_json, actor_scope, request_hash
    INTO v_existing_response, v_existing_actor, v_existing_req_hash
    FROM public.idempotency_requests
    WHERE operation = 'create_order' AND key_hash = p_idempotency_key_hash;

    IF FOUND THEN
        IF v_existing_actor = p_actor_scope AND v_existing_req_hash = p_request_hash THEN
            RETURN jsonb_build_object(
                'replayed', true,
                'receipt', v_existing_response
            );
        ELSE
            RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Idempotency-Key đã được sử dụng với payload hoặc đối tượng khác'
                USING ERRCODE = 'P0010';
        END IF;
    END IF;

    -- 3. Compute trusted time in Asia/Ho_Chi_Minh (UTC+7, no DST)
    v_now := COALESCE(p_reference_now, now());
    v_vn_now := v_now AT TIME ZONE 'Asia/Ho_Chi_Minh';
    v_vn_date := v_vn_now::date;
    v_vn_time := v_vn_now::time;
    v_weekday := EXTRACT(DOW FROM v_vn_now)::int;

    -- Map order type to service type and define closure scoping
    IF p_order_type = 'delivery' THEN
        v_service_type := 'delivery';
        -- Crucial: restaurant closure does NOT affect delivery service!
        v_closure_types := ARRAY['delivery', 'all'];
    ELSIF p_order_type = 'dine_in' THEN
        v_service_type := 'restaurant';
        v_closure_types := ARRAY['restaurant', 'all'];
    ELSE
        RAISE EXCEPTION 'VALIDATION_ERROR: Loại đơn hàng không hợp lệ'
            USING ERRCODE = 'P0012';
    END IF;

    -- 4. Atomic Business Closures check
    SELECT reason
    INTO v_closure
    FROM public.business_closures
    WHERE date = v_vn_date AND service_type = ANY(v_closure_types)
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0011',
            MESSAGE = format('SERVICE_CLOSED: Quán tạm ngưng dịch vụ %s vào ngày %s%s',
                CASE WHEN v_service_type = 'delivery' THEN 'giao hàng' ELSE 'phục vụ tại quán' END,
                v_vn_date,
                CASE WHEN v_closure.reason IS NOT NULL AND length(v_closure.reason) > 0 THEN ': ' || v_closure.reason ELSE '' END
            );
    END IF;

    -- 5. Atomic Business Hours check
    SELECT open_time, close_time
    INTO v_open_time, v_close_time
    FROM public.business_hours
    WHERE weekday = v_weekday AND service_type = v_service_type AND active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'SERVICE_CLOSED: Quán không hoạt động dịch vụ % vào thứ %',
            CASE WHEN v_service_type = 'delivery' THEN 'giao hàng' ELSE 'phục vụ tại quán' END,
            CASE WHEN v_weekday = 0 THEN 'Chủ Nhật' ELSE 'thứ ' || (v_weekday + 1) END
            USING ERRCODE = 'P0011';
    END IF;

    IF v_vn_time < v_open_time OR v_vn_time > v_close_time THEN
        RAISE EXCEPTION 'SERVICE_CLOSED: Ngoài khung giờ phục vụ (% - %). Hiện tại là %.',
            to_char(v_open_time, 'HH24:MI'), to_char(v_close_time, 'HH24:MI'), to_char(v_vn_time, 'HH24:MI')
            USING ERRCODE = 'P0011';
    END IF;

    -- 6. Lock Ordering: Step A -> Lock restaurant_settings row FOR SHARE
    SELECT accepting_orders, accepting_dine_in_orders, accepting_delivery_orders, min_delivery_order_vnd
    INTO v_settings
    FROM public.restaurant_settings
    WHERE id = 1
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'SERVICE_CLOSED: Cấu hình nhà hàng không tìm thấy'
            USING ERRCODE = 'P0011';
    END IF;

    IF NOT v_settings.accepting_orders THEN
        RAISE EXCEPTION 'SERVICE_CLOSED: Quán hiện đang tạm ngưng nhận đơn'
            USING ERRCODE = 'P0011';
    END IF;

    -- 7. Lock Ordering: Step B -> Lock table / visit if dine-in, OR lock delivery zone if delivery
    IF p_order_type = 'dine_in' THEN
        IF NOT v_settings.accepting_dine_in_orders THEN
            RAISE EXCEPTION 'SERVICE_CLOSED: Quán hiện đang tạm ngưng phục vụ tại bàn'
                USING ERRCODE = 'P0011';
        END IF;

        v_table_id := (p_dine_in_context->>'table_id')::uuid;
        v_table_visit_id := (p_dine_in_context->>'table_visit_id')::uuid;
        v_epoch := (p_dine_in_context->>'epoch')::int;

        IF v_table_id IS NULL OR v_table_visit_id IS NULL OR v_epoch IS NULL THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: Thiếu thông tin bàn hoặc phiên phục vụ'
                USING ERRCODE = 'P0012';
        END IF;

        -- Lock dining_tables FOR SHARE
        SELECT code, name, active
        INTO v_table
        FROM public.dining_tables
        WHERE id = v_table_id
        FOR SHARE;

        IF NOT FOUND OR NOT v_table.active THEN
            RAISE EXCEPTION 'TABLE_UNAVAILABLE: Bàn không tồn tại hoặc đang tạm ngưng phục vụ'
                USING ERRCODE = 'P0001';
        END IF;

        -- Lock table_visits FOR SHARE
        SELECT status, capability_epoch
        INTO v_visit
        FROM public.table_visits
        WHERE id = v_table_visit_id AND table_id = v_table_id
        FOR SHARE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'VISIT_CLOSED: Phiên phục vụ không tồn tại trên bàn này'
                USING ERRCODE = 'P0013';
        END IF;

        IF v_visit.status != 'open' THEN
            RAISE EXCEPTION 'VISIT_CLOSED: Phiên phục vụ bàn đã kết thúc'
                USING ERRCODE = 'P0013';
        END IF;

        IF v_visit.capability_epoch != v_epoch THEN
            RAISE EXCEPTION 'CAPABILITY_REVOKED: Quyền truy cập bàn hoặc mã QR đã thay đổi'
                USING ERRCODE = 'P0014';
        END IF;

        v_table_name_snapshot := v_table.name;
    ELSIF p_order_type = 'delivery' THEN
        IF NOT v_settings.accepting_delivery_orders THEN
            RAISE EXCEPTION 'SERVICE_CLOSED: Quán hiện đang tạm ngưng nhận đơn giao tận nơi'
                USING ERRCODE = 'P0011';
        END IF;

        IF p_delivery_context IS NULL THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: Thiếu thông tin giao hàng'
                USING ERRCODE = 'P0012';
        END IF;

        v_delivery_zone_id := (p_delivery_context->>'delivery_zone_id')::uuid;
        v_customer_name := trim(COALESCE(p_delivery_context->>'customer_name', ''));
        v_customer_phone := trim(COALESCE(p_delivery_context->>'customer_phone', ''));
        v_address := trim(COALESCE(p_delivery_context->>'address', ''));
        v_expected_shipping_fee := (p_delivery_context->>'expected_shipping_fee_vnd')::bigint;

        IF v_delivery_zone_id IS NULL THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: Khu vực giao hàng không được để trống'
                USING ERRCODE = 'P0012';
        END IF;

        IF char_length(v_customer_name) < 2 THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: Tên khách hàng phải có ít nhất 2 ký tự'
                USING ERRCODE = 'P0012';
        END IF;

        IF char_length(v_customer_phone) < 9 THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: Số điện thoại phải có ít nhất 9 ký tự'
                USING ERRCODE = 'P0012';
        END IF;

        IF char_length(v_address) < 5 THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: Địa chỉ giao hàng phải có ít nhất 5 ký tự'
                USING ERRCODE = 'P0012';
        END IF;

        -- Lock delivery_zones FOR SHARE
        SELECT id, name, fee_vnd, free_threshold_vnd, active, version
        INTO v_zone
        FROM public.delivery_zones
        WHERE id = v_delivery_zone_id
        FOR SHARE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'ZONE_UNAVAILABLE: Khu vực giao hàng không tồn tại'
                USING ERRCODE = 'P0021';
        END IF;

        IF NOT v_zone.active THEN
            RAISE EXCEPTION 'ZONE_UNAVAILABLE: Khu vực giao hàng "%" hiện đang tạm ngưng phục vụ', v_zone.name
                USING ERRCODE = 'P0021';
        END IF;

        v_zone_name_snapshot := v_zone.name;
    END IF;

    -- 8. Validate Line Items Format and Limits
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Đơn hàng phải có ít nhất 1 món ăn'
            USING ERRCODE = 'P0012';
    END IF;

    IF jsonb_array_length(p_items) > 50 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Số dòng món tối đa là 50'
            USING ERRCODE = 'P0012';
    END IF;

    -- 9. Lock Ordering: Step C -> Lock menu_items rows in ascending UUID order FOR SHARE
    SELECT array_agg(DISTINCT (elem->>'menu_item_id')::uuid ORDER BY (elem->>'menu_item_id')::uuid)
    INTO v_item_ids
    FROM jsonb_array_elements(p_items) elem;

    PERFORM id
    FROM public.menu_items
    WHERE id = ANY(v_item_ids)
    ORDER BY id
    FOR SHARE;

    -- 10. Validate each item against live database state & price invariants
    FOR v_item_idx IN 0 .. jsonb_array_length(p_items) - 1 LOOP
        v_item_elem := p_items->v_item_idx;
        v_item_id := (v_item_elem->>'menu_item_id')::uuid;
        v_unit_price := (v_item_elem->>'unit_price_vnd')::bigint;
        v_qty := (v_item_elem->>'quantity')::int;
        v_item_name := trim(COALESCE(v_item_elem->>'item_name', ''));
        v_item_note := COALESCE(v_item_elem->>'note', '');

        IF v_qty < 1 OR v_qty > 99 THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: Số lượng món phải từ 1 đến 99'
                USING ERRCODE = 'P0012';
        END IF;

        SELECT id, name, price_vnd, published, available, allow_dine_in, allow_delivery
        INTO v_item_record
        FROM public.menu_items
        WHERE id = v_item_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'ITEM_UNAVAILABLE: Món ăn không tồn tại'
                USING ERRCODE = 'P0017';
        END IF;

        IF NOT v_item_record.published OR NOT v_item_record.available THEN
            RAISE EXCEPTION 'ITEM_UNAVAILABLE: Món "%" hiện không khả dụng', v_item_record.name
                USING ERRCODE = 'P0017';
        END IF;

        IF p_order_type = 'dine_in' AND NOT v_item_record.allow_dine_in THEN
            RAISE EXCEPTION 'ITEM_UNAVAILABLE: Món "%" không phục vụ tại bàn', v_item_record.name
                USING ERRCODE = 'P0017';
        END IF;

        IF p_order_type = 'delivery' AND NOT v_item_record.allow_delivery THEN
            RAISE EXCEPTION 'ITEM_UNAVAILABLE: Món "%" không áp dụng giao tận nơi', v_item_record.name
                USING ERRCODE = 'P0017';
        END IF;

        -- Price invariant: live price must match quoted price
        IF v_item_record.price_vnd != v_unit_price THEN
            RAISE EXCEPTION 'QUOTE_CHANGED: Giá món "%" đã thay đổi (từ % sang %), vui lòng lấy báo giá mới',
                v_item_record.name, v_unit_price, v_item_record.price_vnd
                USING ERRCODE = 'P0016';
        END IF;

        v_line_total := v_unit_price * v_qty;
        v_subtotal_vnd := v_subtotal_vnd + v_line_total;
    END LOOP;

    -- Subtotal limit check: <= 1,000,000,000 VND
    IF v_subtotal_vnd > 1000000000 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Tổng tiền đơn hàng vượt quá hạn mức 1 tỷ VND'
            USING ERRCODE = 'P0012';
    END IF;

    -- Minimum order validation for delivery
    IF p_order_type = 'delivery' THEN
        IF v_subtotal_vnd < v_settings.min_delivery_order_vnd THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: Đơn hàng chưa đạt mức tối thiểu % đ để giao tận nơi (hiện tại: % đ)',
                v_settings.min_delivery_order_vnd, v_subtotal_vnd
                USING ERRCODE = 'P0012';
        END IF;

        -- Calculate live shipping fee based on zone threshold
        IF v_zone.free_threshold_vnd IS NOT NULL AND v_subtotal_vnd >= v_zone.free_threshold_vnd THEN
            v_shipping_fee_vnd := 0;
        ELSE
            v_shipping_fee_vnd := v_zone.fee_vnd;
        END IF;

        -- Invariant V10: Re-verify expected shipping fee against live calculation
        IF v_expected_shipping_fee IS NOT NULL AND v_expected_shipping_fee != v_shipping_fee_vnd THEN
            RAISE EXCEPTION 'QUOTE_CHANGED: Phí giao hàng đã thay đổi (từ % sang %), vui lòng lấy báo giá mới',
                v_expected_shipping_fee, v_shipping_fee_vnd
                USING ERRCODE = 'P0016';
        END IF;
    ELSE
        v_shipping_fee_vnd := 0;
    END IF;

    v_total_vnd := v_subtotal_vnd + v_shipping_fee_vnd;

    -- 11. Generate Unique Order Code (TG- + 8 uppercase alphanumeric chars)
    LOOP
        v_order_code := 'TG-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.orders WHERE code = v_order_code);
    END LOOP;

    -- 12. Insert into orders
    INSERT INTO public.orders (
        id,
        code,
        customer_user_id,
        order_type,
        status,
        table_id,
        table_visit_id,
        table_name_snapshot,
        customer_name,
        customer_phone,
        delivery_zone_id,
        address_snapshot,
        zone_name_snapshot,
        subtotal_vnd,
        shipping_fee_vnd,
        total_vnd,
        note,
        internal_note,
        payment_status,
        payment_method,
        version,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        v_order_code,
        p_customer_user_id,
        p_order_type,
        'pending',
        CASE WHEN p_order_type = 'dine_in' THEN v_table_id ELSE NULL END,
        CASE WHEN p_order_type = 'dine_in' THEN v_table_visit_id ELSE NULL END,
        CASE WHEN p_order_type = 'dine_in' THEN v_table_name_snapshot ELSE NULL END,
        CASE WHEN p_order_type = 'delivery' THEN v_customer_name ELSE NULL END,
        CASE WHEN p_order_type = 'delivery' THEN v_customer_phone ELSE NULL END,
        CASE WHEN p_order_type = 'delivery' THEN v_delivery_zone_id ELSE NULL END,
        CASE WHEN p_order_type = 'delivery' THEN v_address ELSE NULL END,
        CASE WHEN p_order_type = 'delivery' THEN v_zone_name_snapshot ELSE NULL END,
        v_subtotal_vnd,
        v_shipping_fee_vnd,
        v_total_vnd,
        COALESCE(p_note, ''),
        '',
        'unpaid',
        NULL,
        1,
        now(),
        now()
    ) RETURNING id, code, created_at INTO v_new_order_id, v_new_order_code, v_new_created_at;

    -- 13. Insert into order_items
    FOR v_item_idx IN 0 .. jsonb_array_length(p_items) - 1 LOOP
        v_item_elem := p_items->v_item_idx;
        v_item_id := (v_item_elem->>'menu_item_id')::uuid;
        v_unit_price := (v_item_elem->>'unit_price_vnd')::bigint;
        v_qty := (v_item_elem->>'quantity')::int;
        v_item_name := trim(COALESCE(v_item_elem->>'item_name', ''));
        v_item_note := COALESCE(v_item_elem->>'note', '');

        INSERT INTO public.order_items (
            id,
            order_id,
            menu_item_id,
            item_name,
            unit_price_vnd,
            quantity,
            line_total_vnd,
            note,
            position,
            created_at
        ) VALUES (
            gen_random_uuid(),
            v_new_order_id,
            v_item_id,
            v_item_name,
            v_unit_price,
            v_qty,
            v_unit_price * v_qty,
            v_item_note,
            v_item_idx,
            now()
        );
    END LOOP;

    -- 14. Insert initial order_status_history
    INSERT INTO public.order_status_history (
        id,
        order_id,
        from_status,
        to_status,
        actor_admin_id,
        reason,
        created_at
    ) VALUES (
        gen_random_uuid(),
        v_new_order_id,
        NULL,
        'pending',
        NULL,
        CASE WHEN p_order_type = 'delivery' THEN 'Đơn giao tận nơi tạo từ website' ELSE 'Đơn hàng tạo từ mã QR bàn ăn' END,
        now()
    );

    -- 15. Optional Guest Order Claim insert
    IF p_claim_secret_hash IS NOT NULL AND length(trim(p_claim_secret_hash)) > 0 THEN
        INSERT INTO public.guest_order_claims (
            id,
            order_id,
            secret_hash,
            expires_at,
            created_at
        ) VALUES (
            gen_random_uuid(),
            v_new_order_id,
            trim(p_claim_secret_hash),
            now() + interval '24 hours',
            now()
        );
    END IF;

    -- 16. Construct Minimal Receipt JSON
    v_receipt := jsonb_build_object(
        'id', v_new_order_id,
        'code', v_new_order_code,
        'order_type', p_order_type,
        'status', 'pending',
        'payment_status', 'unpaid',
        'subtotal_vnd', v_subtotal_vnd,
        'shipping_fee_vnd', v_shipping_fee_vnd,
        'total_vnd', v_total_vnd,
        'created_at', to_char(v_new_created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    );

    -- 17. Save Idempotency Request Record
    INSERT INTO public.idempotency_requests (
        id,
        operation,
        key_hash,
        actor_scope,
        request_hash,
        result_id,
        response_json,
        created_at,
        expires_at
    ) VALUES (
        gen_random_uuid(),
        'create_order',
        p_idempotency_key_hash,
        p_actor_scope,
        p_request_hash,
        v_new_order_id,
        v_receipt,
        now(),
        now() + interval '24 hours'
    );

    -- 18. Return receipt
    RETURN jsonb_build_object(
        'replayed', false,
        'receipt', v_receipt
    );
END;
$$;
