-- ==============================================================================
-- Migration: 20260920000003_reservation_engine.sql
-- Description: Core Reservation Engine with Idempotency, Timing Checks, and Admin Transitions
-- Task: T12 (Invariants V15, V16, V24)
-- Enforces:
-- 1. Reservation State Machine:
--    pending -> confirmed | rejected | cancelled
--    confirmed -> seated | no_show | cancelled
--    seated -> completed
-- 2. Notice Window & Max Days Ahead in Asia/Ho_Chi_Minh (UTC+7)
-- 3. Business Closures & Operating Hours Validation
-- 4. Idempotency Key Retention with Advisory Lock
-- 5. Optimistic Concurrency Control (expected_version)
-- 6. No-show Grace Period Enforcement (reservation_no_show_grace_minutes)
-- 7. Audit Logging without PII exposure
-- ==============================================================================

-- 1. Ensure status check constraint includes all state machine values
ALTER TABLE public.reservations DROP CONSTRAINT IF EXISTS reservations_status_check;
ALTER TABLE public.reservations ADD CONSTRAINT reservations_status_check
    CHECK (status IN ('pending', 'confirmed', 'rejected', 'cancelled', 'seated', 'completed', 'no_show'));

-- 2. RPC: create_reservation
CREATE OR REPLACE FUNCTION public.create_reservation(
    p_idempotency_key_hash text,
    p_request_hash text,
    p_actor_scope text,
    p_customer_name text,
    p_customer_phone text,
    p_starts_at timestamptz,
    p_guest_count int,
    p_seating_area_id uuid DEFAULT NULL,
    p_note text DEFAULT '',
    p_customer_user_id uuid DEFAULT NULL,
    p_reference_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_existing_response jsonb;
    v_existing_actor text;
    v_existing_req_hash text;
    v_settings record;
    v_now timestamptz;
    v_min_notice int;
    v_max_days int;
    v_duration int;
    v_ends_at timestamptz;
    v_vn_date date;
    v_weekday int;
    v_start_time time;
    v_end_time time;
    v_closure record;
    v_res_hours record;
    v_rest_hours record;
    v_area record;
    v_area_name_snapshot text := NULL;
    v_res_code text;
    v_new_id uuid;
    v_new_created_at timestamptz;
    v_receipt jsonb;
    v_clean_name text;
    v_clean_phone text;
BEGIN
    v_clean_name := trim(COALESCE(p_customer_name, ''));
    v_clean_phone := trim(COALESCE(p_customer_phone, ''));

    IF length(v_clean_name) < 2 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Tên khách hàng phải có ít nhất 2 ký tự'
            USING ERRCODE = 'P0012';
    END IF;

    IF length(v_clean_phone) < 9 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Số điện thoại không hợp lệ'
            USING ERRCODE = 'P0012';
    END IF;

    IF p_guest_count < 1 OR p_guest_count > 30 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Số lượng khách phải từ 1 đến 30 người'
            USING ERRCODE = 'P0012';
    END IF;

    -- 1. Advisory transaction lock on idempotency key to prevent concurrent duplicate inserts
    PERFORM pg_advisory_xact_lock(hashtext('idempotency:create_reservation:' || p_idempotency_key_hash));

    -- 2. Idempotency Check (before business checks to safely replay committed reservations)
    SELECT response_json, actor_scope, request_hash
    INTO v_existing_response, v_existing_actor, v_existing_req_hash
    FROM public.idempotency_requests
    WHERE operation = 'create_reservation' AND key_hash = p_idempotency_key_hash;

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

    -- 3. Lock restaurant_settings row FOR SHARE
    SELECT
        booking_enabled,
        reservation_min_notice_minutes,
        reservation_max_days_ahead,
        reservation_duration_minutes,
        reservation_cancel_notice_minutes,
        reservation_no_show_grace_minutes
    INTO v_settings
    FROM public.restaurant_settings
    WHERE id = 1
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'SERVICE_CLOSED: Cấu hình nhà hàng không tìm thấy'
            USING ERRCODE = 'P0011';
    END IF;

    IF NOT v_settings.booking_enabled THEN
        RAISE EXCEPTION 'BOOKING_DISABLED: Quán hiện đang tạm ngưng nhận đặt bàn trực tuyến'
            USING ERRCODE = 'P0020';
    END IF;

    -- 4. Timing validations in Asia/Ho_Chi_Minh
    v_now := COALESCE(p_reference_now, now());
    v_min_notice := COALESCE(v_settings.reservation_min_notice_minutes, 30);
    v_max_days := COALESCE(v_settings.reservation_max_days_ahead, 30);
    v_duration := COALESCE(v_settings.reservation_duration_minutes, 120);

    -- Notice window check
    IF p_starts_at < (v_now + (v_min_notice * interval '1 minute')) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0021',
            MESSAGE = format('RESERVATION_NOTICE_TOO_SHORT: Thời gian đặt bàn phải trước giờ bắt đầu tối thiểu %s phút', v_min_notice);
    END IF;

    -- Max advance booking check
    IF p_starts_at > (v_now + (v_max_days * interval '1 day')) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0022',
            MESSAGE = format('RESERVATION_TOO_FAR_AHEAD: Quán chỉ nhận đặt bàn trước tối đa %s ngày', v_max_days);
    END IF;

    v_ends_at := p_starts_at + (v_duration * interval '1 minute');

    -- 5. Business Closures check
    v_vn_date := (p_starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
    SELECT reason
    INTO v_closure
    FROM public.business_closures
    WHERE date = v_vn_date AND service_type IN ('reservation', 'restaurant', 'all')
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0011',
            MESSAGE = format('SERVICE_CLOSED: Quán tạm ngưng nhận đặt bàn vào ngày %s%s', v_vn_date, CASE WHEN v_closure.reason IS NOT NULL AND length(v_closure.reason) > 0 THEN ': ' || v_closure.reason ELSE '' END);
    END IF;

    -- 6. Business Hours check
    v_weekday := EXTRACT(DOW FROM (p_starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh'))::int;
    v_start_time := (p_starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::time;
    v_end_time := (v_ends_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::time;

    -- Check reservation intake window
    SELECT open_time, close_time
    INTO v_res_hours
    FROM public.business_hours
    WHERE weekday = v_weekday AND service_type = 'reservation' AND active = true;

    IF NOT FOUND OR v_start_time < v_res_hours.open_time OR v_start_time > v_res_hours.close_time THEN
        RAISE EXCEPTION 'SERVICE_CLOSED: Thời gian đặt bàn nằm ngoài khung giờ nhận đặt bàn của quán'
            USING ERRCODE = 'P0011';
    END IF;

    -- Check restaurant overall operating hours (ends_at must not exceed closing time)
    SELECT open_time, close_time
    INTO v_rest_hours
    FROM public.business_hours
    WHERE weekday = v_weekday AND service_type = 'restaurant' AND active = true;

    IF NOT FOUND OR v_end_time > v_rest_hours.close_time THEN
        RAISE EXCEPTION 'SERVICE_CLOSED: Thời gian dùng bữa dự kiến kết thúc sau giờ đóng cửa của nhà hàng'
            USING ERRCODE = 'P0011';
    END IF;

    -- 7. Seating area check
    IF p_seating_area_id IS NOT NULL THEN
        SELECT id, name, active
        INTO v_area
        FROM public.seating_areas
        WHERE id = p_seating_area_id
        FOR SHARE;

        IF NOT FOUND OR NOT v_area.active THEN
            RAISE EXCEPTION 'AREA_UNAVAILABLE: Khu vực ngồi không tồn tại hoặc tạm ngưng phục vụ'
                USING ERRCODE = 'P0001';
        END IF;

        v_area_name_snapshot := v_area.name;
    END IF;

    -- 8. Generate reservation code: TG-RESV-YYMMDD-XXXX
    v_res_code := 'TG-RESV-' || to_char(p_starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));

    -- 9. Insert reservation row (Initial status is strictly 'pending')
    INSERT INTO public.reservations (
        code,
        customer_user_id,
        customer_name,
        customer_phone,
        starts_at,
        ends_at,
        guest_count,
        seating_area_id,
        area_name_snapshot,
        status,
        note,
        internal_note,
        version
    ) VALUES (
        v_res_code,
        p_customer_user_id,
        v_clean_name,
        v_clean_phone,
        p_starts_at,
        v_ends_at,
        p_guest_count,
        p_seating_area_id,
        v_area_name_snapshot,
        'pending',
        COALESCE(trim(p_note), ''),
        '',
        1
    ) RETURNING id, created_at INTO v_new_id, v_new_created_at;

    -- 10. Construct receipt payload
    v_receipt := jsonb_build_object(
        'id', v_new_id,
        'code', v_res_code,
        'customer_name', v_clean_name,
        'customer_phone', v_clean_phone,
        'starts_at', p_starts_at,
        'ends_at', v_ends_at,
        'guest_count', p_guest_count,
        'seating_area_id', p_seating_area_id,
        'area_name_snapshot', v_area_name_snapshot,
        'status', 'pending',
        'note', COALESCE(trim(p_note), ''),
        'version', 1,
        'created_at', v_new_created_at
    );

    -- 11. Save idempotency record
    INSERT INTO public.idempotency_requests (
        operation,
        key_hash,
        actor_scope,
        request_hash,
        result_id,
        response_json,
        expires_at
    ) VALUES (
        'create_reservation',
        p_idempotency_key_hash,
        p_actor_scope,
        p_request_hash,
        v_new_id,
        v_receipt,
        now() + interval '24 hours'
    );

    -- 12. Record audit log
    INSERT INTO public.audit_logs (
        actor_kind,
        admin_id,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        CASE WHEN p_customer_user_id IS NOT NULL THEN 'customer' ELSE 'system' END,
        NULL,
        'create_reservation',
        'reservation',
        v_new_id,
        jsonb_build_object(
            'code', v_res_code,
            'starts_at', p_starts_at,
            'guest_count', p_guest_count,
            'area_name', v_area_name_snapshot
        )
    );

    RETURN jsonb_build_object(
        'replayed', false,
        'receipt', v_receipt
    );
END;
$$;

-- 3. RPC: transition_reservation
CREATE OR REPLACE FUNCTION public.transition_reservation(
    p_reservation_id uuid,
    p_expected_version int,
    p_target_status text,
    p_actor_admin_id uuid DEFAULT NULL,
    p_reason text DEFAULT NULL,
    p_reference_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_res record;
    v_settings record;
    v_updated record;
    v_clean_reason text;
    v_is_valid boolean := false;
    v_now timestamptz;
    v_grace_cutoff timestamptz;
    v_cancel_cutoff timestamptz;
BEGIN
    v_clean_reason := trim(COALESCE(p_reason, ''));

    -- 1. Lock reservation row FOR UPDATE to serialize concurrent transition attempts
    SELECT *
    INTO v_res
    FROM public.reservations
    WHERE id = p_reservation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Đặt bàn không tồn tại'
            USING ERRCODE = 'P0002';
    END IF;

    -- 2. Optimistic concurrency check
    IF v_res.version != p_expected_version THEN
        RAISE EXCEPTION USING ERRCODE = 'P0003',
            MESSAGE = format('VERSION_CONFLICT: Đặt bàn đã được cập nhật bởi quản trị viên khác (version hiện tại: %s, expected: %s)', v_res.version, p_expected_version);
    END IF;

    -- 3. Terminal state check
    IF v_res.status IN ('rejected', 'cancelled', 'completed', 'no_show') THEN
        RAISE EXCEPTION USING ERRCODE = 'P0019',
            MESSAGE = format('RESERVATION_TERMINAL: Đặt bàn đã ở trạng thái kết thúc (%s), không thể chuyển trạng thái tiếp', v_res.status);
    END IF;

    -- 4. Load restaurant settings for grace and notice checks
    SELECT reservation_no_show_grace_minutes, reservation_cancel_notice_minutes
    INTO v_settings
    FROM public.restaurant_settings
    WHERE id = 1
    FOR SHARE;

    v_now := COALESCE(p_reference_now, now());

    -- 5. Validate state transitions
    IF v_res.status = 'pending' THEN
        IF p_target_status = 'confirmed' THEN
            v_is_valid := true;
        ELSIF p_target_status IN ('rejected', 'cancelled') THEN
            v_is_valid := true;
            IF length(v_clean_reason) = 0 THEN
                v_clean_reason := CASE WHEN p_target_status = 'rejected' THEN 'Quán từ chối tiếp nhận đặt bàn' ELSE 'Hủy đặt bàn' END;
            END IF;
        END IF;
    ELSIF v_res.status = 'confirmed' THEN
        IF p_target_status = 'seated' THEN
            v_is_valid := true;
        ELSIF p_target_status = 'no_show' THEN
            -- Invariant V16: no_show grace period enforcement
            v_grace_cutoff := v_res.starts_at + (COALESCE(v_settings.reservation_no_show_grace_minutes, 15) * interval '1 minute');
            IF v_now < v_grace_cutoff THEN
                RAISE EXCEPTION USING ERRCODE = 'P0023',
                    MESSAGE = format('NO_SHOW_GRACE_ACTIVE: Chưa qua thời gian ân hạn vắng mặt (%s phút sau giờ hẹn: %s). Hiện tại là %s',
                        COALESCE(v_settings.reservation_no_show_grace_minutes, 15),
                        to_char(v_grace_cutoff AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI'),
                        to_char(v_now AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI'));
            END IF;
            v_is_valid := true;
            IF length(v_clean_reason) = 0 THEN
                v_clean_reason := 'Khách không đến nhận bàn sau thời gian ân hạn';
            END IF;
        ELSIF p_target_status = 'cancelled' THEN
            -- If customer cancels directly, check cancel notice cutoff
            IF p_actor_admin_id IS NULL THEN
                v_cancel_cutoff := v_res.starts_at - (COALESCE(v_settings.reservation_cancel_notice_minutes, 60) * interval '1 minute');
                IF v_now > v_cancel_cutoff THEN
                    RAISE EXCEPTION USING ERRCODE = 'P0024',
                        MESSAGE = format('CANCEL_NOTICE_EXPIRED: Đã quá thời hạn tự hủy đặt bàn (%s phút trước giờ hẹn). Vui lòng liên hệ trực tiếp hotline nhà hàng.',
                            COALESCE(v_settings.reservation_cancel_notice_minutes, 60));
                END IF;
            END IF;
            v_is_valid := true;
            IF length(v_clean_reason) = 0 THEN
                v_clean_reason := 'Hủy đặt bàn sau khi đã xác nhận';
            END IF;
        END IF;
    ELSIF v_res.status = 'seated' THEN
        IF p_target_status = 'completed' THEN
            v_is_valid := true;
        END IF;
    END IF;

    IF NOT v_is_valid THEN
        RAISE EXCEPTION USING ERRCODE = 'P0004',
            MESSAGE = format('INVALID_TRANSITION: Không thể chuyển trạng thái đặt bàn từ "%s" sang "%s"', v_res.status, p_target_status);
    END IF;

    -- 6. Apply state update and increment version
    UPDATE public.reservations
    SET
        status = p_target_status,
        version = version + 1,
        updated_at = now()
    WHERE id = p_reservation_id
    RETURNING * INTO v_updated;

    -- 7. Audit log (safe metadata without PII)
    INSERT INTO public.audit_logs (
        actor_kind,
        admin_id,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        CASE WHEN p_actor_admin_id IS NOT NULL THEN 'admin' ELSE 'customer' END,
        p_actor_admin_id,
        'reservation_transition',
        'reservation',
        p_reservation_id,
        jsonb_build_object(
            'from_status', v_res.status,
            'to_status', p_target_status,
            'reason', v_clean_reason,
            'version', v_updated.version
        )
    );

    RETURN jsonb_build_object(
        'id', v_updated.id,
        'code', v_updated.code,
        'status', v_updated.status,
        'version', v_updated.version,
        'updated_at', v_updated.updated_at
    );
END;
$$;

-- 4. RPC: update_reservation_contact
CREATE OR REPLACE FUNCTION public.update_reservation_contact(
    p_reservation_id uuid,
    p_expected_version int,
    p_outcome text,
    p_actor_admin_id uuid,
    p_contacted_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_res record;
    v_updated record;
    v_clean_outcome text;
BEGIN
    v_clean_outcome := trim(COALESCE(p_outcome, ''));

    IF length(v_clean_outcome) = 0 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Kết quả liên hệ không được để trống'
            USING ERRCODE = 'P0012';
    END IF;

    -- Lock reservation row FOR UPDATE
    SELECT *
    INTO v_res
    FROM public.reservations
    WHERE id = p_reservation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Đặt bàn không tồn tại'
            USING ERRCODE = 'P0002';
    END IF;

    IF v_res.version != p_expected_version THEN
        RAISE EXCEPTION USING ERRCODE = 'P0003',
            MESSAGE = format('VERSION_CONFLICT: Đặt bàn đã được cập nhật bởi quản trị viên khác (version hiện tại: %s, expected: %s)', v_res.version, p_expected_version);
    END IF;

    UPDATE public.reservations
    SET
        contact_outcome = v_clean_outcome,
        contacted_at = COALESCE(p_contacted_at, now()),
        version = version + 1,
        updated_at = now()
    WHERE id = p_reservation_id
    RETURNING * INTO v_updated;

    INSERT INTO public.audit_logs (
        actor_kind,
        admin_id,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        'admin',
        p_actor_admin_id,
        'reservation_contact_update',
        'reservation',
        p_reservation_id,
        jsonb_build_object(
            'outcome', v_clean_outcome,
            'contacted_at', v_updated.contacted_at,
            'version', v_updated.version
        )
    );

    RETURN jsonb_build_object(
        'id', v_updated.id,
        'code', v_updated.code,
        'contact_outcome', v_updated.contact_outcome,
        'contacted_at', v_updated.contacted_at,
        'version', v_updated.version
    );
END;
$$;

-- 5. RPC: update_reservation_internal_note
CREATE OR REPLACE FUNCTION public.update_reservation_internal_note(
    p_reservation_id uuid,
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
    v_res record;
    v_updated record;
    v_clean_note text;
BEGIN
    v_clean_note := trim(COALESCE(p_internal_note, ''));

    -- Lock reservation row FOR UPDATE
    SELECT *
    INTO v_res
    FROM public.reservations
    WHERE id = p_reservation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Đặt bàn không tồn tại'
            USING ERRCODE = 'P0002';
    END IF;

    IF v_res.version != p_expected_version THEN
        RAISE EXCEPTION USING ERRCODE = 'P0003',
            MESSAGE = format('VERSION_CONFLICT: Đặt bàn đã được cập nhật bởi quản trị viên khác (version hiện tại: %s, expected: %s)', v_res.version, p_expected_version);
    END IF;

    UPDATE public.reservations
    SET
        internal_note = v_clean_note,
        version = version + 1,
        updated_at = now()
    WHERE id = p_reservation_id
    RETURNING * INTO v_updated;

    INSERT INTO public.audit_logs (
        actor_kind,
        admin_id,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        'admin',
        p_actor_admin_id,
        'reservation_internal_note_update',
        'reservation',
        p_reservation_id,
        jsonb_build_object(
            'version', v_updated.version
        )
    );

    RETURN jsonb_build_object(
        'id', v_updated.id,
        'code', v_updated.code,
        'internal_note', v_updated.internal_note,
        'version', v_updated.version
    );
END;
$$;

-- 6. Permissions and Security
REVOKE EXECUTE ON FUNCTION public.create_reservation FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.transition_reservation FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_reservation_contact FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_reservation_internal_note FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_reservation TO service_role;
GRANT EXECUTE ON FUNCTION public.transition_reservation TO service_role;
GRANT EXECUTE ON FUNCTION public.update_reservation_contact TO service_role;
GRANT EXECUTE ON FUNCTION public.update_reservation_internal_note TO service_role;
