-- ==============================================================================
-- TIGER 345 - MIGRATION 000012: CUSTOMER TOMBSTONES & ACCOUNT DELETION RETRY (F05 REMEDIATION)
--
-- Fact-Forcing Metadata:
-- - Importers/Callers: Executed by supabase db push / psql migration runner
-- - Affected API:
--   - DELETE /customer-api/me
--   - POST /admin-api/retention/retry-deletions
--   - POST /admin-api/retention/run
--   - All customer-authenticated endpoints and public-api operations
-- - Data Schemas:
--   - public.customer_tombstones (user_id uuid, email_hash text, deletion_requested_at timestamptz, db_cleaned_at timestamptz, auth_deleted_at timestamptz, created_at timestamptz)
--   - public.account_deletion_jobs (status, step, retry_count, last_error_code, error_message, updated_at)
--   - public.customer_profiles (deletion_requested_at)
-- - Verbatim Instructions:
--   - "BƯỚC 7 — F05: ACCOUNT DELETION AN TOÀN VÀ RETRY THẬT"
--   - "Xem xét cơ chế xử lý khi xóa tài khoản customer (customer-api/customer-handlers.ts, customer_tombstones, queue retry)."
--   - "Đảm bảo: nếu Supabase Auth admin delete thất bại, không để lại trạng thái nửa vời làm hỏng tính toàn vẹn hoặc không retry được."
--   - "Có cơ chế retry rõ ràng (hàng đợi / scheduled job / admin trigger) thay vì chỉ log lỗi rồi bỏ qua."
--   - "Viết integration test cho luồng xóa tài khoản: thành công, thất bại có ghi nhận retry, và cơ chế retry xử lý lại."
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. DEDICATED CUSTOMER TOMBSTONES TABLE
-- Stores permanent tombstone records for deleted or deleting customer accounts.
-- Survives deletion of customer_profiles to prevent post-cleanup token reuse.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_tombstones (
    user_id uuid PRIMARY KEY,
    email_hash text NULL,
    deletion_requested_at timestamptz NOT NULL DEFAULT now(),
    db_cleaned_at timestamptz NULL,
    auth_deleted_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_tombstones_user_id
    ON public.customer_tombstones (user_id);

ALTER TABLE public.customer_tombstones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_tombstones FROM PUBLIC, anon, authenticated;

-- Backfill from existing account_deletion_jobs if any
INSERT INTO public.customer_tombstones (user_id, deletion_requested_at, db_cleaned_at, auth_deleted_at)
SELECT
    user_id,
    requested_at,
    CASE WHEN step IN ('auth_delete', 'completed') THEN updated_at ELSE NULL END,
    completed_at
FROM public.account_deletion_jobs
ON CONFLICT (user_id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 2. UPDATE RPC: REQUEST ACCOUNT DELETION
-- Inserts tombstone immediately, marks profile, upserts job.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_account_deletion(
    p_user_id uuid,
    p_actor_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_job_id uuid;
    v_profile record;
    v_email_hash text;
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

    -- 3. Compute email hash if available
    IF p_actor_email IS NOT NULL AND length(trim(p_actor_email)) > 0 THEN
        v_email_hash := encode(extensions.digest(lower(trim(p_actor_email)), 'sha256'), 'hex');
    ELSE
        v_email_hash := NULL;
    END IF;

    -- 4. Insert into customer_tombstones immediately (F05 Independent Tombstone Gate)
    INSERT INTO public.customer_tombstones (
        user_id, email_hash, deletion_requested_at
    )
    VALUES (
        p_user_id, v_email_hash, now()
    )
    ON CONFLICT (user_id) DO UPDATE
    SET deletion_requested_at = EXCLUDED.deletion_requested_at;

    -- 5. Mark deletion_requested_at on customer_profiles
    UPDATE public.customer_profiles
    SET deletion_requested_at = COALESCE(deletion_requested_at, now()),
        updated_at = now()
    WHERE user_id = p_user_id;

    -- 6. Upsert account_deletion_jobs
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

    -- 7. Audit log
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
-- 3. UPDATE RPC: PROCESS ACCOUNT DELETION (DATABASE PHASE)
-- Sets db_cleaned_at in customer_tombstones, cleans data, advances to auth_delete.
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

    -- 2. Update customer_tombstones db_cleaned_at
    UPDATE public.customer_tombstones
    SET db_cleaned_at = now()
    WHERE user_id = p_user_id;

    -- 3. Delete private preferences & saved data
    DELETE FROM public.customer_favorites WHERE user_id = p_user_id;
    DELETE FROM public.customer_addresses WHERE user_id = p_user_id;

    -- 4. Detach orders & anonymize PII on terminal orders (completed/cancelled)
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

    -- 5. Detach reservations & anonymize PII on terminal reservations
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

    -- 6. Detach guest order claims
    UPDATE public.guest_order_claims
    SET claimed_by_user_id = NULL
    WHERE claimed_by_user_id = p_user_id;

    -- 7. Delete customer profile
    DELETE FROM public.customer_profiles WHERE user_id = p_user_id;

    -- 8. Advance job step to 'auth_delete'
    UPDATE public.account_deletion_jobs
    SET step = 'auth_delete',
        updated_at = now()
    WHERE user_id = p_user_id;

    -- 9. Audit logging
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
-- 4. UPDATE RPC: COMPLETE OR FAIL ACCOUNT DELETION JOB
-- Updates customer_tombstones.auth_deleted_at upon success.
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

        UPDATE public.customer_tombstones
        SET auth_deleted_at = now()
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
            step = 'auth_delete',
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
-- 5. RPC: GET PENDING DELETION RETRIES
-- Returns pending or failed deletion jobs eligible for automated or manual retry.
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_pending_deletion_retries(int, int);
DROP FUNCTION IF EXISTS public.get_pending_deletion_retries();

CREATE OR REPLACE FUNCTION public.get_pending_deletion_retries(
    p_limit int DEFAULT 50,
    p_max_retries int DEFAULT 5
)
RETURNS TABLE (
    user_id uuid,
    retry_count int,
    last_error_code text,
    error_message text,
    requested_at timestamptz,
    updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        adj.user_id,
        adj.retry_count,
        adj.last_error_code,
        adj.error_message,
        adj.requested_at,
        adj.updated_at
    FROM public.account_deletion_jobs adj
    WHERE adj.status = 'failed'
      AND adj.step = 'auth_delete'
      AND adj.retry_count < p_max_retries
    ORDER BY adj.updated_at ASC
    LIMIT p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_pending_deletion_retries(int, int) FROM PUBLIC, anon, authenticated;
