-- ==============================================================================
-- TIGER 345 - MIGRATION 000008: ACCOUNT DELETION & DATA RETENTION (TASK T19)
-- Importers/callers: supabase db reset, Task T19, PostgreSQL runtime
-- Affected API: DELETE /me, POST /admin-api/retention/run, GET /admin-api/retention/dry-run
-- Data schemas: account_deletion_jobs, customer_profiles, orders, reservations, guest_order_claims, idempotency_requests
-- User's verbatim instruction: "làm full các task luôn ấy"
-- Enforces Invariant V23 (Account Deletion & Data Retention Flow):
-- 1. Marks deletion_requested_at immediately on customer_profiles
-- 2. Idempotent deletion workflow state machine in account_deletion_jobs
-- 3. Detaches orders & reservations without cascading deletion or loss of financial history
-- 4. Anonymizes PII snapshots on terminal transactions
-- 5. Safe retention cleanup RPC for TTL-expired records with dry-run support
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EXTEND ACCOUNT DELETION JOBS SCHEMA
-- ------------------------------------------------------------------------------
ALTER TABLE public.account_deletion_jobs
    ADD COLUMN IF NOT EXISTS error_message text NULL;

CREATE INDEX IF NOT EXISTS idx_account_deletion_jobs_status_retry
    ON public.account_deletion_jobs (status, retry_count);

CREATE INDEX IF NOT EXISTS idx_idempotency_requests_created_at
    ON public.idempotency_requests (created_at);

