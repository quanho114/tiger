-- ==============================================================================
-- Tiger 345 - Payments, Visit Settlement & Lifecycle Migration (T17)
-- Importers/callers: supabase/functions/admin-api/index.ts calls public.record_order_payment, public.settle_table_visit, public.transition_order_status, public.close_table_visit
-- Affected API: POST /orders/:id/payment, POST /visits/:id/settle, POST /orders/:id/transition, POST /visits/:id/close
-- Data schemas: order_payment_events, orders, table_visits, audit_logs, idempotency_requests
-- User verbatim instruction: "làm full các task luôn ấy"
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. RPC: record_order_payment
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_order_payment(
    p_order_id uuid,
    p_expected_version int,
    p_event text,
    p_method text,
    p_actor_admin_id uuid,
    p_reason text DEFAULT NULL,
    p_idempotency_key_hash text DEFAULT NULL,
    p_actor_scope text DEFAULT NULL,
    p_request_hash text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order public.orders%ROWTYPE;
    v_updated public.orders%ROWTYPE;
    v_event_id uuid := gen_random_uuid();
    v_existing_response jsonb;
    v_existing_actor text;
    v_existing_req_hash text;
    v_clean_reason text := trim(COALESCE(p_reason, ''));
    v_payment_method text;
    v_receipt jsonb;
BEGIN
    -- 1. Advisory transaction lock on the idempotency key hash if provided
    IF p_idempotency_key_hash IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext('idempotency:record_payment:' || p_idempotency_key_hash));

        SELECT response_json, actor_scope, request_hash
        INTO v_existing_response, v_existing_actor, v_existing_req_hash
        FROM public.idempotency_requests
        WHERE operation = 'record_payment' AND key_hash = p_idempotency_key_hash;

        IF FOUND THEN
            IF v_existing_actor = p_actor_scope AND v_existing_req_hash = p_request_hash THEN
                RETURN jsonb_build_object(
                    'replayed', true,
                    'receipt', v_existing_response
                );
            ELSE
                RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Idempotency-Key đã được sử dụng với payload hoặc đối tượng khác'
                    USING ERRCODE = 'P0008';
            END IF;
        END IF;
    END IF;

    -- 2. Validate input parameters
    IF p_event NOT IN ('paid', 'refunded', 'corrected') THEN
        RAISE EXCEPTION 'INVALID_PAYMENT_EVENT: Sự kiện thanh toán không hợp lệ ("%")', p_event
            USING ERRCODE = 'P0020';
    END IF;

    IF p_event = 'paid' THEN
        IF p_method IS NULL OR p_method NOT IN ('cash', 'bank_transfer') THEN
            RAISE EXCEPTION 'INVALID_PAYMENT_METHOD: Phương thức thanh toán phải là "cash" hoặc "bank_transfer"'
                USING ERRCODE = 'P0020';
        END IF;
        v_payment_method := p_method;
    END IF;

    IF p_event IN ('refunded', 'corrected') THEN
        IF length(v_clean_reason) = 0 THEN
            RAISE EXCEPTION 'REASON_REQUIRED: Lý do là bắt buộc khi ghi nhận hoàn tiền hoặc điều chỉnh thanh toán'
                USING ERRCODE = 'P0026';
        END IF;
    END IF;

    -- 3. Lock order row
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ORDER_NOT_FOUND: Đơn hàng không tồn tại'
            USING ERRCODE = 'P0002';
    END IF;

    IF v_order.version != p_expected_version THEN
        RAISE EXCEPTION 'VERSION_CONFLICT: Đơn hàng đã bị thay đổi bởi người khác (version hiện tại: %, kỳ vọng: %)', v_order.version, p_expected_version
            USING ERRCODE = 'P0003';
    END IF;

    -- 4. Process event-specific transitions
    IF p_event = 'paid' THEN
        IF v_order.payment_status = 'paid' THEN
            RAISE EXCEPTION 'ALREADY_PAID: Đơn hàng đã được ghi nhận thanh toán trước đó'
                USING ERRCODE = 'P0023';
        END IF;

        IF v_order.status IN ('cancelled', 'rejected') THEN
            RAISE EXCEPTION 'ORDER_TERMINAL: Không thể ghi nhận thanh toán cho đơn hàng đã kết thúc (%s)', v_order.status
                USING ERRCODE = 'P0019';
        END IF;

        UPDATE public.orders
        SET payment_status = 'paid',
            payment_method = v_payment_method,
            paid_at = COALESCE(paid_at, now()),
            version = version + 1,
            updated_at = now()
        WHERE id = p_order_id
        RETURNING * INTO v_updated;

    ELSIF p_event = 'refunded' THEN
        IF v_order.payment_status != 'paid' THEN
            RAISE EXCEPTION 'INVALID_PAYMENT_STATE: Chỉ có thể hoàn tiền cho đơn hàng đã thanh toán (trạng thái hiện tại: %)', v_order.payment_status
                USING ERRCODE = 'P0024';
        END IF;

        IF v_order.status = 'completed' THEN
            RAISE EXCEPTION 'CANNOT_REFUND_COMPLETED: Không thể hoàn tiền đơn hàng đã hoàn tất qua giao diện quản trị'
                USING ERRCODE = 'P0025';
        END IF;

        v_payment_method := COALESCE(p_method, v_order.payment_method, 'cash');

        UPDATE public.orders
        SET payment_status = 'refunded',
            version = version + 1,
            updated_at = now()
        WHERE id = p_order_id
        RETURNING * INTO v_updated;

    ELSIF p_event = 'corrected' THEN
        IF v_order.payment_status != 'paid' THEN
            RAISE EXCEPTION 'INVALID_PAYMENT_STATE: Chỉ có thể điều chỉnh đơn hàng đã ghi nhận thanh toán (trạng thái hiện tại: %)', v_order.payment_status
                USING ERRCODE = 'P0024';
        END IF;

        IF v_order.status = 'completed' THEN
            RAISE EXCEPTION 'CANNOT_CORRECT_COMPLETED: Không thể sửa thanh toán cho đơn hàng đã hoàn tất'
                USING ERRCODE = 'P0025';
        END IF;

        v_payment_method := COALESCE(v_order.payment_method, p_method, 'cash');

        UPDATE public.orders
        SET payment_status = 'unpaid',
            payment_method = NULL,
            paid_at = NULL,
            version = version + 1,
            updated_at = now()
        WHERE id = p_order_id
        RETURNING * INTO v_updated;
    END IF;

    -- 5. Append-only record in order_payment_events
    INSERT INTO public.order_payment_events (
        id,
        order_id,
        event,
        amount_vnd,
        method,
        actor_admin_id,
        reason,
        batch_id,
        created_at
    ) VALUES (
        v_event_id,
        p_order_id,
        p_event,
        v_order.total_vnd,
        v_payment_method,
        p_actor_admin_id,
        NULLIF(v_clean_reason, ''),
        NULL,
        now()
    );

    -- 6. Audit log entry
    INSERT INTO public.audit_logs (
        id,
        admin_id,
        actor_kind,
        action,
        entity_type,
        entity_id,
        metadata,
        created_at
    ) VALUES (
        gen_random_uuid(),
        p_actor_admin_id,
        'admin',
        'record_order_payment',
        'order',
        p_order_id,
        jsonb_build_object(
            'old_data', jsonb_build_object(
                'payment_status', v_order.payment_status,
                'payment_method', v_order.payment_method,
                'version', v_order.version
            ),
            'new_data', jsonb_build_object(
                'event', p_event,
                'payment_status', v_updated.payment_status,
                'payment_method', v_updated.payment_method,
                'amount_vnd', v_order.total_vnd,
                'reason', v_clean_reason,
                'version', v_updated.version
            )
        ),
        now()
    );

    -- 7. Build receipt
    v_receipt := jsonb_build_object(
        'order_id', v_updated.id,
        'order_code', v_updated.code,
        'event', p_event,
        'payment_status', v_updated.payment_status,
        'payment_method', v_updated.payment_method,
        'amount_vnd', v_order.total_vnd,
        'version', v_updated.version,
        'paid_at', v_updated.paid_at,
        'updated_at', v_updated.updated_at
    );

    -- 8. Save Idempotency Request Record if key provided
    IF p_idempotency_key_hash IS NOT NULL THEN
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
            'record_payment',
            p_idempotency_key_hash,
            p_actor_scope,
            p_request_hash,
            p_order_id,
            v_receipt,
            now(),
            now() + interval '24 hours'
        );
    END IF;

    RETURN jsonb_build_object(
        'replayed', false,
        'receipt', v_receipt
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. RPC: settle_table_visit
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_table_visit(
    p_visit_id uuid,
    p_expected_visit_version int,
    p_expected_orders jsonb,
    p_method text,
    p_actor_admin_id uuid,
    p_idempotency_key_hash text DEFAULT NULL,
    p_actor_scope text DEFAULT NULL,
    p_request_hash text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_visit public.table_visits%ROWTYPE;
    v_updated_visit public.table_visits%ROWTYPE;
    v_batch_id uuid := gen_random_uuid();
    v_existing_response jsonb;
    v_existing_actor text;
    v_existing_req_hash text;
    v_pending_count int;
    v_refunded_unterminal_count int;
    v_expected_count int;
    v_db_unsettled_count int;
    v_mismatch_count int;
    v_order public.orders%ROWTYPE;
    v_total_settled_vnd bigint := 0;
    v_settled_order_ids uuid[] := '{}';
    v_receipt jsonb;
BEGIN
    -- 1. Advisory transaction lock on the idempotency key hash if provided
    IF p_idempotency_key_hash IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext('idempotency:settle_visit:' || p_idempotency_key_hash));

        SELECT response_json, actor_scope, request_hash
        INTO v_existing_response, v_existing_actor, v_existing_req_hash
        FROM public.idempotency_requests
        WHERE operation = 'settle_visit' AND key_hash = p_idempotency_key_hash;

        IF FOUND THEN
            IF v_existing_actor = p_actor_scope AND v_existing_req_hash = p_request_hash THEN
                RETURN jsonb_build_object(
                    'replayed', true,
                    'receipt', v_existing_response
                );
            ELSE
                RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Idempotency-Key đã được sử dụng với payload hoặc đối tượng khác'
                    USING ERRCODE = 'P0008';
            END IF;
        END IF;
    END IF;

    -- 2. Validate payment method
    IF p_method NOT IN ('cash', 'bank_transfer') THEN
        RAISE EXCEPTION 'INVALID_PAYMENT_METHOD: Phương thức thanh toán phải là "cash" hoặc "bank_transfer"'
            USING ERRCODE = 'P0020';
    END IF;

    -- 3. Lock visit row FOR UPDATE
    SELECT * INTO v_visit
    FROM public.table_visits
    WHERE id = p_visit_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'VISIT_NOT_FOUND: Phiên phục vụ không tồn tại'
            USING ERRCODE = 'P0002';
    END IF;

    IF v_visit.status != 'open' THEN
        RAISE EXCEPTION 'VISIT_ALREADY_CLOSED: Phiên phục vụ này đã đóng'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_visit.version != p_expected_visit_version THEN
        RAISE EXCEPTION 'VERSION_CONFLICT: Phiên phục vụ đã bị thay đổi bởi người khác (version hiện tại: %, kỳ vọng: %)', v_visit.version, p_expected_visit_version
            USING ERRCODE = 'P0003';
    END IF;

    -- 4. Check for any pending orders that must be addressed before settling
    SELECT count(*) INTO v_pending_count
    FROM public.orders
    WHERE table_visit_id = p_visit_id
      AND status = 'pending';

    IF v_pending_count > 0 THEN
        RAISE EXCEPTION 'PENDING_ORDERS_EXIST: Còn % đơn hàng đang chờ xác nhận (pending), cần xác nhận hoặc từ chối trước khi thanh toán bàn', v_pending_count
            USING ERRCODE = 'P0022';
    END IF;

    -- 5. Check for refunded orders not yet cancelled
    SELECT count(*) INTO v_refunded_unterminal_count
    FROM public.orders
    WHERE table_visit_id = p_visit_id
      AND payment_status = 'refunded'
      AND status NOT IN ('cancelled', 'rejected');

    IF v_refunded_unterminal_count > 0 THEN
        RAISE EXCEPTION 'REFUNDED_ORDER_NOT_TERMINAL: Có % đơn hàng đã hoàn tiền nhưng chưa hủy, cần hủy hoặc điều chỉnh trước khi thanh toán', v_refunded_unterminal_count
            USING ERRCODE = 'P0028';
    END IF;

    -- 6. Verify expected orders list matches unsettled orders in DB
    CREATE TEMP TABLE tmp_expected (
        order_id uuid PRIMARY KEY,
        expected_version int
    ) ON COMMIT DROP;

    IF p_expected_orders IS NOT NULL AND jsonb_typeof(p_expected_orders) = 'array' THEN
        INSERT INTO tmp_expected (order_id, expected_version)
        SELECT (elem->>'id')::uuid, (elem->>'version')::int
        FROM jsonb_array_elements(p_expected_orders) AS elem;
    END IF;

    SELECT count(*) INTO v_expected_count FROM tmp_expected;

    SELECT count(*) INTO v_db_unsettled_count
    FROM public.orders
    WHERE table_visit_id = p_visit_id
      AND payment_status = 'unpaid'
      AND status NOT IN ('cancelled', 'rejected');

    IF v_expected_count = 0 AND v_db_unsettled_count = 0 THEN
        RAISE EXCEPTION 'NO_ORDERS_TO_SETTLE: Không có đơn hàng nào cần thanh toán trong phiên phục vụ này'
            USING ERRCODE = 'P0027';
    END IF;

    IF v_expected_count != v_db_unsettled_count THEN
        RAISE EXCEPTION 'ORDER_LIST_MISMATCH: Danh sách đơn hàng chưa thanh toán đã thay đổi (kỳ vọng % đơn, thực tế % đơn). Vui lòng tải lại trước khi thanh toán.', v_expected_count, v_db_unsettled_count
            USING ERRCODE = 'P0003';
    END IF;

    SELECT count(*) INTO v_mismatch_count
    FROM public.orders o
    LEFT JOIN tmp_expected e ON o.id = e.order_id AND o.version = e.expected_version
    WHERE o.table_visit_id = p_visit_id
      AND o.payment_status = 'unpaid'
      AND o.status NOT IN ('cancelled', 'rejected')
      AND e.order_id IS NULL;

    IF v_mismatch_count > 0 THEN
        RAISE EXCEPTION 'ORDER_LIST_MISMATCH: Một số đơn hàng đã thay đổi phiên bản hoặc phát sinh mới. Vui lòng tải lại trước khi thanh toán.'
            USING ERRCODE = 'P0003';
    END IF;

    -- 7. Settle all unsettled orders atomically
    FOR v_order IN
        SELECT *
        FROM public.orders
        WHERE table_visit_id = p_visit_id
          AND payment_status = 'unpaid'
          AND status NOT IN ('cancelled', 'rejected')
        ORDER BY id
        FOR UPDATE
    LOOP
        -- Append payment event
        INSERT INTO public.order_payment_events (
            id,
            order_id,
            event,
            amount_vnd,
            method,
            actor_admin_id,
            reason,
            batch_id,
            created_at
        ) VALUES (
            gen_random_uuid(),
            v_order.id,
            'paid',
            v_order.total_vnd,
            p_method,
            p_actor_admin_id,
            'Thanh toán phiên bàn',
            v_batch_id,
            now()
        );

        -- Update order status
        UPDATE public.orders
        SET payment_status = 'paid',
            payment_method = p_method,
            paid_at = now(),
            version = version + 1,
            updated_at = now()
        WHERE id = v_order.id;

        v_total_settled_vnd := v_total_settled_vnd + v_order.total_vnd;
        v_settled_order_ids := array_append(v_settled_order_ids, v_order.id);
    END LOOP;

    -- 8. Increment visit version
    UPDATE public.table_visits
    SET version = version + 1,
        updated_at = now()
    WHERE id = p_visit_id
    RETURNING * INTO v_updated_visit;

    -- 9. Audit log entry
    INSERT INTO public.audit_logs (
        id,
        admin_id,
        actor_kind,
        action,
        entity_type,
        entity_id,
        metadata,
        created_at
    ) VALUES (
        gen_random_uuid(),
        p_actor_admin_id,
        'admin',
        'settle_visit',
        'table_visit',
        p_visit_id,
        jsonb_build_object(
            'old_data', jsonb_build_object('visit_version', v_visit.version, 'unsettled_orders_count', v_expected_count),
            'new_data', jsonb_build_object(
                'batch_id', v_batch_id,
                'method', p_method,
                'total_settled_vnd', v_total_settled_vnd,
                'settled_orders_count', array_length(v_settled_order_ids, 1),
                'settled_order_ids', to_jsonb(v_settled_order_ids),
                'new_visit_version', v_updated_visit.version
            )
        ),
        now()
    );

    -- 10. Build receipt
    v_receipt := jsonb_build_object(
        'batch_id', v_batch_id,
        'visit_id', p_visit_id,
        'visit_version', v_updated_visit.version,
        'method', p_method,
        'payment_method', p_method,
        'settled_orders_count', array_length(v_settled_order_ids, 1),
        'settled_order_ids', to_jsonb(v_settled_order_ids),
        'total_settled_vnd', v_total_settled_vnd,
        'total_amount_vnd', v_total_settled_vnd,
        'settled_at', now()
    );

    -- 11. Save Idempotency Request Record if key provided
    IF p_idempotency_key_hash IS NOT NULL THEN
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
            'settle_visit',
            p_idempotency_key_hash,
            p_actor_scope,
            p_request_hash,
            p_visit_id,
            v_receipt,
            now(),
            now() + interval '24 hours'
        );
    END IF;

    RETURN jsonb_build_object(
        'replayed', false,
        'receipt', v_receipt
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. Update transition_order_status with paid order cancellation/rejection guard
-- ------------------------------------------------------------------------------
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
BEGIN
    -- 1. Lock the order row FOR UPDATE
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

    -- 6. Update orders table
    UPDATE public.orders
    SET status = p_target_status,
        version = version + 1,
        confirmed_at = CASE WHEN p_target_status = 'confirmed' THEN COALESCE(confirmed_at, now()) ELSE confirmed_at END,
        completed_at = CASE WHEN p_target_status = 'completed' THEN now() ELSE completed_at END,
        cancelled_at = CASE WHEN p_target_status IN ('cancelled', 'rejected') THEN now() ELSE cancelled_at END,
        updated_at = now()
    WHERE id = p_order_id AND version = p_expected_version
    RETURNING *
    INTO v_updated;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'VERSION_CONFLICT: Cập nhật đơn hàng thất bại do xung đột phiên bản'
            USING ERRCODE = 'P0003';
    END IF;

    -- 7. Record in order_status_history
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
        NULLIF(v_clean_reason, ''),
        now()
    );

    -- 8. Record in audit_logs
    INSERT INTO public.audit_logs (
        id,
        admin_id,
        actor_kind,
        action,
        entity_type,
        entity_id,
        metadata,
        created_at
    ) VALUES (
        gen_random_uuid(),
        p_actor_admin_id,
        'admin',
        'transition_order_status',
        'order',
        p_order_id,
        jsonb_build_object(
            'old_data', jsonb_build_object('status', v_order.status, 'version', v_order.version),
            'new_data', jsonb_build_object('status', v_updated.status, 'version', v_updated.version, 'reason', v_clean_reason)
        ),
        now()
    );

    RETURN to_jsonb(v_updated);
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. Update close_table_visit with terminal orders and refund integrity checks
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_table_visit(
    p_visit_id uuid,
    p_expected_version int,
    p_admin_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_visit public.table_visits%ROWTYPE;
    v_non_terminal_count int;
    v_unpaid_count int;
    v_unrefunded_paid_count int;
    v_updated_visit public.table_visits%ROWTYPE;
BEGIN
    -- 1. Lock visit row FOR UPDATE
    SELECT * INTO v_visit
    FROM public.table_visits
    WHERE id = p_visit_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'VISIT_NOT_FOUND: Phiên phục vụ không tồn tại'
            USING ERRCODE = 'P0002';
    END IF;

    IF v_visit.status != 'open' THEN
        RAISE EXCEPTION 'VISIT_ALREADY_CLOSED: Phiên phục vụ này đã đóng'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_visit.version != p_expected_version THEN
        RAISE EXCEPTION 'VERSION_CONFLICT: Phiên phục vụ đã bị thay đổi bởi người khác'
            USING ERRCODE = 'P0003';
    END IF;

    -- 2. Validate all orders are in terminal states ('completed', 'cancelled', 'rejected')
    SELECT count(*) INTO v_non_terminal_count
    FROM public.orders
    WHERE table_visit_id = p_visit_id
      AND status NOT IN ('completed', 'cancelled', 'rejected');

    IF v_non_terminal_count > 0 THEN
        RAISE EXCEPTION 'VISIT_HAS_ACTIVE_ORDERS: Không thể đóng phiên khi còn % đơn chưa hoàn tất (cần hoàn tất hoặc hủy trước khi đóng bàn)', v_non_terminal_count
            USING ERRCODE = 'P0004';
    END IF;

    -- 3. Validate no unpaid orders (excluding cancelled/rejected)
    SELECT count(*) INTO v_unpaid_count
    FROM public.orders
    WHERE table_visit_id = p_visit_id
      AND payment_status = 'unpaid'
      AND status NOT IN ('cancelled', 'rejected');

    IF v_unpaid_count > 0 THEN
        RAISE EXCEPTION 'VISIT_NOT_SETTLED: Không thể đóng phiên khi còn % đơn chưa thanh toán', v_unpaid_count
            USING ERRCODE = 'P0004';
    END IF;

    -- 4. Validate no unrefunded paid orders that were cancelled/rejected
    SELECT count(*) INTO v_unrefunded_paid_count
    FROM public.orders
    WHERE table_visit_id = p_visit_id
      AND payment_status = 'paid'
      AND status IN ('cancelled', 'rejected');

    IF v_unrefunded_paid_count > 0 THEN
        RAISE EXCEPTION 'VISIT_HAS_PENDING_REFUNDS: Không thể đóng phiên khi còn % đơn đã thanh toán bị hủy chưa hoàn tiền', v_unrefunded_paid_count
            USING ERRCODE = 'P0029';
    END IF;

    -- 5. Update visit: status closed, closed_at now, bump capability_epoch, increment version
    UPDATE public.table_visits
    SET status = 'closed',
        closed_at = now(),
        capability_epoch = capability_epoch + 1,
        version = version + 1,
        updated_at = now()
    WHERE id = p_visit_id
    RETURNING * INTO v_updated_visit;

    -- 6. Audit log entry
    INSERT INTO public.audit_logs (
        admin_id,
        actor_kind,
        action,
        entity_type,
        entity_id,
        metadata,
        created_at
    ) VALUES (
        p_admin_id,
        'admin',
        'close_table_visit',
        'table_visit',
        p_visit_id,
        jsonb_build_object(
            'old_data', to_jsonb(v_visit),
            'new_data', to_jsonb(v_updated_visit)
        ),
        now()
    );

    RETURN to_jsonb(v_updated_visit);
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. Grants and Security
-- ------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.record_order_payment FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_order_payment TO service_role, postgres;

REVOKE EXECUTE ON FUNCTION public.settle_table_visit FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_table_visit TO service_role, postgres;

REVOKE EXECUTE ON FUNCTION public.close_table_visit FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_table_visit TO service_role, postgres;
