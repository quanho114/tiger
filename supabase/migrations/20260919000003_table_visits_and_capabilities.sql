-- ==============================================================================
-- Tiger 345 - Table Visits, QR Rotation & Capability Lifecycle Migration (T06)
-- Provides transactional RPCs for:
--  1. open_table_visit
--  2. close_table_visit
--  3. rotate_table_qr
--  4. dining_tables deactivation guard trigger
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Guard trigger: Prevent deactivating table when open visit exists
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_dining_table_deactivation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.active = true AND NEW.active = false THEN
        IF EXISTS (
            SELECT 1 FROM public.table_visits
            WHERE table_id = NEW.id AND status = 'open'
        ) THEN
            RAISE EXCEPTION 'TABLE_HAS_ACTIVE_VISIT: Không thể vô hiệu hóa bàn khi phiên phục vụ còn đang mở'
                USING ERRCODE = 'P0005';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dining_tables_deactivate_guard ON public.dining_tables;
CREATE TRIGGER trg_dining_tables_deactivate_guard
    BEFORE UPDATE ON public.dining_tables
    FOR EACH ROW
    EXECUTE FUNCTION check_dining_table_deactivation();

-- ------------------------------------------------------------------------------
-- 2. RPC: open_table_visit
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_table_visit(
    p_table_id uuid,
    p_admin_id uuid,
    p_expected_table_version int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_table public.dining_tables%ROWTYPE;
    v_existing_visit_id uuid;
    v_new_visit public.table_visits%ROWTYPE;
BEGIN
    -- 1. Lock table row
    SELECT * INTO v_table
    FROM public.dining_tables
    WHERE id = p_table_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'TABLE_NOT_FOUND: Bàn không tồn tại'
            USING ERRCODE = 'P0002';
    END IF;

    IF NOT v_table.active THEN
        RAISE EXCEPTION 'TABLE_UNAVAILABLE: Bàn hiện đang tạm ngưng phục vụ'
            USING ERRCODE = 'P0001';
    END IF;

    IF p_expected_table_version IS NOT NULL AND v_table.version != p_expected_table_version THEN
        RAISE EXCEPTION 'VERSION_CONFLICT: Thông tin bàn đã bị thay đổi (version mismatch)'
            USING ERRCODE = 'P0003';
    END IF;

    -- 2. Check for existing open visit on this table
    SELECT id INTO v_existing_visit_id
    FROM public.table_visits
    WHERE table_id = p_table_id AND status = 'open'
    FOR UPDATE;

    IF FOUND THEN
        RAISE EXCEPTION 'VISIT_ALREADY_OPEN: Bàn đã có phiên phục vụ đang mở'
            USING ERRCODE = '23505';
    END IF;

    -- 3. Insert new visit
    INSERT INTO public.table_visits (
        id,
        table_id,
        status,
        capability_epoch,
        opened_by_admin_id,
        opened_at,
        version
    ) VALUES (
        gen_random_uuid(),
        p_table_id,
        'open',
        1,
        p_admin_id,
        now(),
        1
    )
    RETURNING * INTO v_new_visit;

    -- 4. Audit log entry
    INSERT INTO public.audit_logs (
        admin_id,
        actor_kind,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        p_admin_id,
        'admin',
        'open_visit',
        'table_visit',
        v_new_visit.id::text,
        jsonb_build_object(
            'table_id', p_table_id,
            'table_code', v_table.code,
            'table_name', v_table.name
        )
    );

    RETURN to_jsonb(v_new_visit);
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. RPC: close_table_visit
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
    v_active_orders_count int;
    v_unpaid_orders_count int;
    v_updated_visit public.table_visits%ROWTYPE;
BEGIN
    -- 1. Lock visit row
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

    -- 2. Validate terminal state of orders
    SELECT count(*) INTO v_active_orders_count
    FROM public.orders
    WHERE table_visit_id = p_visit_id
      AND status NOT IN ('completed', 'cancelled');

    IF v_active_orders_count > 0 THEN
        RAISE EXCEPTION 'VISIT_NOT_SETTLED: Không thể đóng phiên khi còn % đơn chưa hoàn tất', v_active_orders_count
            USING ERRCODE = 'P0004';
    END IF;

    -- 3. Validate payment state of orders (all non-cancelled orders must be paid)
    SELECT count(*) INTO v_unpaid_orders_count
    FROM public.orders
    WHERE table_visit_id = p_visit_id
      AND payment_status = 'unpaid'
      AND status != 'cancelled';

    IF v_unpaid_orders_count > 0 THEN
        RAISE EXCEPTION 'VISIT_NOT_SETTLED: Không thể đóng phiên khi còn % đơn chưa thanh toán', v_unpaid_orders_count
            USING ERRCODE = 'P0004';
    END IF;

    -- 4. Update visit: status closed, closed_at now, bump capability_epoch, increment version
    UPDATE public.table_visits
    SET status = 'closed',
        closed_at = now(),
        capability_epoch = capability_epoch + 1,
        version = version + 1,
        updated_at = now()
    WHERE id = p_visit_id
    RETURNING * INTO v_updated_visit;

    -- 5. Audit log entry
    INSERT INTO public.audit_logs (
        admin_id,
        actor_kind,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        p_admin_id,
        'admin',
        'close_visit',
        'table_visit',
        v_updated_visit.id::text,
        jsonb_build_object(
            'table_id', v_updated_visit.table_id,
            'capability_epoch', v_updated_visit.capability_epoch,
            'version', v_updated_visit.version
        )
    );

    RETURN to_jsonb(v_updated_visit);
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. RPC: rotate_table_qr
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rotate_table_qr(
    p_table_id uuid,
    p_token_hash text,
    p_admin_id uuid DEFAULT NULL,
    p_expected_table_version int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_table public.dining_tables%ROWTYPE;
    v_new_qr_id uuid;
    v_epoch_bumped boolean := false;
BEGIN
    -- 1. Lock table row
    SELECT * INTO v_table
    FROM public.dining_tables
    WHERE id = p_table_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'TABLE_NOT_FOUND: Bàn không tồn tại'
            USING ERRCODE = 'P0002';
    END IF;

    IF p_expected_table_version IS NOT NULL AND v_table.version != p_expected_table_version THEN
        RAISE EXCEPTION 'VERSION_CONFLICT: Thông tin bàn đã bị thay đổi'
            USING ERRCODE = 'P0003';
    END IF;

    -- 2. Deactivate previous active QR tokens
    UPDATE public.table_qr_tokens
    SET active = false,
        rotated_at = now()
    WHERE table_id = p_table_id AND active = true;

    -- 3. Insert new active token
    INSERT INTO public.table_qr_tokens (
        id,
        table_id,
        token_hash,
        active,
        created_at
    ) VALUES (
        gen_random_uuid(),
        p_table_id,
        p_token_hash,
        true,
        now()
    )
    RETURNING id INTO v_new_qr_id;

    -- 4. If table has an open visit, bump capability_epoch to revoke capabilities atomically
    UPDATE public.table_visits
    SET capability_epoch = capability_epoch + 1,
        version = version + 1,
        updated_at = now()
    WHERE table_id = p_table_id AND status = 'open';

    IF FOUND THEN
        v_epoch_bumped := true;
    END IF;

    -- 5. Audit log entry
    INSERT INTO public.audit_logs (
        admin_id,
        actor_kind,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        p_admin_id,
        'admin',
        'rotate_qr',
        'dining_table',
        p_table_id::text,
        jsonb_build_object(
            'qr_token_id', v_new_qr_id,
            'epoch_bumped', v_epoch_bumped
        )
    );

    RETURN jsonb_build_object(
        'qr_token_id', v_new_qr_id,
        'table_id', p_table_id,
        'epoch_bumped', v_epoch_bumped
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. Security & Grants
-- ------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.open_table_visit(uuid, uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.open_table_visit(uuid, uuid, int) TO service_role;

REVOKE EXECUTE ON FUNCTION public.close_table_visit(uuid, int, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_table_visit(uuid, int, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.rotate_table_qr(uuid, text, uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_table_qr(uuid, text, uuid, int) TO service_role;