-- ------------------------------------------------------------------------------
-- 2. RPC: REQUEST ACCOUNT DELETION
-- Marks deletion_requested_at on customer_profiles immediately to block API calls.
-- Validates that caller is NOT an active admin (P0026).
-- Creates or resets row in account_deletion_jobs with status 'pending'.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_account_deletion(
    p_user_id uuid,
    p_actor_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_job_id uuid;
    v_profile record;
BEGIN
    -- 1. Active Admin Check: Active admins cannot self-delete via customer portal (P0026)
    IF EXISTS (
        SELECT 1 FROM public.admin_profiles
        WHERE user_id = p_user_id AND active = true
    ) THEN
        RAISE EXCEPTION 'ACTIVE_ADMIN_SELF_DELETE_FORBIDDEN: Tài khoản quản trị viên (Admin) không thể tự xóa qua cổng khách hàng'
            USING ERRCODE = 'P0026';
    END IF;

    -- 2. Verify customer profile exists
    SELECT * INTO v_profile
    FROM public.customer_profiles
    WHERE user_id = p_user_id;

    IF v_profile IS NULL THEN
        RAISE EXCEPTION 'CUSTOMER_PROFILE_NOT_FOUND: Không tìm thấy hồ sơ khách hàng'
            USING ERRCODE = 'P0002';
    END IF;

    -- 3. Mark deletion_requested_at immediately (V04 / V23 gate)
    UPDATE public.customer_profiles
    SET deletion_requested_at = COALESCE(deletion_requested_at, now()),
        updated_at = now()
    WHERE user_id = p_user_id;

    -- 4. Upsert account_deletion_jobs
    INSERT INTO public.account_deletion_jobs (
        user_id, status, step, requested_at, last_error_code, error_message, retry_count
    )
    VALUES (
        p_user_id, 'pending', 'requested', now(), NULL, NULL, 0
    )
    ON CONFLICT (user_id) DO UPDATE
    SET status = 'pending',
        step = 'requested',
        requested_at = now(),
        last_error_code = NULL,
        error_message = NULL,
        updated_at = now()
    RETURNING id INTO v_job_id;

    -- 5. Record audit log without raw PII
    INSERT INTO public.audit_logs (
        actor_kind, action, entity_type, entity_id, metadata
    )
    VALUES (
        'customer',
        'account_deletion_requested',
        'customer_profiles',
        p_user_id::text,
        jsonb_build_object(
            'job_id', v_job_id,
            'user_id', p_user_id,
            'actor_email_domain', CASE
                WHEN p_actor_email IS NOT NULL AND position('@' in p_actor_email) > 0
                THEN substring(p_actor_email from position('@' in p_actor_email) + 1)
                ELSE 'unknown'
            END
        )
    );

    RETURN jsonb_build_object(
        'job_id', v_job_id,
        'status', 'pending',
        'step', 'requested',
        'requested_at', now()
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_account_deletion(uuid, text) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 3. RPC: PROCESS ACCOUNT DELETION (DATABASE PHASE)
-- Cleans up customer favorites, addresses, and customer_profiles.
-- Detaches orders and reservations WITHOUT cascading loss of business history.
-- Anonymizes PII on terminal orders and reservations.
-- Advances step to 'auth_delete'.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_account_deletion_db(
    p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- 1. Advance job status to 'processing' and step to 'db_cleanup'
    UPDATE public.account_deletion_jobs
    SET status = 'processing',
        step = 'db_cleanup',
        updated_at = now()
    WHERE user_id = p_user_id;

    -- 2. Delete private preferences & saved data
    DELETE FROM public.customer_favorites WHERE user_id = p_user_id;
    DELETE FROM public.customer_addresses WHERE user_id = p_user_id;

    -- 3. Detach orders & anonymize PII on terminal orders (completed/cancelled)
    -- Invariant V23: Preserves financial numbers (subtotal, total, items, status, payments)
    UPDATE public.orders
    SET customer_user_id = NULL,
        customer_name = CASE
            WHEN customer_name IS NOT NULL AND status IN ('completed', 'cancelled')
            THEN 'Khách Hàng (Đã Xóa)'
            ELSE customer_name
        END,
        customer_phone = CASE
            WHEN customer_phone IS NOT NULL AND status IN ('completed', 'cancelled')
            THEN '0000000000'
            ELSE customer_phone
        END,
        address_snapshot = CASE
            WHEN address_snapshot IS NOT NULL AND status IN ('completed', 'cancelled')
            THEN '[Địa chỉ đã ẩn danh theo chính sách quyền riêng tư]'
            ELSE address_snapshot
        END
    WHERE customer_user_id = p_user_id;

    -- 4. Detach reservations & anonymize PII on terminal reservations
    UPDATE public.reservations
    SET customer_user_id = NULL,
        customer_name = CASE
            WHEN status IN ('completed', 'cancelled', 'no_show')
            THEN 'Khách Hàng (Đã Xóa)'
            ELSE customer_name
        END,
        customer_phone = CASE
            WHEN status IN ('completed', 'cancelled', 'no_show')
            THEN '0000000000'
            ELSE customer_phone
        END,
        note = CASE
            WHEN status IN ('completed', 'cancelled', 'no_show')
            THEN ''
            ELSE note
        END
    WHERE customer_user_id = p_user_id;

    -- 5. Detach guest order claims
    UPDATE public.guest_order_claims
    SET claimed_by_user_id = NULL
    WHERE claimed_by_user_id = p_user_id;

    -- 6. Delete customer profile
    DELETE FROM public.customer_profiles WHERE user_id = p_user_id;

    -- 7. Advance job step to 'auth_delete'
    UPDATE public.account_deletion_jobs
    SET step = 'auth_delete',
        updated_at = now()
    WHERE user_id = p_user_id;

    -- 8. Audit logging
    INSERT INTO public.audit_logs (
        actor_kind, action, entity_type, entity_id, metadata
    )
    VALUES (
        'system',
        'account_deletion_db_completed',
        'account_deletion_jobs',
        p_user_id::text,
        jsonb_build_object('step', 'auth_delete')
    );

    RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_account_deletion_db(uuid) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 4. RPC: COMPLETE OR FAIL ACCOUNT DELETION JOB
-- Called after the Edge Function attempts the Supabase Auth deletion call.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_account_deletion_job(
    p_user_id uuid,
    p_success boolean,
    p_error_code text DEFAULT NULL,
    p_error_message text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_success THEN
        UPDATE public.account_deletion_jobs
        SET status = 'completed',
            step = 'completed',
            completed_at = now(),
            last_error_code = NULL,
            error_message = NULL,
            updated_at = now()
        WHERE user_id = p_user_id;

        INSERT INTO public.audit_logs (
            actor_kind, action, entity_type, entity_id, metadata
        )
        VALUES (
            'system',
            'account_deletion_completed',
            'account_deletion_jobs',
            p_user_id::text,
            jsonb_build_object('user_id', p_user_id)
        );
    ELSE
        UPDATE public.account_deletion_jobs
        SET status = 'failed',
            last_error_code = p_error_code,
            error_message = p_error_message,
            retry_count = retry_count + 1,
            updated_at = now()
        WHERE user_id = p_user_id;

        INSERT INTO public.audit_logs (
            actor_kind, action, entity_type, entity_id, metadata
        )
        VALUES (
            'system',
            'account_deletion_failed',
            'account_deletion_jobs',
            p_user_id::text,
            jsonb_build_object('error_code', p_error_code, 'error_message', p_error_message)
        );
    END IF;

    RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_account_deletion_job(uuid, boolean, text, text) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 5. RPC: RUN RETENTION CLEANUP
-- Purges TTL-expired data:
-- - Idempotency requests > 24 hours
-- - Guest order claims expired > 0 hours (expires_at < now())
-- - Rate limit buckets expired > 0 hours (expires_at < now())
-- - Audit logs > 180 days
-- - Anonymizes terminal orders older than 90 days
-- Supports dry-run execution (p_dry_run = true)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_retention_cleanup(
    p_dry_run boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_idemp_count bigint := 0;
    v_claims_count bigint := 0;
    v_rate_limits_count bigint := 0;
    v_audit_count bigint := 0;
    v_orders_anonymized bigint := 0;
    v_resv_anonymized bigint := 0;
BEGIN
    -- 1. Count items eligible for purge / anonymization
    SELECT count(*) INTO v_idemp_count
    FROM public.idempotency_requests
    WHERE created_at < now() - interval '24 hours';

    SELECT count(*) INTO v_claims_count
    FROM public.guest_order_claims
    WHERE expires_at < now();

    SELECT count(*) INTO v_rate_limits_count
    FROM public.rate_limit_buckets
    WHERE expires_at < now();

    SELECT count(*) INTO v_audit_count
    FROM public.audit_logs
    WHERE created_at < now() - interval '180 days';

    SELECT count(*) INTO v_orders_anonymized
    FROM public.orders
    WHERE status IN ('completed', 'cancelled')
      AND completed_at IS NOT NULL
      AND completed_at < now() - interval '90 days'
      AND (customer_name != 'Khách Hàng (Lưu Trữ Quá 90 Ngày)' OR customer_phone != '0000000000');

    SELECT count(*) INTO v_resv_anonymized
    FROM public.reservations
    WHERE status IN ('completed', 'cancelled', 'no_show')
      AND starts_at < now() - interval '90 days'
      AND (customer_name != 'Khách Hàng (Lưu Trữ Quá 90 Ngày)' OR customer_phone != '0000000000');

    -- 2. Execute purge if not dry-run
    IF NOT p_dry_run THEN
        DELETE FROM public.idempotency_requests
        WHERE created_at < now() - interval '24 hours';

        DELETE FROM public.guest_order_claims
        WHERE expires_at < now();

        DELETE FROM public.rate_limit_buckets
        WHERE expires_at < now();

        DELETE FROM public.audit_logs
        WHERE created_at < now() - interval '180 days';

        UPDATE public.orders
        SET customer_name = 'Khách Hàng (Lưu Trữ Quá 90 Ngày)',
            customer_phone = '0000000000',
            address_snapshot = '[Địa chỉ lưu trữ quá 90 ngày đã ẩn danh]'
        WHERE status IN ('completed', 'cancelled')
          AND completed_at IS NOT NULL
          AND completed_at < now() - interval '90 days'
          AND (customer_name != 'Khách Hàng (Lưu Trữ Quá 90 Ngày)' OR customer_phone != '0000000000');

        UPDATE public.reservations
        SET customer_name = 'Khách Hàng (Lưu Trữ Quá 90 Ngày)',
            customer_phone = '0000000000',
            note = ''
        WHERE status IN ('completed', 'cancelled', 'no_show')
          AND starts_at < now() - interval '90 days'
          AND (customer_name != 'Khách Hàng (Lưu Trữ Quá 90 Ngày)' OR customer_phone != '0000000000');

        -- Audit log for executed cleanup
        INSERT INTO public.audit_logs (
            actor_kind, action, entity_type, entity_id, metadata
        )
        VALUES (
            'system',
            'retention_cleanup_executed',
            'retention_scheduler',
            'maintenance',
            jsonb_build_object(
                'dry_run', false,
                'idempotency_purged', v_idemp_count,
                'claims_purged', v_claims_count,
                'rate_limits_purged', v_rate_limits_count,
                'audit_logs_purged', v_audit_count,
                'orders_anonymized', v_orders_anonymized,
                'reservations_anonymized', v_resv_anonymized
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'dry_run', p_dry_run,
        'idempotency_purged', v_idemp_count,
        'claims_purged', v_claims_count,
        'rate_limits_purged', v_rate_limits_count,
        'audit_logs_purged', v_audit_count,
        'orders_anonymized', v_orders_anonymized,
        'reservations_anonymized', v_resv_anonymized,
        'executed_at', now()
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.run_retention_cleanup(boolean) FROM PUBLIC, anon, authenticated;
