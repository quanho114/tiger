/**
 * Tiger 345 - Concierge Data Retention & Minimization Policy
 * Based on plans/tiger-345/09-concierge-agent-design.md (§23, §28) and Task C09 (AT18)
 *
 * Core Guarantees:
 * 1. Strictly isolates ephemeral chat / concierge data from business transaction records.
 * 2. Retention targets ONLY:
 *    - `public.concierge_events` (audit logs older than cutoff, default 30 days)
 *    - `public.concierge_proposals` (expired meal proposals older than cutoff, default 3 days past expiry)
 *    - `public.concierge_conversations` (stale guest conversations older than cutoff, default 7 days)
 * 3. ABSOLUTE PROTECTION of Business Records:
 *    - `public.orders`, `public.order_items`, `public.reservations`, `public.dining_tables`, `public.table_visits`
 *      HAVE STATUTORY ACCOUNTING & LEGAL RETENTION OBLIGATIONS (5-10 years).
 *    - The retention job is structurally forbidden from deleting or mutating any business records.
 * 4. Policy status: External blocker recorded for unapproved retention policies (Gate X03).
 */

import type pg from 'pg'

export interface RetentionOptions {
  eventsRetentionDays: number
  expiredProposalsRetentionDays: number
  guestConversationsRetentionDays: number
}

export interface RetentionCleanupResult {
  deletedEventsCount: number
  deletedProposalsCount: number
  deletedGuestConversationsCount: number
  protectedBusinessRecordsPreserved: boolean
  cutoffTimestamps: {
    eventsCutoff: string
    proposalsCutoff: string
    guestConversationsCutoff: string
  }
}

export interface RetentionPolicySummary {
  eventsRetentionDays: number
  expiredProposalsRetentionDays: number
  guestConversationsRetentionDays: number
  businessRecordsPolicy: string
  approvalStatus: 'PENDING_OWNER_APPROVAL' | 'APPROVED'
  externalBlocker: string
}

export const DEFAULT_RETENTION_OPTIONS: RetentionOptions = {
  eventsRetentionDays: 30,
  expiredProposalsRetentionDays: 3,
  guestConversationsRetentionDays: 7,
}

export function getRetentionPolicySummary(): RetentionPolicySummary {
  return {
    ...DEFAULT_RETENTION_OPTIONS,
    businessRecordsPolicy:
      'Lưu trữ bắt buộc theo luật kế toán và thương mại điện tử Việt Nam (tối thiểu 5 năm đối với đơn hàng và đặt bàn). Không bao giờ xóa tự động qua retention job.',
    approvalStatus: 'PENDING_OWNER_APPROVAL',
    externalBlocker:
      'Gate X03 Nghiệp vụ: Chính sách lưu trữ và thời hạn xóa chi tiết cho chat logs và feedback cần chủ quán / Product Owner phê duyệt trước khi kích hoạt định kỳ trên production.',
  }
}

/**
 * Runs retention cleanup on ephemeral concierge data only.
 * Guaranteed never to touch orders, reservations, tables, or visits.
 */
export async function runConciergeRetentionCleanup(
  pool: pg.Pool | undefined,
  options?: Partial<RetentionOptions>
): Promise<RetentionCleanupResult> {
  const opts: RetentionOptions = {
    ...DEFAULT_RETENTION_OPTIONS,
    ...options,
  }

  const now = Date.now()
  const eventsCutoff = new Date(now - opts.eventsRetentionDays * 24 * 60 * 60 * 1000).toISOString()
  const proposalsCutoff = new Date(now - opts.expiredProposalsRetentionDays * 24 * 60 * 60 * 1000).toISOString()
  const guestConversationsCutoff = new Date(
    now - opts.guestConversationsRetentionDays * 24 * 60 * 60 * 1000
  ).toISOString()

  if (!pool) {
    return {
      deletedEventsCount: 0,
      deletedProposalsCount: 0,
      deletedGuestConversationsCount: 0,
      protectedBusinessRecordsPreserved: true,
      cutoffTimestamps: {
        eventsCutoff,
        proposalsCutoff,
        guestConversationsCutoff,
      },
    }
  }

  // 1. Delete expired events
  const eventsRes = await pool.query(
    `DELETE FROM public.concierge_events
     WHERE created_at < $1
     RETURNING id`,
    [eventsCutoff]
  )

  // 2. Delete expired proposals past cutoff
  const proposalsRes = await pool.query(
    `DELETE FROM public.concierge_proposals
     WHERE expires_at < $1
     RETURNING id`,
    [proposalsCutoff]
  )

  // 3. Delete stale guest conversations
  const guestRes = await pool.query(
    `DELETE FROM public.concierge_conversations
     WHERE actor_scope LIKE 'guest:%' AND updated_at < $1
     RETURNING id`,
    [guestConversationsCutoff]
  )

  return {
    deletedEventsCount: eventsRes.rowCount || 0,
    deletedProposalsCount: proposalsRes.rowCount || 0,
    deletedGuestConversationsCount: guestRes.rowCount || 0,
    protectedBusinessRecordsPreserved: true,
    cutoffTimestamps: {
      eventsCutoff,
      proposalsCutoff,
      guestConversationsCutoff,
    },
  }
}
