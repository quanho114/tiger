-- ==============================================================================
-- Migration: 20260919000005_admin_order_transitions.sql
-- Description: Order state transitions & internal notes with optimistic concurrency
-- Enforces:
-- 1. State machine graph per order_type:
--    dine_in:  pending -> confirmed -> preparing -> served -> completed
--    delivery: pending -> confirmed -> preparing -> delivering -> completed
--    both:     pending -> rejected | cancelled; confirmed -> cancelled
-- 2. Transition to completed requires payment_status = 'paid' (raises PAYMENT_REQUIRED P0018)
-- 3. Terminal state invariant: completed, cancelled, rejected cannot transition further (P0019)
-- 4. Optimistic locking with expected_version (raises VERSION_CONFLICT P0003)
-- 5. Atomic status history and audit logging
-- ==============================================================================

-- 1. Ensure status check constraints include 'rejected'
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
    CHECK (status IN ('pending', 'confirmed', 'preparing', 'served', 'delivering', 'completed', 'cancelled', 'rejected'));

ALTER TABLE public.order_status_history DROP CONSTRAINT IF EXISTS order_status_history_from_status_check;
ALTER TABLE public.order_status_history ADD CONSTRAINT order_status_history_from_status_check
    CHECK (from_status IS NULL OR from_status IN ('pending', 'confirmed', 'preparing', 'served', 'delivering', 'completed', 'cancelled', 'rejected'));

ALTER TABLE public.order_status_history DROP CONSTRAINT IF EXISTS order_status_history_to_status_check;
ALTER TABLE public.order_status_history ADD CONSTRAINT order_status_history_to_status_check
    CHECK (to_status IN ('pending', 'confirmed', 'preparing', 'served', 'delivering', 'completed', 'cancelled', 'rejected'));

-- 2. RPC function: transition_order_status
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
SET search_path = public
AS $$
DECLARE
    v_order record;
    v_updated record;
    v_clean_reason text;
    v_is_valid_transition boolean := false;
BEGIN
    v_clean_reason := trim(COALESCE(p_reason, ''));

    -- 1. Lock order FOR UPDATE to serialize concurrent transition attempts
    SELECT *
    INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Đơn hàng không tồn tại'
            USING ERRCODE = 'P0002';
    END IF;

    -- 2. Optimistic concurrency check
    IF v_order.version != p_expected_version THEN
        RAISE EXCEPTION USING ERRCODE = 'P0003',
            MESSAGE = format('VERSION_CONFLICT: Đơn hàng đã được cập nhật bởi quản trị viên khác (version hiện tại: %s, expected: %s)', v_order.version, p_expected_version);
    END IF;

    -- 3. Terminal state check
    IF v_order.status IN ('completed', 'cancelled', 'rejected') THEN
        RAISE EXCEPTION USING ERRCODE = 'P0019',
            MESSAGE = format('ORDER_TERMINAL: Đơn hàng đã ở trạng thái kết thúc (%s), không thể chuyển trạng thái tiếp', v_order.status);
    END IF;

    -- 4. Validate State Graph according to order_type
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

    -- 5. Update orders table
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

    -- 6. Record in order_status_history
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

    -- 7. Record in audit_logs
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
        'orders',
        p_order_id::text,
        jsonb_build_object(
            'code', v_updated.code,
            'order_type', v_updated.order_type,
            'from_status', v_order.status,
            'to_status', p_target_status,
            'reason', NULLIF(v_clean_reason, ''),
            'old_version', v_order.version,
            'new_version', v_updated.version
        ),
        now()
    );

    RETURN jsonb_build_object(
        'id', v_updated.id,
        'code', v_updated.code,
        'order_type', v_updated.order_type,
        'status', v_updated.status,
        'payment_status', v_updated.payment_status,
        'version', v_updated.version,
        'confirmed_at', v_updated.confirmed_at,
        'completed_at', v_updated.completed_at,
        'cancelled_at', v_updated.cancelled_at,
        'updated_at', v_updated.updated_at
    );
END;
$$;

-- 3. RPC function: update_order_internal_note
CREATE OR REPLACE FUNCTION public.update_order_internal_note(
    p_order_id uuid,
    p_expected_version int,
    p_internal_note text,
    p_actor_admin_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order record;
    v_updated record;
    v_clean_note text;
BEGIN
    v_clean_note := trim(COALESCE(p_internal_note, ''));

    SELECT *
    INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Đơn hàng không tồn tại'
            USING ERRCODE = 'P0002';
    END IF;

    IF v_order.version != p_expected_version THEN
        RAISE EXCEPTION USING ERRCODE = 'P0003',
            MESSAGE = format('VERSION_CONFLICT: Đơn hàng đã được cập nhật bởi quản trị viên khác (version hiện tại: %s, expected: %s)', v_order.version, p_expected_version);
    END IF;

    UPDATE public.orders
    SET internal_note = v_clean_note,
        version = version + 1,
        updated_at = now()
    WHERE id = p_order_id AND version = p_expected_version
    RETURNING *
    INTO v_updated;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'VERSION_CONFLICT: Cập nhật ghi chú thất bại do xung đột phiên bản'
            USING ERRCODE = 'P0003';
    END IF;

    -- Record audit log without PII
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
        'update_order_internal_note',
        'orders',
        p_order_id::text,
        jsonb_build_object(
            'code', v_updated.code,
            'old_version', v_order.version,
            'new_version', v_updated.version
        ),
        now()
    );

    RETURN jsonb_build_object(
        'id', v_updated.id,
        'code', v_updated.code,
        'internal_note', v_updated.internal_note,
        'version', v_updated.version,
        'updated_at', v_updated.updated_at
    );
END;
$$;

-- Security grant: callable by service_role and postgres only
REVOKE EXECUTE ON FUNCTION public.transition_order_status FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_order_status TO service_role, postgres;

REVOKE EXECUTE ON FUNCTION public.update_order_internal_note FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_internal_note TO service_role, postgres;
