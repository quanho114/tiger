-- ==============================================================================
-- Migration: 20260923000005_takeaway_orders.sql
-- Description: Full-stack takeaway ("Mang đi") order type — schema constraints,
--              create_order branch, transition_order_status branch.
--
-- Fact-Forcing Metadata:
-- - Importers/Callers:
--   - supabase/functions/public-api/quotes-handlers.ts (POST /order-quotes, order_type gate)
--   - supabase/functions/public-api/orders-handlers.ts (POST /orders → public.create_order)
--   - supabase/functions/admin-api/create-order-handler.ts (admin manual create)
--   - supabase/functions/admin-api/orders-handlers.ts (transition → public.transition_order_status)
--   - supabase/functions/customer-api/customer-handlers.ts (reorder target_order_type)
-- - Affected API:
--   - POST /functions/v1/public-api/order-quotes
--   - POST /functions/v1/public-api/orders
--   - POST /functions/v1/admin-api/orders
--   - POST /functions/v1/admin-api/orders/:id/transition
--   - POST /functions/v1/customer-api/orders/:id/reorder
-- - Data Schemas:
--   - public.orders (order_type text CHECK, pickup_time text NULL, new CHECK constraints)
--   - public.order_status_history (from_status/to_status unchanged)
-- - Design decisions (từ plan đã chốt với user):
--   - "takeaway" là order_type thứ 3; service_type = 'restaurant' (đóng cửa nhà hàng chặn mang đi).
--   - Settings flag: dùng accepting_orders (cờ chung) — KHÔNG thêm cột mới; label
--     accepting_dine_in_orders ("Order tại bàn") là QR-specific nên không tái sử dụng.
--   - Item flag cho takeaway: allow_delivery (nhất quán frontend dish.modes + catalog mode filter).
--   - pickup_time: text 'HH:MM' (VN, regex 24h) hoặc NULL = "Càng sớm càng tốt"; chỉ takeaway được có.
--   - Context dùng lại param p_delivery_context (không đổi signature create_order):
--     takeaway = { customer_name, customer_phone, pickup_time }; không zone/address (CHECK chặn).
--   - Shipping = 0; không min-delivery; không visit_capability/bàn.
--   - State graph takeaway: pending → confirmed → preparing → completed (cần paid),
--     pending/confirmed/preparing → cancelled|rejected theo quy tắc hiện hành.
--   - Không sửa migration đã áp dụng; CREATE OR REPLACE full body 2 RPC.
-- ==============================================================================

-- 1. Widen orders.order_type CHECK to include 'takeaway'
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_type_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_order_type_check
    CHECK (order_type IN ('dine_in', 'delivery', 'takeaway'));

