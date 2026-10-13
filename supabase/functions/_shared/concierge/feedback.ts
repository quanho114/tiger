import type pg from 'pg'
import { AppError } from '../errors.ts'

export type FeedbackRating =
  | 'perfect'
  | 'too_much'
  | 'too_little'
  | 'too_expensive'
  | 'dislike'

export interface ConciergeFeedbackRecord {
  id: string
  conversation_id?: string
  proposal_id: string
  proposal_version: number
  config_version: number | string
  rating: FeedbackRating
  feedback_text?: string
  customer_user_id: string | null
  actor_scope: string
  status: 'NEW' | 'REVIEWED' | 'DISMISSED'
  admin_notes?: string
  reviewed_by?: string | null
  reviewed_at?: string | null
  created_at: string
  updated_at: string
}

function feedbackRecord(row: Record<string, unknown>): ConciergeFeedbackRecord {
  return {
    id: String(row.id),
    conversation_id: row.conversation_id ? String(row.conversation_id) : undefined,
    proposal_id: String(row.proposal_id),
    proposal_version: Number(row.proposal_version),
    config_version: String(row.config_version),
    rating: row.rating as FeedbackRating,
    feedback_text: row.feedback_text ? String(row.feedback_text) : undefined,
    customer_user_id: row.customer_user_id ? String(row.customer_user_id) : null,
    actor_scope: String(row.actor_scope),
    status: row.status as ConciergeFeedbackRecord['status'],
    admin_notes: row.admin_notes ? String(row.admin_notes) : undefined,
    reviewed_by: row.reviewed_by ? String(row.reviewed_by) : null,
    reviewed_at: row.reviewed_at ? new Date(row.reviewed_at as string).toISOString() : null,
    created_at: new Date(row.created_at as string).toISOString(),
    updated_at: new Date(row.updated_at as string).toISOString(),
  }
}

// Historical feedback remains reviewable; new guest feedback uses anonymous daily aggregates.
export async function listAdminFeedbackAsync(
  pool: pg.Pool,
  filter?: { status?: ConciergeFeedbackRecord['status']; rating?: FeedbackRating; limit?: number }
): Promise<ConciergeFeedbackRecord[]> {
  const conditions: string[] = []
  const values: unknown[] = []
  if (filter?.status) {
    values.push(filter.status)
    conditions.push(`status = $${values.length}`)
  }
  if (filter?.rating) {
    values.push(filter.rating)
    conditions.push(`rating = $${values.length}`)
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit = Math.min(Math.max(filter?.limit ?? 100, 1), 200)
  values.push(limit)
  const result = await pool.query(
    `SELECT id, conversation_id, proposal_id, proposal_version, config_version,
            rating, feedback_text, customer_user_id, actor_scope, status,
            admin_notes, reviewed_by, reviewed_at, created_at, updated_at
     FROM public.concierge_feedback
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${values.length}`,
    values
  )
  return result.rows.map(feedbackRecord)
}

export async function adminReviewFeedbackAsync(
  pool: pg.Pool,
  feedbackId: string,
  updates: { status: 'REVIEWED' | 'DISMISSED'; admin_notes?: string; reviewed_by?: string | null }
): Promise<ConciergeFeedbackRecord> {
  const result = await pool.query(
    `UPDATE public.concierge_feedback
     SET status = $1,
         admin_notes = COALESCE($2, admin_notes),
         reviewed_by = $3,
         reviewed_at = now(),
         updated_at = now()
     WHERE id = $4
     RETURNING id, conversation_id, proposal_id, proposal_version, config_version,
               rating, feedback_text, customer_user_id, actor_scope, status,
               admin_notes, reviewed_by, reviewed_at, created_at, updated_at`,
    [updates.status, updates.admin_notes || null, updates.reviewed_by || null, feedbackId]
  )
  if (!result.rows.length) {
    throw new AppError('NOT_FOUND', 'Bản ghi phản hồi không tồn tại', 404)
  }
  return feedbackRecord(result.rows[0])
}
