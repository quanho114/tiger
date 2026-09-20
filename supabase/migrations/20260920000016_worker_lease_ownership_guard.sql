/*
Fact-Forcing Metadata:
- Importers/Callers:
  - supabase/functions/_shared/account-deletion-worker.ts
  - supabase/functions/customer-api/customer-handlers.ts
  - tests/integration/account-deletion-flow.test.ts
- Affected API:
  - POST /functions/v1/admin-api/retention/retry-deletions
  - DELETE /functions/v1/customer-api/me
- Data Schemas:
  - public.account_deletion_jobs (user_id, status, step, retry_count, lease_expires_at, claimed_by, last_error_code, error_message)
  - public.customer_tombstones (user_id, email_hash, deletion_requested_at, db_cleaned_at, auth_deleted_at)
  - public.customer_profiles, customer_favorites, customer_addresses, orders, reservations, guest_order_claims
  - public.audit_logs (actor_kind, action, entity_type, entity_id, metadata)
- Verbatim Instructions:
  - "2. Lease fencing mới bảo vệ bước hoàn tất, chưa bảo vệ DB cleanup. supabase/functions/_shared/account-deletion-worker.ts:76 vẫn gọi cleanup và cập nhật step chỉ bằng user_id. Worker cũ có thể chạy cleanup sau khi worker mới hoàn tất, khiến job bị đổi lại thành processing. Sửa: kiểm quyền sở hữu lease trong mọi mutation của worker, gồm cleanup/chuyển bước/hoàn tất. Thêm test worker cũ tiếp tục cleanup sau khi worker mới đã completed; test chỉ gọi complete_account_deletion_job chưa bao phủ trường hợp này."
*/

-- ==============================================================================
-- Migration: 20260920000016_worker_lease_ownership_guard.sql
-- Description: Enforces worker lease ownership on ALL worker mutations:
-- 1. DB cleanup (process_account_deletion_db)
-- 2. Step progression & completion/failure (complete_account_deletion_job)
-- Invariant: An expired or preempted worker CANNOT mutate DB cleanup, change step,
-- or overwrite the job status if another worker already holds the claim or completed it.
-- ==============================================================================

-- 1. Drop existing functions to cleanly recreate with p_worker_id support
DROP FUNCTION IF EXISTS public.process_account_deletion_db(uuid);
DROP FUNCTION IF EXISTS public.process_account_deletion_db(uuid, text);

DROP FUNCTION IF EXISTS public.complete_account_deletion_job(uuid, boolean, text, text, text, int);
DROP FUNCTION IF EXISTS public.complete_account_deletion_job(uuid, boolean, text, text, text, int, text);

-- ------------------------------------------------------------------------------
-- 2. PROCESS ACCOUNT DELETION (DATABASE PHASE) WITH LEASE OWNERSHIP FENCING
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_account_deletion_db(
    p_user_id uuid,
    p_worker_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_status text;
    v_claimed_by text;
BEGIN
    -- Lock job row to inspect status and worker lease
    SELECT status, claimed_by INTO v_status, v_claimed_by
    FROM public.account_deletion_jobs
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    -- If job is already completed, reject any further DB cleanup mutations
    IF v_status = 'completed' THEN
        RETURN false;
    END IF;

    -- Enforce worker lease ownership fencing
    IF p_worker_id IS NOT NULL THEN
        IF v_claimed_by IS DISTINCT FROM p_worker_id THEN
            -- Stale or preempted worker: reject cleanup
            RETURN false;
        END IF;

        IF v_status != 'processing' THEN
            RETURN false;
        END IF;
    END IF;

    -- 1. Advance job step to 'db_cleanup' under active worker lease
    UPDATE public.account_deletion_jobs
    SET status = 'processing',
        step = 'db_cleanup',
        updated_at = now()
    WHERE user_id = p_user_id
      AND (p_worker_id IS NULL OR claimed_by = p_worker_id)
      AND status != 'completed';

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

    -- 8. Advance job step to 'auth_delete' atomically under active lease
    UPDATE public.account_deletion_jobs
    SET step = 'auth_delete',
        updated_at = now()
    WHERE user_id = p_user_id
      AND (p_worker_id IS NULL OR claimed_by = p_worker_id)
      AND status != 'completed';

    -- 9. Audit logging
    INSERT INTO public.audit_logs (
        actor_kind, action, entity_type, entity_id, metadata
    )
    VALUES (
        'system',
        'account_deletion_db_completed',
        'account_deletion_jobs',
        p_user_id::text,
        jsonb_build_object('step', 'auth_delete', 'worker_id', p_worker_id)
    );

    RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_account_deletion_db(uuid, text) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 3. COMPLETE ACCOUNT DELETION JOB WITH LEASE OWNERSHIP FENCING
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_account_deletion_job(
    p_user_id uuid,
    p_success boolean,
    p_error_code text DEFAULT NULL,
    p_error_message text DEFAULT NULL,
    p_step text DEFAULT NULL,
    p_max_retries int DEFAULT 5,
    p_worker_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_status text;
    v_claimed_by text;
    v_lease_expires_at timestamptz;
    v_new_retry_count int;
    v_new_status text;
    v_effective_step text;
BEGIN
    -- Lock row to inspect current lease and status
    SELECT status, claimed_by, lease_expires_at INTO v_current_status, v_claimed_by, v_lease_expires_at
    FROM public.account_deletion_jobs
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    -- If job is already in terminal completed status, reject any subsequent modification (immutable success)
    IF v_current_status = 'completed' THEN
        RETURN false;
    END IF;

    -- Enforce worker lease ownership fencing:
    -- If p_worker_id is supplied, verify that this worker is the one currently holding the active claim.
    -- If claimed_by does not match p_worker_id, the job was reclaimed by another worker after lease expiry!
    IF p_worker_id IS NOT NULL THEN
        IF v_claimed_by IS DISTINCT FROM p_worker_id THEN
            -- Reject stale completion from expired or preempted worker
            RETURN false;
        END IF;

        -- Also ensure job is still in processing state
        IF v_current_status != 'processing' THEN
            RETURN false;
        END IF;
    END IF;

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
            jsonb_build_object('user_id', p_user_id, 'worker_id', p_worker_id)
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
                'error_message', p_error_message,
                'worker_id', p_worker_id
            )
        );
    END IF;

    RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_account_deletion_job(uuid, boolean, text, text, text, int, text) FROM PUBLIC, anon, authenticated;