-- 2. pickup_time column (NULL = "Càng sớm càng tốt")
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pickup_time text NULL;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS chk_orders_pickup_time;
ALTER TABLE public.orders ADD CONSTRAINT chk_orders_pickup_time
    CHECK (
        pickup_time IS NULL
        OR (order_type = 'takeaway' AND pickup_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
    );

-- 3. Takeaway context validation (mirror chk_orders_dine_in_context / chk_orders_delivery_context)
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS chk_orders_takeaway_context;
ALTER TABLE public.orders ADD CONSTRAINT chk_orders_takeaway_context CHECK (
    order_type != 'takeaway' OR (
        table_id IS NULL AND
        table_visit_id IS NULL AND
        table_name_snapshot IS NULL AND
        customer_name IS NOT NULL AND char_length(trim(customer_name)) >= 2 AND
        customer_phone IS NOT NULL AND char_length(trim(customer_phone)) >= 9 AND
        delivery_zone_id IS NULL AND
        address_snapshot IS NULL AND
        zone_name_snapshot IS NULL AND
        shipping_fee_vnd = 0
    )
);

-- 4. Status restrictions by type (takeaway never enters delivering)
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS chk_orders_no_delivering_for_takeaway;
ALTER TABLE public.orders ADD CONSTRAINT chk_orders_no_delivering_for_takeaway
    CHECK (NOT (order_type = 'takeaway' AND status = 'delivering'));
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

    -- Takeaway context variables
    v_pickup_time text := NULL;

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
    -- 1. Advisory transaction lock on the idempotency key hash
    PERFORM pg_advisory_xact_lock(hashtext('idempotency:create_order:' || p_idempotency_key_hash));

    -- 2. Idempotency Check
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
    -- Hierarchical rule:
    -- - Restaurant closure blocks ALL services (restaurant, delivery, reservation)
    -- - Delivery closure ONLY blocks delivery
    IF p_order_type = 'delivery' THEN
        v_service_type := 'delivery';
        v_closure_types := ARRAY['delivery', 'restaurant', 'all'];
    ELSIF p_order_type = 'dine_in' THEN
        v_service_type := 'restaurant';
        v_closure_types := ARRAY['restaurant', 'all'];
    ELSIF p_order_type = 'takeaway' THEN
        -- Takeaway is fulfilled at the restaurant: restaurant hours/closures apply
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

    -- 5. Atomic Multi-shift Business Hours check
    -- Step 5.1: Verify service operates on this weekday
    IF NOT EXISTS (
        SELECT 1 FROM public.business_hours
        WHERE weekday = v_weekday AND service_type = v_service_type AND active = true
    ) THEN
        RAISE EXCEPTION 'SERVICE_CLOSED: Quán không hoạt động dịch vụ % vào thứ %',
            CASE WHEN v_service_type = 'delivery' THEN 'giao hàng' ELSE 'phục vụ tại quán' END,
            CASE WHEN v_weekday = 0 THEN 'Chủ Nhật' ELSE 'thứ ' || (v_weekday + 1) END
            USING ERRCODE = 'P0011';
    END IF;

    -- Step 5.2: Check if current time falls within at least ONE active shift interval [open_time, close_time]
    IF NOT EXISTS (
        SELECT 1 FROM public.business_hours
        WHERE weekday = v_weekday AND service_type = v_service_type AND active = true
          AND v_vn_time >= open_time AND v_vn_time <= close_time
    ) THEN
        RAISE EXCEPTION 'SERVICE_CLOSED: Ngoài khung giờ phục vụ. Hiện tại là %.',
            to_char(v_vn_time, 'HH24:MI')
            USING ERRCODE = 'P0011';
    END IF;

    -- Step 5.3: Delivery must also satisfy restaurant operating hours (kitchen must be open)
    IF p_order_type = 'delivery' THEN
        IF EXISTS (
            SELECT 1 FROM public.business_hours
            WHERE weekday = v_weekday AND service_type = 'restaurant' AND active = true
        ) AND NOT EXISTS (
            SELECT 1 FROM public.business_hours
            WHERE weekday = v_weekday AND service_type = 'restaurant' AND active = true
              AND v_vn_time >= open_time AND v_vn_time <= close_time
        ) THEN
            RAISE EXCEPTION 'SERVICE_CLOSED: Nhà hàng hiện đang đóng cửa (bếp không hoạt động), không thể nhận đơn giao tận nơi lúc %.',
                to_char(v_vn_time, 'HH24:MI')
                USING ERRCODE = 'P0011';
        END IF;
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
    ELSIF p_order_type = 'takeaway' THEN
        -- Reuse p_delivery_context to avoid changing create_order's signature:
        -- takeaway carries contact info + optional pickup_time (NULL = ASAP).
        IF p_delivery_context IS NULL THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: Thiếu thông tin nhận món'
                USING ERRCODE = 'P0012';
        END IF;

        v_customer_name := trim(COALESCE(p_delivery_context->>'customer_name', ''));
        v_customer_phone := trim(COALESCE(p_delivery_context->>'customer_phone', ''));
        v_pickup_time := nullif(trim(COALESCE(p_delivery_context->>'pickup_time', '')), '');

        IF char_length(v_customer_name) < 2 THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: Tên khách hàng phải có ít nhất 2 ký tự'
                USING ERRCODE = 'P0012';
        END IF;

        IF char_length(v_customer_phone) < 9 THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: Số điện thoại phải có ít nhất 9 ký tự'
                USING ERRCODE = 'P0012';
        END IF;

        IF v_pickup_time IS NOT NULL AND v_pickup_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: Giờ nhận món không hợp lệ (định dạng HH:MM)'
                USING ERRCODE = 'P0012';
        END IF;

        -- Reject delivery/table fields smuggled into the takeaway context
        IF p_delivery_context ? 'delivery_zone_id'
           OR p_delivery_context ? 'address'
           OR p_delivery_context ? 'table_id'
           OR p_delivery_context ? 'table_visit_id' THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: Đơn mang đi không nhận thông tin giao hàng hoặc bàn ăn'
                USING ERRCODE = 'P0012';
        END IF;
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

        IF p_order_type = 'takeaway' AND NOT v_item_record.allow_delivery THEN
            RAISE EXCEPTION 'ITEM_UNAVAILABLE: Món "%" không áp dụng mang đi', v_item_record.name
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
        pickup_time,
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
        CASE WHEN p_order_type IN ('delivery', 'takeaway') THEN v_customer_name ELSE NULL END,
        CASE WHEN p_order_type IN ('delivery', 'takeaway') THEN v_customer_phone ELSE NULL END,
        CASE WHEN p_order_type = 'delivery' THEN v_delivery_zone_id ELSE NULL END,
        CASE WHEN p_order_type = 'delivery' THEN v_address ELSE NULL END,
        CASE WHEN p_order_type = 'delivery' THEN v_zone_name_snapshot ELSE NULL END,
        CASE WHEN p_order_type = 'takeaway' THEN v_pickup_time ELSE NULL END,
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
        CASE
            WHEN p_order_type = 'delivery' THEN 'Đơn giao tận nơi tạo từ website'
            WHEN p_order_type = 'takeaway' THEN 'Đơn mang đi tạo từ website'
            ELSE 'Đơn hàng tạo từ mã QR bàn ăn'
        END,
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
        'pickup_time', v_pickup_time,
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
CREATE OR REPLACE FUNCTION public.transition_order_status(
    p_order_id uuid,
    p_expected_version int,
    p_target_status text,
    p_actor_admin_id uuid,
    p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order public.orders%ROWTYPE;
    v_updated public.orders%ROWTYPE;
    v_is_valid_transition boolean := false;
    v_clean_reason text := trim(COALESCE(p_reason, ''));
    v_table_visit_id uuid;
BEGIN
    -- Uniform Lock Hierarchy:
    -- Step A -> If this order belongs to a table visit, lock table_visits FOR SHARE first
    SELECT table_visit_id INTO v_table_visit_id
    FROM public.orders
    WHERE id = p_order_id;

    IF v_table_visit_id IS NOT NULL THEN
        PERFORM 1
        FROM public.table_visits
        WHERE id = v_table_visit_id
        FOR SHARE;
    END IF;

    -- Step B -> Lock the order row FOR UPDATE
    SELECT *
    INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ORDER_NOT_FOUND: Đơn hàng không tồn tại'
            USING ERRCODE = 'P0002';
    END IF;

    -- 2. Validate optimistic version
    IF v_order.version != p_expected_version THEN
        RAISE EXCEPTION 'VERSION_CONFLICT: Đơn hàng đã bị thay đổi bởi người khác (version hiện tại: %, kỳ vọng: %)', v_order.version, p_expected_version
            USING ERRCODE = 'P0003';
    END IF;

    -- 3. Disallow transition if already in terminal state
    IF v_order.status IN ('completed', 'cancelled', 'rejected') THEN
        RAISE EXCEPTION USING ERRCODE = 'P0019',
            MESSAGE = format('ORDER_TERMINAL: Đơn hàng đã ở trạng thái kết thúc (%s), không thể chuyển trạng thái tiếp', v_order.status);
    END IF;

    -- 4. Guard against cancelling/rejecting paid order before refund
    IF p_target_status IN ('cancelled', 'rejected') AND v_order.payment_status = 'paid' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0021',
            MESSAGE = 'PAID_ORDER_NOT_REFUNDED: Đơn hàng đã thanh toán không thể hủy hoặc từ chối trước khi ghi nhận hoàn tiền (refund)';
    END IF;

    -- 5. Validate State Graph according to order_type
    IF v_order.status = 'pending' THEN
        IF p_target_status = 'confirmed' THEN
            v_is_valid_transition := true;
        ELSIF p_target_status IN ('cancelled', 'rejected') THEN
            v_is_valid_transition := true;
            IF length(v_clean_reason) = 0 THEN
                v_clean_reason := CASE WHEN p_target_status = 'rejected' THEN 'Quán từ chối tiếp nhận đơn' ELSE 'Quán hủy đơn hàng' END;
            END IF;
        END IF;
    ELSIF v_order.status = 'confirmed' THEN
        IF p_target_status = 'preparing' THEN
            v_is_valid_transition := true;
        ELSIF p_target_status = 'cancelled' THEN
            v_is_valid_transition := true;
            IF length(v_clean_reason) = 0 THEN
                v_clean_reason := 'Quán hủy đơn sau khi đã xác nhận';
            END IF;
        END IF;
    ELSIF v_order.status = 'preparing' THEN
        IF v_order.order_type = 'dine_in' AND p_target_status = 'served' THEN
            v_is_valid_transition := true;
        ELSIF v_order.order_type = 'delivery' AND p_target_status = 'delivering' THEN
            v_is_valid_transition := true;
        ELSIF v_order.order_type = 'takeaway' AND p_target_status = 'completed' THEN
            -- Takeaway completes straight from preparing; payment must be recorded first
            IF v_order.payment_status != 'paid' THEN
                RAISE EXCEPTION USING ERRCODE = 'P0018',
                    MESSAGE = 'PAYMENT_REQUIRED: Đơn mang đi chưa thanh toán, không thể hoàn tất';
            END IF;
            v_is_valid_transition := true;
        ELSIF p_target_status = 'cancelled' THEN
            v_is_valid_transition := true;
            IF length(v_clean_reason) = 0 THEN
                v_clean_reason := 'Quán hủy đơn trong lúc đang chuẩn bị món';
            END IF;
        END IF;
    ELSIF v_order.status = 'served' AND v_order.order_type = 'dine_in' THEN
        IF p_target_status = 'completed' THEN
            -- Completed requires payment_status = 'paid'
            IF v_order.payment_status != 'paid' THEN
                RAISE EXCEPTION USING ERRCODE = 'P0018',
                    MESSAGE = format('PAYMENT_REQUIRED: Đơn hàng chưa thanh toán (payment_status: %s), không thể hoàn tất', v_order.payment_status);
            END IF;
            v_is_valid_transition := true;
        END IF;
    ELSIF v_order.status = 'delivering' AND v_order.order_type = 'delivery' THEN
        IF p_target_status = 'completed' THEN
            -- Completed requires payment_status = 'paid'
            IF v_order.payment_status != 'paid' THEN
                RAISE EXCEPTION USING ERRCODE = 'P0018',
                    MESSAGE = 'PAYMENT_REQUIRED: Đơn hàng giao tận nơi chưa thanh toán, không thể hoàn tất';
            END IF;
            v_is_valid_transition := true;
        END IF;
    END IF;

    IF NOT v_is_valid_transition THEN
        RAISE EXCEPTION USING ERRCODE = 'P0020',
            MESSAGE = format('INVALID_TRANSITION: Không thể chuyển từ trạng thái "%s" sang "%s" cho đơn hàng loại "%s"', v_order.status, p_target_status, v_order.order_type);
    END IF;

    -- 6. Apply state transition with optimistic concurrency check
    UPDATE public.orders
    SET status = p_target_status,
        version = version + 1,
        confirmed_at = CASE WHEN p_target_status = 'confirmed' THEN COALESCE(confirmed_at, now()) ELSE confirmed_at END,
        completed_at = CASE WHEN p_target_status = 'completed' THEN now() ELSE completed_at END,
        cancelled_at = CASE WHEN p_target_status IN ('cancelled', 'rejected') THEN now() ELSE cancelled_at END,
        updated_at = now()
    WHERE id = p_order_id AND version = p_expected_version
    RETURNING * INTO v_updated;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'VERSION_CONFLICT: Đơn hàng đã bị thay đổi bởi người khác'
            USING ERRCODE = 'P0003';
    END IF;

    -- 7. Insert into audit trail table (order_status_history)
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
        p_order_id,
        v_order.status,
        p_target_status,
        p_actor_admin_id,
        v_clean_reason,
        now()
    );

    -- 8. Return updated order
    RETURN to_jsonb(v_updated);
END;
$$;
