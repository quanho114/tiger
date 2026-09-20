-- ==============================================================================
-- TIGER 345 - MIGRATION 000007: GUEST ORDER CLAIM RPC
-- Generated for Task T18 according to plans/tiger-345/tasks/T18-guest-claim.md,
-- 02-architecture.md section G, 03-database.md, and 04-api-contracts.md section D.
-- Importers/callers: customer-api (handleClaimOrder), PostgreSQL RPC
-- Affected API: POST /functions/v1/customer-api/me/orders/:id/claim
-- Data schemas: orders, guest_order_claims, audit_logs
-- User's verbatim instruction: "làm full các task luôn ấy"
-- Enforces Invariant V22:
-- 1. Atomic row locking on orders and guest_order_claims to prevent concurrent claims
-- 2. Secret hash verification (SHA-256) - raw secrets are never stored in DB
-- 3. 24-hour expiration check (expires_at > now())
-- 4. Idempotent replay: same owner + same secret returns success
-- 5. Ownership conflict: different user attempting claim is denied with P0023
-- 6. Audit log recording without exposing raw secrets
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.claim_guest_order(
    p_order_id uuid,
    p_customer_user_id uuid,
    p_claim_secret_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_claim RECORD;
    v_profile RECORD;
BEGIN
    -- 1. Validate customer profile exists and is not undergoing deletion
    SELECT user_id, deletion_requested_at
    INTO v_profile
    FROM public.customer_profiles
    WHERE user_id = p_customer_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'CUSTOMER_PROFILE_NOT_FOUND: Hồ sơ người dùng không tồn tại'
            USING ERRCODE = 'P0002';
    END IF;

    IF v_profile.deletion_requested_at IS NOT NULL THEN
        RAISE EXCEPTION 'CUSTOMER_DELETING: Tài khoản đang trong quá trình xóa, không thể thực hiện giao dịch'
            USING ERRCODE = 'P0020';
    END IF;

    -- 2. Lock the order row (atomic lock)
    SELECT id, code, customer_user_id, status, created_at
    INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Đơn hàng không tồn tại'
            USING ERRCODE = 'P0002';
    END IF;

    -- 3. Lock the guest_order_claims row (atomic lock)
    SELECT id, order_id, secret_hash, expires_at, consumed_at, claimed_by_user_id
    INTO v_claim
    FROM public.guest_order_claims
    WHERE order_id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'CLAIM_NOT_FOUND: Đơn hàng không có mã nhận hoặc không phải đơn khách vãng lai'
            USING ERRCODE = 'P0022';
    END IF;

    -- 4. Check if already claimed / owned
    -- Idempotent retry: same owner and same secret hash
    IF v_claim.consumed_at IS NOT NULL OR v_order.customer_user_id IS NOT NULL THEN
        IF v_order.customer_user_id = p_customer_user_id
           AND (v_claim.claimed_by_user_id IS NULL OR v_claim.claimed_by_user_id = p_customer_user_id)
           AND v_claim.secret_hash = p_claim_secret_hash THEN
            RETURN jsonb_build_object(
                'order_id', v_order.id,
                'order_code', v_order.code,
                'claimed', true,
                'replayed', true,
                'claimed_at', to_char(COALESCE(v_claim.consumed_at, now()) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
            );
        ELSE
            RAISE EXCEPTION 'CLAIM_ALREADY_OWNED: Đơn hàng đã được liên kết với một tài khoản khác'
                USING ERRCODE = 'P0023';
        END IF;
    END IF;

    -- 5. Verify secret hash
    IF v_claim.secret_hash != p_claim_secret_hash THEN
        RAISE EXCEPTION 'INVALID_CLAIM_SECRET: Mã bí mật nhận đơn không chính xác'
            USING ERRCODE = 'P0024';
    END IF;

    -- 6. Verify expiration (24h TTL)
    IF v_claim.expires_at <= now() THEN
        RAISE EXCEPTION 'CLAIM_EXPIRED: Mã nhận đơn đã hết hạn (chỉ có hiệu lực trong vòng 24 giờ kể từ khi đặt đơn)'
            USING ERRCODE = 'P0025';
    END IF;

    -- 7. Update orders with customer_user_id
    UPDATE public.orders
    SET customer_user_id = p_customer_user_id,
        updated_at = now()
    WHERE id = p_order_id;

    -- 8. Mark claim consumed
    UPDATE public.guest_order_claims
    SET consumed_at = now(),
        claimed_by_user_id = p_customer_user_id
    WHERE id = v_claim.id;

    -- 9. Record audit log (WITHOUT raw secret)
    INSERT INTO public.audit_logs (
        id,
        actor_kind,
        admin_id,
        action,
        entity_type,
        entity_id,
        metadata,
        created_at
    ) VALUES (
        gen_random_uuid(),
        'customer',
        NULL,
        'claim_guest_order',
        'order',
        p_order_id,
        jsonb_build_object(
            'customer_user_id', p_customer_user_id,
            'order_code', v_order.code
        ),
        now()
    );

    -- 10. Return success response
    RETURN jsonb_build_object(
        'order_id', v_order.id,
        'order_code', v_order.code,
        'claimed', true,
        'replayed', false,
        'claimed_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    );
END;
$$;

-- Revoke execute from public, anon, authenticated; only service role / internal should execute
REVOKE EXECUTE ON FUNCTION public.claim_guest_order(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_guest_order(uuid, uuid, text) TO service_role;
