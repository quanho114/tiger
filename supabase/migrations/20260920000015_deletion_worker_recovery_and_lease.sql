-- ==============================================================================
-- Migration: 20260920000015_deletion_worker_recovery_and_lease.sql
-- Description: Deletion worker recovery, atomic claim, lease timeout, step resumption & terminal exhausted state (Task 4)
--
-- Fact-Forcing Metadata:
-- - Importers/Callers:
--   - supabase/functions/_shared/account-deletion-worker.ts (processDeletionRetries)
--   - supabase/functions/admin-api/index.ts (POST /admin-api/retention/retry-deletions)
--   - supabase/functions/customer-api/customer-handlers.ts (handleDeleteProfile)
--   - tests/integration/account-deletion-flow.test.ts
-- - Affected API:
--   - POST /functions/v1/admin-api/retention/retry-deletions
--   - DELETE /functions/v1/customer-api/me
-- - Data Schemas:
--   - public.account_deletion_jobs (user_id, status, step, retry_count, last_error_code, error_message, lease_expires_at, claimed_by, updated_at)
--   - public.customer_tombstones (user_id, email_hash, deletion_requested_at, db_cleaned_at, auth_deleted_at)
-- - Verbatim Instructions:
--   - "4. DELETION WORKER RECOVERY:"
--   - "- Resume được workflow từ step đã lưu."
--   - "- Retry DB cleanup trước khi gọi Auth delete; không đảo ngược thứ tự gây orphan."
--   - "- Reclaim hung jobs bằng lease/timeout rõ ràng."
--   - "- Claim job atomic, idempotent, bảo lưu lịch sử tài chính/đơn hàng và tombstone account."
--   - "- Nếu retry kiệt, giữ trạng thái terminal rõ ràng cho admin đối soát, không nuốt lỗi."
-- ==============================================================================

-- 1. Add lease & worker tracking columns to account_deletion_jobs
ALTER TABLE public.account_deletion_jobs
    ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS claimed_by text NULL;

-- Update status check constraint to allow terminal 'exhausted' status
ALTER TABLE public.account_deletion_jobs
    DROP CONSTRAINT IF EXISTS account_deletion_jobs_status_check;
ALTER TABLE public.account_deletion_jobs
    ADD CONSTRAINT account_deletion_jobs_status_check
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'exhausted'));

CREATE INDEX IF NOT EXISTS idx_account_deletion_jobs_lease
    ON public.account_deletion_jobs (status, lease_expires_at, retry_count);

