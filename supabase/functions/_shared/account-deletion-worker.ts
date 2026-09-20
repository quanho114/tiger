/**
 * Tiger 345 - Account Deletion Retry Worker (F05 & Remediation Round 2)
 *
 * Fact-Forcing Metadata:
 * - Importers/Callers:
 *   - supabase/functions/admin-api/index.ts (POST /admin-api/retention/retry-deletions, POST /admin-api/retention/run)
 *   - tests/integration/account-deletion-flow.test.ts
 * - Affected API:
 *   - POST /functions/v1/admin-api/retention/retry-deletions
 *   - POST /functions/v1/admin-api/retention/run
 * - Data Schemas:
 *   - public.account_deletion_jobs (user_id, status, step, retry_count, last_error_code, error_message, lease_expires_at, claimed_by, updated_at)
 *   - public.customer_tombstones (user_id, auth_deleted_at)
 * - Verbatim Instructions:
 *   - "4. DELETION WORKER RECOVERY:"
 *   - "- Resume được workflow từ step đã lưu."
 *   - "- Retry DB cleanup trước khi gọi Auth delete; không đảo ngược thứ tự gây orphan."
 *   - "- Reclaim hung jobs bằng lease/timeout rõ ràng."
 *   - "- Claim job atomic, idempotent, bảo lưu lịch sử tài chính/đơn hàng và tombstone account."
 *   - "- Nếu retry kiệt, giữ trạng thái terminal rõ ràng cho admin đối soát, không nuốt lỗi."
 */

import type pg from 'pg'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface RetryOptions {
  limit?: number
  leaseSeconds?: number
  maxRetries?: number
  workerId?: string
}

export interface RetryResult {
  userId: string
  success: boolean
  step?: string
  status?: string
  errorCode?: string
  errorMessage?: string
}

export async function processDeletionRetries(
  pool: pg.Pool,
  supabaseAdmin: SupabaseClient,
  options: RetryOptions = {}
): Promise<{
  processed: number
  succeeded: number
  failed: number
  results: RetryResult[]
}> {
  const limit = options.limit ?? 50
  const leaseSeconds = options.leaseSeconds ?? 300
  const maxRetries = options.maxRetries ?? 5
  const workerId = options.workerId ?? `worker-${Math.random().toString(36).slice(2, 9)}`

  // 1. Atomic job claim with lease and hung job reclamation (FOR UPDATE SKIP LOCKED)
  const jobsRes = await pool.query(
    `SELECT user_id, step, status, retry_count, last_error_code, error_message
     FROM public.claim_account_deletion_jobs($1, $2, $3, $4)`,
    [limit, leaseSeconds, maxRetries, workerId]
  )

  const results: RetryResult[] = []
  let succeeded = 0
  let failed = 0

  for (const job of jobsRes.rows) {
    const userId = job.user_id
    let currentStep: string = job.step || 'db_cleanup'

    // 2. Step Resumption: If the job failed at or before DB cleanup, ALWAYS retry DB cleanup first.
    // NEVER call Auth delete if DB cleanup has not succeeded to avoid orphan accounts.
    // Enforce worker lease ownership: pass workerId into process_account_deletion_db.
    if (currentStep === 'requested' || currentStep === 'db_cleanup') {
      try {
        const cleanupRes = await pool.query(
          `SELECT public.process_account_deletion_db($1, $2) as success`,
          [userId, workerId]
        )
        const cleaned = Boolean(cleanupRes.rows[0]?.success)
        if (!cleaned) {
          // Stale worker whose lease was expired or job was completed by another worker
          results.push({
            userId,
            success: false,
            step: 'db_cleanup',
            errorCode: 'LEASE_LOST_OR_PREEMPTED',
            errorMessage: 'Job was completed or reclaimed by another worker before DB cleanup could run',
          })
          continue
        }
        currentStep = 'auth_delete'
      } catch (dbErr: unknown) {
        const errMsg = dbErr instanceof Error ? dbErr.message : String(dbErr)
        const completeRes = await pool.query(
          `SELECT public.complete_account_deletion_job($1, false, 'DB_CLEANUP_FAILED', $2, 'db_cleanup', $3, $4) as completed`,
          [userId, errMsg, maxRetries, workerId]
        )
        const wasUpdated = Boolean(completeRes.rows[0]?.completed)
        if (wasUpdated) {
          failed++
          results.push({
            userId,
            success: false,
            step: 'db_cleanup',
            errorCode: 'DB_CLEANUP_FAILED',
            errorMessage: errMsg,
          })
        } else {
          results.push({
            userId,
            success: false,
            step: 'db_cleanup',
            errorCode: 'LEASE_LOST_OR_PREEMPTED',
            errorMessage: 'Job was completed or reclaimed by another worker before failure could be recorded',
          })
        }
        // Skip Auth delete on DB cleanup failure
        continue
      }
    }

    // 3. Step 2: Auth Provider deletion (Supabase GoTrue)
    let authSuccess = false
    let authErrorCode: string | null = null
    let authErrorMessage: string | null = null

    try {
      const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId)
      if (authError) {
        // If user is already deleted from Supabase Auth (e.g. 404 or "User not found")
        if (
          authError.status === 404 ||
          authError.message?.toLowerCase().includes('not found') ||
          authError.message?.toLowerCase().includes('does not exist')
        ) {
          authSuccess = true
        } else {
          authErrorCode = authError.name || 'AUTH_DELETE_FAILED'
          authErrorMessage = authError.message
        }
      } else {
        authSuccess = true
      }
    } catch (err: unknown) {
      authErrorCode = 'AUTH_DELETE_EXCEPTION'
      authErrorMessage = err instanceof Error ? err.message : String(err)
    }

    // 4. Update job status, customer_tombstones, and lease in database
    // Enforce worker lease ownership fencing: pass workerId to prevent stale overwrite
    const completeRes = await pool.query(
      `SELECT public.complete_account_deletion_job($1, $2, $3, $4, $5, $6, $7) as completed`,
      [
        userId,
        authSuccess,
        authErrorCode,
        authErrorMessage,
        authSuccess ? 'completed' : 'auth_delete',
        maxRetries,
        workerId,
      ]
    )
    const wasUpdated = Boolean(completeRes.rows[0]?.completed)

    if (wasUpdated) {
      if (authSuccess) {
        succeeded++
        results.push({ userId, success: true, step: 'completed', status: 'completed' })
      } else {
        failed++
        results.push({
          userId,
          success: false,
          step: 'auth_delete',
          errorCode: authErrorCode || undefined,
          errorMessage: authErrorMessage || undefined,
        })
      }
    } else {
      // Lease was expired or preempted by another worker
      results.push({
        userId,
        success: false,
        step: 'auth_delete',
        errorCode: 'LEASE_LOST_OR_PREEMPTED',
        errorMessage: 'Job was completed or reclaimed by another worker before completion could be recorded',
      })
    }
  }

  return {
    processed: jobsRes.rows.length,
    succeeded,
    failed,
    results,
  }
}
