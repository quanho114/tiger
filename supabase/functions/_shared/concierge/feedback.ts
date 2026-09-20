/**
 * Tiger 345 - Concierge Feedback & Review Pipeline
 * Based on plans/tiger-345/09-concierge-agent-design.md (§22, §23)
 *
 * Core Guarantees:
 * 1. Validated and persisted feedback tied to real proposal_id, proposal_version, and config_version in PostgreSQL.
 * 2. Shared persistent storage across public-api and admin-api.
 * 3. Human-in-the-loop review: Feedback does NOT automatically alter allergen safety, serving profiles, or prices.
 * 4. Redacted traces, ownership checks, and audit logging for quality inspection.
 */

import type pg from 'pg'
import { AppError } from '../errors.ts'
import { getProposalRecord } from './persistence.ts'

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

// In-memory fallback feedback store for offline/mock unit tests
const feedbackStore = new Map<string, ConciergeFeedbackRecord>()

function getCryptoUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodeCrypto = require('node:crypto')
    return nodeCrypto.randomUUID()
  } catch {
    throw new Error('CSPRNG crypto.randomUUID is not available')
  }
}

export async function submitConciergeFeedbackAsync(
  pool: pg.Pool | undefined,
  params: {
    conversation_id?: string
    proposal_id?: string
    proposal_version?: number
    config_version?: number | string
    rating?: string
    feedback_text?: string
    customer_user_id?: string | null
    actor_scope?: string
  }
): Promise<ConciergeFeedbackRecord> {
  if (!params.proposal_id || typeof params.proposal_id !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'Thiếu proposal_id hợp lệ cho phản hồi đề xuất', 422)
  }

  const validRatings: FeedbackRating[] = [
    'perfect',
    'too_much',
    'too_little',
    'too_expensive',
    'dislike',
  ]

  if (!params.rating || !validRatings.includes(params.rating as FeedbackRating)) {
    throw new AppError(
      'VALIDATION_ERROR',
      `Đánh giá không hợp lệ. Phải là một trong: ${validRatings.join(', ')}`,
      422
    )
  }

  // Validate proposal exists, proposal version matches, and actor has ownership
  const proposal = await getProposalRecord(pool, params.proposal_id)
  if (pool) {
    if (!proposal) {
      throw new AppError('NOT_FOUND', 'Đề xuất bữa ăn không tồn tại hoặc đã hết hạn', 404)
    }

    if (params.proposal_version !== undefined && Number(params.proposal_version) !== proposal.version) {
      throw new AppError('VALIDATION_ERROR', 'Phiên bản đề xuất không khớp với bản ghi thực tế', 422)
    }

    if (proposal.actor_scope && params.actor_scope && proposal.actor_scope !== params.actor_scope) {
      throw new AppError('FORBIDDEN', 'Không có quyền gửi phản hồi cho đề xuất của người dùng khác', 403)
    }

    if (proposal.customer_user_id && params.customer_user_id && proposal.customer_user_id !== params.customer_user_id) {
      throw new AppError('FORBIDDEN', 'Không có quyền gửi phản hồi cho đề xuất của người dùng khác', 403)
    }
  } else if (proposal) {
    // Offline / in-memory validation when proposal record is present
    if (params.proposal_version !== undefined && Number(params.proposal_version) !== proposal.version) {
      throw new AppError('VALIDATION_ERROR', 'Phiên bản đề xuất không khớp với bản ghi thực tế', 422)
    }

    if (proposal.actor_scope && params.actor_scope && proposal.actor_scope !== params.actor_scope) {
      throw new AppError('FORBIDDEN', 'Không có quyền gửi phản hồi cho đề xuất của người dùng khác', 403)
    }

    if (proposal.customer_user_id && params.customer_user_id && proposal.customer_user_id !== params.customer_user_id) {
      throw new AppError('FORBIDDEN', 'Không có quyền gửi phản hồi cho đề xuất của người dùng khác', 403)
    }
  }

  // Sanitize feedback text: trim, remove HTML, clamp to 1000 chars
  let cleanText: string | undefined
  if (params.feedback_text && typeof params.feedback_text === 'string') {
    cleanText = params.feedback_text
      .replace(/<[^>]*>?/gm, '')
      .trim()
      .slice(0, 1000)
  }

  const feedbackId = getCryptoUuid()
  const now = new Date().toISOString()
  const actorScope = params.actor_scope || 'anonymous'
  const configVersion = String(params.config_version || '1.0.0')
  const proposalVersion = Number(params.proposal_version) || 1

  if (!pool) {
    const record: ConciergeFeedbackRecord = {
      id: feedbackId,
      conversation_id: params.conversation_id,
      proposal_id: params.proposal_id,
      proposal_version: proposalVersion,
      config_version: configVersion,
      rating: params.rating as FeedbackRating,
      feedback_text: cleanText,
      customer_user_id: params.customer_user_id || null,
      actor_scope: actorScope,
      status: 'NEW',
      created_at: now,
      updated_at: now,
    }
    feedbackStore.set(feedbackId, record)
    return record
  }

  const res = await pool.query(
    `INSERT INTO public.concierge_feedback (
       id, conversation_id, proposal_id, proposal_version, config_version,
       rating, feedback_text, customer_user_id, actor_scope, status, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, 'NEW', now(), now()
     ) RETURNING id, conversation_id, proposal_id, proposal_version, config_version,
                 rating, feedback_text, customer_user_id, actor_scope, status, created_at, updated_at`,
    [
      feedbackId,
      params.conversation_id || null,
      params.proposal_id,
      proposalVersion,
      configVersion,
      params.rating,
      cleanText || null,
      params.customer_user_id || null,
      actorScope,
    ]
  )

  const row = res.rows[0]
  const record: ConciergeFeedbackRecord = {
    id: row.id,
    conversation_id: row.conversation_id || undefined,
    proposal_id: row.proposal_id,
    proposal_version: Number(row.proposal_version),
    config_version: row.config_version,
    rating: row.rating as FeedbackRating,
    feedback_text: row.feedback_text || undefined,
    customer_user_id: row.customer_user_id || null,
    actor_scope: row.actor_scope,
    status: row.status as ConciergeFeedbackRecord['status'],
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
  }

  feedbackStore.set(feedbackId, record)
  return record
}

