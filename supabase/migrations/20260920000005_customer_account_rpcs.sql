-- ==============================================================================
-- TIGER 345 - MIGRATION 000005: CUSTOMER ACCOUNT RPCS & ATOMIC ADDRESS OPERATIONS
-- Generated for Task T14 according to plans/tiger-345/03-database.md and 04-api-contracts.md
-- Enforces:
-- 1. Invariant V20: Atomic default address switching and promotion on deletion
-- 2. Invariant V16: Customer reservation cancellation with cutoff and OCC checks
-- 3. Invariant V04: Ownership enforcement at the database level
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. RPC: upsert_customer_address
-- Creates or updates an address for a customer with atomic is_default management.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_customer_address(
    p_user_id uuid,
    p_address_id uuid DEFAULT NULL,
    p_expected_version int DEFAULT NULL,
    p_label text DEFAULT 'Nhà riêng',
    p_recipient_name text DEFAULT '',
    p_phone text DEFAULT '',
    p_address_line text DEFAULT '',
    p_ward text DEFAULT NULL,
    p_district text DEFAULT NULL,
    p_province text DEFAULT NULL,
    p_delivery_note text DEFAULT '',
    p_is_default boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_label text;
    v_clean_recipient text;
    v_clean_phone text;
    v_clean_line text;
    v_clean_ward text;
    v_clean_district text;
    v_clean_province text;
    v_clean_note text;
    v_existing record;
    v_result record;
    v_count int;
    v_target_default boolean;
BEGIN
    -- 1. Clean and normalize inputs
    v_clean_label := trim(COALESCE(p_label, 'Nhà riêng'));
    v_clean_recipient := trim(COALESCE(p_recipient_name, ''));
    v_clean_phone := trim(COALESCE(p_phone, ''));
    v_clean_line := trim(COALESCE(p_address_line, ''));
    v_clean_ward := NULLIF(trim(COALESCE(p_ward, '')), '');
    v_clean_district := NULLIF(trim(COALESCE(p_district, '')), '');
    v_clean_province := NULLIF(trim(COALESCE(p_province, '')), '');
    v_clean_note := trim(COALESCE(p_delivery_note, ''));
    v_target_default := COALESCE(p_is_default, false);

    -- 2. Validation
    IF length(v_clean_label) < 1 OR length(v_clean_label) > 50 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Nhãn địa chỉ phải từ 1 đến 50 ký tự'
            USING ERRCODE = 'P0012';
    END IF;

    IF length(v_clean_recipient) < 2 OR length(v_clean_recipient) > 100 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Tên người nhận phải từ 2 đến 100 ký tự'
            USING ERRCODE = 'P0012';
    END IF;

    IF length(v_clean_phone) < 9 OR length(v_clean_phone) > 20 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Số điện thoại phải từ 9 đến 20 chữ số'
            USING ERRCODE = 'P0012';
    END IF;

    IF length(v_clean_line) < 5 OR length(v_clean_line) > 255 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Địa chỉ chi tiết phải từ 5 đến 255 ký tự'
            USING ERRCODE = 'P0012';
    END IF;

    -- 3. Lock user's address records to prevent concurrent race conditions on is_default
    PERFORM pg_advisory_xact_lock(hashtext('customer_addresses:' || p_user_id::text));

    -- Count existing addresses for user
    SELECT count(*) INTO v_count
    FROM public.customer_addresses
    WHERE user_id = p_user_id;

    -- If this is the customer's very first address, force it to be default
    IF v_count = 0 THEN
        v_target_default := true;
    END IF;

    -- Case A: UPDATE existing address
    IF p_address_id IS NOT NULL THEN
        SELECT *
        INTO v_existing
        FROM public.customer_addresses
        WHERE id = p_address_id AND user_id = p_user_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'NOT_FOUND: Địa chỉ không tồn tại hoặc không thuộc quyền sở hữu'
                USING ERRCODE = 'P0002';
        END IF;

        IF p_expected_version IS NOT NULL AND v_existing.version != p_expected_version THEN
            RAISE EXCEPTION USING ERRCODE = 'P0003',
                MESSAGE = format('VERSION_CONFLICT: Địa chỉ đã được cập nhật bởi phiên làm việc khác (hiện tại: %s, expected: %s)', v_existing.version, p_expected_version);
        END IF;

        -- If setting this address as default, unset default on all other addresses of user
        IF v_target_default = true THEN
            UPDATE public.customer_addresses
            SET is_default = false
            WHERE user_id = p_user_id AND id != p_address_id AND is_default = true;
        ELSIF v_existing.is_default = true AND v_target_default = false THEN
            -- If user explicitly unsets the default, and other addresses exist, promote the most recently updated other address
            IF v_count > 1 THEN
                UPDATE public.customer_addresses
                SET is_default = true, version = version + 1, updated_at = now()
                WHERE id = (
                    SELECT id FROM public.customer_addresses
                    WHERE user_id = p_user_id AND id != p_address_id
                    ORDER BY updated_at DESC, created_at DESC
                    LIMIT 1
                );
            ELSE
                -- Sole address must remain default
                v_target_default := true;
            END IF;
        END IF;

        UPDATE public.customer_addresses
        SET
            label = v_clean_label,
            recipient_name = v_clean_recipient,
            phone = v_clean_phone,
            address_line = v_clean_line,
            ward = v_clean_ward,
            district = v_clean_district,
            province = v_clean_province,
            delivery_note = v_clean_note,
            is_default = v_target_default,
            version = version + 1,
            updated_at = now()
        WHERE id = p_address_id AND user_id = p_user_id
        RETURNING * INTO v_result;

    -- Case B: INSERT new address
    ELSE
        -- If setting new address as default, unset default on existing addresses first
        IF v_target_default = true THEN
            UPDATE public.customer_addresses
            SET is_default = false
            WHERE user_id = p_user_id AND is_default = true;
        END IF;

        INSERT INTO public.customer_addresses (
            user_id,
            label,
            recipient_name,
            phone,
            address_line,
            ward,
            district,
            province,
            delivery_note,
            is_default,
            version
        ) VALUES (
            p_user_id,
            v_clean_label,
            v_clean_recipient,
            v_clean_phone,
            v_clean_line,
            v_clean_ward,
            v_clean_district,
            v_clean_province,
            v_clean_note,
            v_target_default,
            1
        ) RETURNING * INTO v_result;
    END IF;

    RETURN jsonb_build_object(
        'id', v_result.id,
        'user_id', v_result.user_id,
        'label', v_result.label,
        'recipient_name', v_result.recipient_name,
        'phone', v_result.phone,
        'address_line', v_result.address_line,
        'ward', v_result.ward,
        'district', v_result.district,
        'province', v_result.province,
        'delivery_note', v_result.delivery_note,
        'is_default', v_result.is_default,
        'version', v_result.version,
        'created_at', v_result.created_at,
        'updated_at', v_result.updated_at
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. RPC: delete_customer_address
-- Atomically deletes an address. If it was default, promotes another address.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_customer_address(
    p_user_id uuid,
    p_address_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_default boolean;
    v_promoted_id uuid := NULL;
BEGIN
    -- Advisory lock per user
    PERFORM pg_advisory_xact_lock(hashtext('customer_addresses:' || p_user_id::text));

    SELECT is_default
    INTO v_is_default
    FROM public.customer_addresses
    WHERE id = p_address_id AND user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Địa chỉ không tồn tại hoặc không thuộc quyền sở hữu'
            USING ERRCODE = 'P0002';
    END IF;

    DELETE FROM public.customer_addresses
    WHERE id = p_address_id AND user_id = p_user_id;

    -- If the deleted address was default, promote the most recently updated remaining address
    IF v_is_default = true THEN
        UPDATE public.customer_addresses
        SET is_default = true, version = version + 1, updated_at = now()
        WHERE id = (
            SELECT id FROM public.customer_addresses
            WHERE user_id = p_user_id
            ORDER BY updated_at DESC, created_at DESC
            LIMIT 1
        )
        RETURNING id INTO v_promoted_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'deleted_id', p_address_id,
        'promoted_default_id', v_promoted_id
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. RPC: cancel_customer_reservation
-- Checks customer ownership before calling transition_reservation atomically.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_customer_reservation(
    p_user_id uuid,
    p_reservation_id uuid,
    p_expected_version int,
    p_reason text DEFAULT NULL,
    p_reference_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_owner_id uuid;
BEGIN
    -- Verify ownership with row lock
    SELECT customer_user_id
    INTO v_owner_id
    FROM public.reservations
    WHERE id = p_reservation_id
    FOR UPDATE;

    IF NOT FOUND OR v_owner_id IS NULL OR v_owner_id != p_user_id THEN
        RAISE EXCEPTION 'NOT_FOUND: Đặt bàn không tồn tại hoặc không thuộc quyền sở hữu'
            USING ERRCODE = 'P0002';
    END IF;

    -- Execute core transition_reservation with p_actor_admin_id = NULL (customer cancellation triggers cutoff check)
    RETURN public.transition_reservation(
        p_reservation_id,
        p_expected_version,
        'cancelled',
        NULL,
        COALESCE(p_reason, 'Khách hàng tự hủy đặt bàn qua ứng dụng'),
        p_reference_now
    );
END;
$$;
