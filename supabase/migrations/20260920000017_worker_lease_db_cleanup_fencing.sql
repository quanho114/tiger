/*
Fact-Forcing Metadata:
- Importers/Callers:
  - supabase/functions/_shared/account-deletion-worker.ts
  - tests/integration/account-deletion-flow.test.ts
- Affected API:
  - POST /functions/v1/admin-api/retention/retry-deletions
- Data Schemas:
  - public.account_deletion_jobs (user_id, status, step, retry_count, lease_expires_at, claimed_by)
  - public.customer_tombstones (user_id, email_hash, deletion_requested_at, db_cleaned_at, auth_deleted_at)
  - public.customer_profiles, customer_favorites, customer_addresses, orders, reservations, guest_order_claims
  - public.audit_logs
- Verbatim Instructions:
  - "Nếu migration 00016 từng được áp dụng ở môi trường nào, tạo migration mới thay vì sửa lại file cũ."
  - "Lease fencing mới bảo vệ bước hoàn tất, chưa bảo vệ DB cleanup. Sửa: kiểm quyền sở hữu lease trong mọi mutation của worker, gồm cleanup/chuyển bước/hoàn tất."
*/

-- ==============================================================================
-- Migration: 20260920000017_worker_lease_db_cleanup_fencing.sql
-- Description: Explicit migration ensuring process_account_deletion_db enforces
-- worker lease ownership fencing and rejects mutations if job is completed or claimed by another worker.
-- ==============================================================================

DROP FUNCTION IF EXISTS public.process_account_deletion_db(uuid);
DROP FUNCTION IF EXISTS public.process_account_deletion_db(uuid, text);

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

    -- If job is already completed, reject any further DB cleanup mutations (immutable terminal state)
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