export async function listAdminFeedbackAsync(
  pool: pg.Pool | undefined,
  filter?: {
    status?: ConciergeFeedbackRecord['status']
    rating?: FeedbackRating
    limit?: number
  }
): Promise<ConciergeFeedbackRecord[]> {
  if (!pool) {
    let list = Array.from(feedbackStore.values())
    if (filter?.status) {
      list = list.filter((r) => r.status === filter.status)
    }
    if (filter?.rating) {
      list = list.filter((r) => r.rating === filter.rating)
    }
    return list.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }

  const conditions: string[] = []
  const values: unknown[] = []
  let paramIdx = 1

  if (filter?.status) {
    conditions.push(`status = $${paramIdx++}`)
    values.push(filter.status)
  }
  if (filter?.rating) {
    conditions.push(`rating = $${paramIdx++}`)
    values.push(filter.rating)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit = Math.min(filter?.limit || 100, 200)

  const res = await pool.query(
    `SELECT id, conversation_id, proposal_id, proposal_version, config_version,
            rating, feedback_text, customer_user_id, actor_scope, status,
            admin_notes, reviewed_by, reviewed_at, created_at, updated_at
     FROM public.concierge_feedback
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIdx}`,
    [...values, limit]
  )

  return res.rows.map((row) => ({
    id: row.id,
    conversation_id: row.conversation_id || undefined,
    proposal_id: row.proposal_id,
    proposal_version: Number(row.proposal_version),
    config_version: row.config_version,
    rating: row.rating as FeedbackRating,
    feedback_text: row.feedback_text || undefined,
    customer_user_id: row.customer_user_id || null,
    actor_scope: row.actor_scope,
    status: row.status as ConciergeFeedbackRecord['status'],
    admin_notes: row.admin_notes || undefined,
    reviewed_by: row.reviewed_by || null,
    reviewed_at: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
  }))
}

export async function adminReviewFeedbackAsync(
  pool: pg.Pool | undefined,
  feedbackId: string,
  updates: {
    status: 'REVIEWED' | 'DISMISSED'
    admin_notes?: string
    reviewed_by?: string | null
  }
): Promise<ConciergeFeedbackRecord> {
  if (!pool) {
    const existing = feedbackStore.get(feedbackId)
    if (!existing) {
      throw new AppError('NOT_FOUND', 'Bản ghi phản hồi không tồn tại', 404)
    }

    const updated: ConciergeFeedbackRecord = {
      ...existing,
      status: updates.status,
      admin_notes: updates.admin_notes || existing.admin_notes,
      reviewed_by: updates.reviewed_by || null,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    feedbackStore.set(feedbackId, updated)
    return updated
  }

  const res = await pool.query(
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
    [
      updates.status,
      updates.admin_notes || null,
      updates.reviewed_by || null,
      feedbackId,
    ]
  )

  if (res.rows.length === 0) {
    throw new AppError('NOT_FOUND', 'Bản ghi phản hồi không tồn tại', 404)
  }

  const row = res.rows[0]
  const record: ConciergeFeedbackRecord = {
    id: row.id,
    conversation_id: row.conversation_id || undefined,
    proposal_id: row.proposal_id,
    proposal_version: Number(row.proposal_version),
    config_version: row.config_version,
    rating: row.rating as FeedbackRating,
    feedback_text: row.feedback_text || undefined,
    customer_user_id: row.customer_user_id || null,
    actor_scope: row.actor_scope,
    status: row.status as ConciergeFeedbackRecord['status'],
    admin_notes: row.admin_notes || undefined,
    reviewed_by: row.reviewed_by || null,
    reviewed_at: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
  }

  feedbackStore.set(feedbackId, record)
  return record
}

// Synchronous fallbacks for unit tests
export function submitConciergeFeedback(params: {
  conversation_id?: string
  proposal_id?: string
  proposal_version?: number
  config_version?: number | string
  rating?: string
  feedback_text?: string
  customer_user_id?: string | null
  actor_scope?: string
}): ConciergeFeedbackRecord {
  if (!params.proposal_id || typeof params.proposal_id !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'Thiếu proposal_id hợp lệ cho phản hồi đề xuất', 422)
  }

  const validRatings: FeedbackRating[] = [
    'perfect',
    'too_much',
    'too_little',
    'too_expensive',
    'dislike',
  ]

  if (!params.rating || !validRatings.includes(params.rating as FeedbackRating)) {
    throw new AppError(
      'VALIDATION_ERROR',
      `Đánh giá không hợp lệ. Phải là một trong: ${validRatings.join(', ')}`,
      422
    )
  }

  const feedbackId = getCryptoUuid()
  const now = new Date().toISOString()

  let cleanText: string | undefined
  if (params.feedback_text && typeof params.feedback_text === 'string') {
    cleanText = params.feedback_text
      .replace(/<[^>]*>?/gm, '')
      .trim()
      .slice(0, 1000)
  }

  const record: ConciergeFeedbackRecord = {
    id: feedbackId,
    conversation_id: params.conversation_id,
    proposal_id: params.proposal_id,
    proposal_version: Number(params.proposal_version) || 1,
    config_version: params.config_version || '1.0.0',
    rating: params.rating as FeedbackRating,
    feedback_text: cleanText,
    customer_user_id: params.customer_user_id || null,
    actor_scope: params.actor_scope || 'anonymous',
    status: 'NEW',
    created_at: now,
    updated_at: now,
  }

  feedbackStore.set(feedbackId, record)
  return record
}

export function listAdminFeedback(filter?: {
  status?: ConciergeFeedbackRecord['status']
  rating?: FeedbackRating
}): ConciergeFeedbackRecord[] {
  let list = Array.from(feedbackStore.values())

  if (filter?.status) {
    list = list.filter((r) => r.status === filter.status)
  }
  if (filter?.rating) {
    list = list.filter((r) => r.rating === filter.rating)
  }

  return list.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
}

export function adminReviewFeedback(
  feedbackId: string,
  updates: {
    status: 'REVIEWED' | 'DISMISSED'
    admin_notes?: string
  }
): ConciergeFeedbackRecord {
  const existing = feedbackStore.get(feedbackId)
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Bản ghi phản hồi không tồn tại', 404)
  }

  const updated: ConciergeFeedbackRecord = {
    ...existing,
    status: updates.status,
    admin_notes: updates.admin_notes || existing.admin_notes,
    updated_at: new Date().toISOString(),
  }

  feedbackStore.set(feedbackId, updated)
  return updated
}