-- 2. Atomic RPC to claim deletion jobs with lease/timeout & hung job reclamation
CREATE OR REPLACE FUNCTION public.claim_account_deletion_jobs(
    p_limit int DEFAULT 50,
    p_lease_seconds int DEFAULT 300,
    p_max_retries int DEFAULT 5,
    p_worker_id text DEFAULT 'worker-default'
)
RETURNS TABLE (
    user_id uuid,
    step text,
    status text,
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
    WITH eligible AS (
        SELECT adj.user_id
        FROM public.account_deletion_jobs adj
        WHERE
            -- Case 1: Fresh pending jobs
            (adj.status = 'pending')
            -- Case 2: Failed retryable jobs
            OR (adj.status = 'failed' AND adj.retry_count < p_max_retries)
            -- Case 3: Hung / orphaned processing jobs whose lease expired
            OR (adj.status = 'processing' AND (adj.lease_expires_at IS NULL OR adj.lease_expires_at < now()))
        ORDER BY
            -- Priority to older requests
            adj.updated_at ASC
        LIMIT p_limit
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.account_deletion_jobs target
    SET
        status = 'processing',
        lease_expires_at = now() + (p_lease_seconds * interval '1 second'),
        claimed_by = p_worker_id,
        updated_at = now()
    FROM eligible
    WHERE target.user_id = eligible.user_id
    RETURNING
        target.user_id,
        target.step,
        target.status,
        target.retry_count,
        target.last_error_code,
        target.error_message,
        target.requested_at,
        target.updated_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_account_deletion_jobs(int, int, int, text) FROM PUBLIC, anon, authenticated;

-- 3. Drop previous signatures of complete_account_deletion_job if any
DROP FUNCTION IF EXISTS public.complete_account_deletion_job(uuid, boolean, text, text);
DROP FUNCTION IF EXISTS public.complete_account_deletion_job(uuid, boolean, text, text, text);
DROP FUNCTION IF EXISTS public.complete_account_deletion_job(uuid, boolean, text, text, text, int);

-- 4. Create robust complete_account_deletion_job supporting step preservation, terminal exhaustion & lease clearance
CREATE OR REPLACE FUNCTION public.complete_account_deletion_job(
    p_user_id uuid,
    p_success boolean,
    p_error_code text DEFAULT NULL,
    p_error_message text DEFAULT NULL,
    p_step text DEFAULT NULL,
    p_max_retries int DEFAULT 5
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_new_retry_count int;
    v_new_status text;
    v_effective_step text;
BEGIN
    IF p_success THEN
        UPDATE public.account_deletion_jobs
        SET status = 'completed',
            step = 'completed',
            completed_at = now(),
            last_error_code = NULL,
            error_message = NULL,
            lease_expires_at = NULL,
            claimed_by = NULL,
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
        -- Fetch current retry count to decide whether to mark terminal 'exhausted'
        SELECT retry_count + 1 INTO v_new_retry_count
        FROM public.account_deletion_jobs
        WHERE user_id = p_user_id;

        IF v_new_retry_count IS NULL THEN
            v_new_retry_count := 1;
        END IF;

        IF v_new_retry_count >= p_max_retries THEN
            v_new_status := 'exhausted';
        ELSE
            v_new_status := 'failed';
        END IF;

        -- Preserve current step if p_step is not provided
        IF p_step IS NOT NULL AND length(trim(p_step)) > 0 THEN
            v_effective_step := trim(p_step);
        ELSE
            SELECT step INTO v_effective_step
            FROM public.account_deletion_jobs
            WHERE user_id = p_user_id;
            IF v_effective_step IS NULL THEN
                v_effective_step := 'auth_delete';
            END IF;
        END IF;

        UPDATE public.account_deletion_jobs
        SET status = v_new_status,
            step = v_effective_step,
            last_error_code = p_error_code,
            error_message = p_error_message,
            retry_count = v_new_retry_count,
            lease_expires_at = NULL,
            claimed_by = NULL,
            updated_at = now()
        WHERE user_id = p_user_id;

        INSERT INTO public.audit_logs (
            actor_kind, action, entity_type, entity_id, metadata
        )
        VALUES (
            'system',
            CASE WHEN v_new_status = 'exhausted' THEN 'account_deletion_exhausted' ELSE 'account_deletion_failed' END,
            'account_deletion_jobs',
            p_user_id::text,
            jsonb_build_object(
                'status', v_new_status,
                'step', v_effective_step,
                'retry_count', v_new_retry_count,
                'max_retries', p_max_retries,
                'error_code', p_error_code,
                'error_message', p_error_message
            )
        );
    END IF;

    RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_account_deletion_job(uuid, boolean, text, text, text, int) FROM PUBLIC, anon, authenticated;

-- 5. Update get_pending_deletion_retries to include reclaimed hung jobs and resume steps
DROP FUNCTION IF EXISTS public.get_pending_deletion_retries(int, int);
DROP FUNCTION IF EXISTS public.get_pending_deletion_retries(int);
DROP FUNCTION IF EXISTS public.get_pending_deletion_retries();
CREATE OR REPLACE FUNCTION public.get_pending_deletion_retries(
    p_limit int DEFAULT 50,
    p_max_retries int DEFAULT 5
)
RETURNS TABLE (
    user_id uuid,
    step text,
    status text,
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
        adj.step,
        adj.status,
        adj.retry_count,
        adj.last_error_code,
        adj.error_message,
        adj.requested_at,
        adj.updated_at
    FROM public.account_deletion_jobs adj
    WHERE
        (adj.status = 'failed' AND adj.retry_count < p_max_retries)
        OR (adj.status = 'processing' AND (adj.lease_expires_at IS NULL OR adj.lease_expires_at < now()))
        OR (adj.status = 'pending')
    ORDER BY adj.updated_at ASC
    LIMIT p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_pending_deletion_retries(int, int) FROM PUBLIC, anon, authenticated;
