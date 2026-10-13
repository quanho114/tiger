import { jsonResponse, parseJsonBody } from '../_shared/request.ts'
import { AppError } from '../_shared/errors.ts'
import { listAdminFeedbackAsync, adminReviewFeedbackAsync } from '../_shared/concierge/feedback.ts'
import type { RouteContext } from './context.ts'

export async function handleFeedbackRoutes({
  req,
  path,
  url,
  actor,
  pool,
  requestId,
}: RouteContext): Promise<Response | null> {
  // GET /concierge/feedback or /feedback/concierge - Admin inspects feedback pipeline (§22)
  if ((path === '/concierge/feedback' || path === '/feedback/concierge') && req.method === 'GET') {
    const statusParam = url.searchParams.get('status') as 'NEW' | 'REVIEWED' | 'DISMISSED' | null
    const ratingParam = url.searchParams.get('rating') as
      'perfect' | 'too_much' | 'too_little' | 'too_expensive' | 'dislike' | null
    const records = await listAdminFeedbackAsync(pool, {
      status: statusParam || undefined,
      rating: ratingParam || undefined,
    })
    return jsonResponse({ items: records, total: records.length }, requestId, req, 200, {
      'Cache-Control': 'no-store',
    })
  }

  // PATCH /concierge/feedback/:id or /feedback/concierge/:id - Admin reviews or dismisses feedback (§22)
  const feedbackIdMatch = path.match(
    /^\/(?:concierge\/feedback|feedback\/concierge)\/([a-zA-Z0-9_-]+)$/
  )
  if (feedbackIdMatch && req.method === 'PATCH') {
    const feedbackId = feedbackIdMatch[1]
    const body = await parseJsonBody<{
      status: 'REVIEWED' | 'DISMISSED'
      admin_notes?: string
    }>(req)
    if (!body.status || !['REVIEWED', 'DISMISSED'].includes(body.status)) {
      throw new AppError('VALIDATION_ERROR', 'Trạng thái xử lý phải là REVIEWED hoặc DISMISSED')
    }
    const updated = await adminReviewFeedbackAsync(pool, feedbackId, {
      status: body.status,
      admin_notes: body.admin_notes,
      reviewed_by: actor?.userId || null,
    })

    if (pool) {
      await pool.query(
        `INSERT INTO public.audit_logs (admin_id, actor_kind, action, entity_type, entity_id, metadata)
         VALUES ($1, 'admin', 'review_concierge_feedback', 'concierge_feedback', $2, $3)`,
        [
          actor.userId,
          feedbackId,
          JSON.stringify({ status: body.status, admin_notes: body.admin_notes }),
        ]
      )
    }

    return jsonResponse(updated, requestId, req, 200, {
      'Cache-Control': 'no-store',
    })
  }

  return null
}
