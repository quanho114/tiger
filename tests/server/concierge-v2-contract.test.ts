import { describe, expect, it } from 'vitest'
import {
  ConciergeV2CompletionEnvelopeSchema,
  ConciergeV2ErrorEnvelopeSchema,
  ConciergeV2ErrorSchema,
  ConciergeV2HandoffResultSchema,
  ConciergeV2ResponseEnvelopeSchema,
  ConciergeV2SessionCreateInputSchema,
  ConciergeV2SessionRecordSchema,
  ConciergeV2SessionReferenceSchema,
} from '../../supabase/functions/_shared/contracts/concierge-v2.js'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const REQUEST_ID = '22222222-2222-4222-8222-222222222222'
const RESPONSE_ID = '33333333-3333-4333-8333-333333333333'
const DRAFT_ID = '44444444-4444-4444-8444-444444444444'
const HANDOFF_ID = 'handoff_4d6f2a8e7b9c1d3f'
const ACTOR_ID = '88888888-8888-4888-8888-888888888888'

function createSessionCreateInput() {
  return {
    actor: { authenticated_user_id: null },
    transcript: [],
    summary: '',
    constraints: {
      adults: 2,
      children: 0,
      appetite: 'normal',
      is_hard_budget: false,
      preferences: [],
      dislikes: [],
      allergies: [],
    },
    draft: null,
    pending_suggestion_ids: [],
  }
}

function createCompletionEnvelope() {
  return {
    protocol_version: 'concierge-v2',
    request_id: REQUEST_ID,
    response_id: RESPONSE_ID,
    session: {
      session_id: SESSION_ID,
      session_capability: 'csc_4d6f2a8e7b9c1d3f5a6b7c8d9e0f1234',
      state_version: 3,
      idle_expires_at: '2026-09-22T12:45:00.000Z',
      absolute_expires_at: '2026-09-22T16:00:00.000Z',
    },
    phase: 'REVIEWING',
    message: 'Bản nháp đã sẵn sàng để xem lại.',
    cards: [],
    warnings: [],
    draft: {
      draft_id: DRAFT_ID,
      version: 2,
      review_state: 'ready_for_review',
      items: [],
      blocked_items: [],
      subtotal_vnd: 0,
      exported_version: null,
    },
  }
}

describe('Concierge V2 canonical contract', () => {
  it('uses the same completion payload for JSON and SSE', () => {
    const envelope = createCompletionEnvelope()

    expect(ConciergeV2CompletionEnvelopeSchema.parse(envelope)).toEqual(envelope)
    expect(ConciergeV2CompletionEnvelopeSchema.parse({ event: 'complete', data: envelope })).toEqual({
      event: 'complete',
      data: envelope,
    })
  })

  it('requires both session ID and opaque capability for an existing session', () => {
    expect(
      ConciergeV2SessionReferenceSchema.safeParse({
        session_id: SESSION_ID,
        session_capability: 'csc_4d6f2a8e7b9c1d3f5a6b7c8d9e0f1234',
      }).success
    ).toBe(true)
    expect(ConciergeV2SessionReferenceSchema.safeParse({ session_id: SESSION_ID }).success).toBe(false)
  })

  it('keeps session capabilities out of durable session records', () => {
    const record = {
      session_id: SESSION_ID,
      capability_hash: '4d6f2a8e7b9c1d3f5a6b7c8d9e0f12344d6f2a8e7b9c1d3f5a6b7c8d9e0f1234',
      state_version: 1,
      actor: { authenticated_user_id: ACTOR_ID },
      created_at: '2026-09-22T12:00:00.000Z',
      idle_expires_at: '2026-09-22T12:45:00.000Z',
      absolute_expires_at: '2026-09-22T16:00:00.000Z',
      transcript: [],
      summary: '',
      constraints: createSessionCreateInput().constraints,
      draft: null,
      pending_suggestion_ids: [],
      idempotency: [],
    }

    expect(ConciergeV2SessionRecordSchema.safeParse(record).success).toBe(true)
    expect(
      ConciergeV2SessionRecordSchema.safeParse({
        ...record,
        session_capability: 'csc_4d6f2a8e7b9c1d3f5a6b7c8d9e0f1234',
      }).success
    ).toBe(false)
  })

  it('bounds transcript, summary, draft, suggestions, and idempotency state', () => {
    const record = {
      session_id: SESSION_ID,
      capability_hash: '4d6f2a8e7b9c1d3f5a6b7c8d9e0f12344d6f2a8e7b9c1d3f5a6b7c8d9e0f1234',
      state_version: 1,
      actor: { authenticated_user_id: ACTOR_ID },
      created_at: '2026-09-22T12:00:00.000Z',
      idle_expires_at: '2026-09-22T12:45:00.000Z',
      absolute_expires_at: '2026-09-22T16:00:00.000Z',
      transcript: [],
      summary: '',
      constraints: createSessionCreateInput().constraints,
      draft: null,
      pending_suggestion_ids: [],
      idempotency: [],
    }

    expect(
      ConciergeV2SessionRecordSchema.safeParse({
        ...record,
        transcript: Array.from({ length: 61 }, () => ({ role: 'user', content: 'x' })),
      }).success
    ).toBe(false)
    expect(ConciergeV2SessionRecordSchema.safeParse({ ...record, summary: 'x'.repeat(2401) }).success).toBe(false)
    expect(
      ConciergeV2SessionRecordSchema.safeParse({
        ...record,
        pending_suggestion_ids: Array.from({ length: 9 }, () => '55555555-5555-4555-8555-555555555555'),
      }).success
    ).toBe(false)
  })

  it('accepts an actor-bound server session create input without a client capability', () => {
    expect(ConciergeV2SessionCreateInputSchema.safeParse(createSessionCreateInput()).success).toBe(true)
    expect(
      ConciergeV2SessionCreateInputSchema.safeParse({
        ...createSessionCreateInput(),
        session_capability: 'csc_4d6f2a8e7b9c1d3f5a6b7c8d9e0f1234',
      }).success
    ).toBe(false)
  })

  it('keeps session capabilities out of errors', () => {
    expect(
      ConciergeV2ErrorSchema.safeParse({
        code: 'SESSION_EXPIRED',
        message: 'Phiên trò chuyện đã hết hạn.',
        session_capability: 'csc_4d6f2a8e7b9c1d3f5a6b7c8d9e0f1234',
      }).success
    ).toBe(false)
  })

  it('keeps expiry, conflicts, and idempotency mismatches distinct', () => {
    const codes = ['SESSION_EXPIRED', 'STATE_CONFLICT', 'IDEMPOTENCY_MISMATCH'] as const

    for (const code of codes) {
      expect(ConciergeV2ErrorSchema.parse({ code, message: 'An toàn để hiển thị.' }).code).toBe(code)
    }
  })

  it('validates versioned errors without exposing a session capability', () => {
    const error = {
      protocol_version: 'concierge-v2',
      request_id: REQUEST_ID,
      response_id: RESPONSE_ID,
      error: {
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'Dịch vụ phiên tạm thời chưa sẵn sàng.',
        retryable: true,
      },
    }

    expect(ConciergeV2ErrorEnvelopeSchema.parse(error)).toEqual(error)
    expect(ConciergeV2ResponseEnvelopeSchema.parse(error)).toEqual(error)
    expect(
      ConciergeV2ErrorEnvelopeSchema.safeParse({
        ...error,
        session_capability: 'csc_4d6f2a8e7b9c1d3f5a6b7c8d9e0f1234',
      }).success
    ).toBe(false)
  })

  it('accepts the same completion payload through the unified response envelope', () => {
    expect(ConciergeV2ResponseEnvelopeSchema.parse(createCompletionEnvelope())).toEqual(createCompletionEnvelope())
  })

  it('represents an ambiguous acceptance as clarification, not a draft mutation', () => {
    const base = createCompletionEnvelope()

    expect(
      ConciergeV2CompletionEnvelopeSchema.safeParse({
        ...base,
        clarification: {
          reason: 'AMBIGUOUS_ACCEPTANCE',
          pending_suggestion_ids: [
            '55555555-5555-4555-8555-555555555555',
            '66666666-6666-4666-8666-666666666666',
          ],
        },
      }).success
    ).toBe(true)
  })

  it('rejects unknown-allergy, stale-price, and unavailable lines from a handoff snapshot', () => {
    const base = {
      handoff_id: HANDOFF_ID,
      draft_id: DRAFT_ID,
      draft_version: 2,
      expires_at: '2026-09-22T12:05:00.000Z',
      replay: false,
      lines: [
        {
          menu_item_id: '77777777-7777-4777-8777-777777777777',
          name: 'Món thử nghiệm',
          quantity: 1,
          note: '',
          price_vnd: 120000,
          availability: 'available',
          price_status: 'current',
          allergy_status: 'verified_safe',
        },
      ],
    }

    expect(ConciergeV2HandoffResultSchema.safeParse(base).success).toBe(true)
    expect(
      ConciergeV2HandoffResultSchema.safeParse({
        ...base,
        lines: [{ ...base.lines[0], allergy_status: 'unknown' }],
      }).success
    ).toBe(false)
    expect(
      ConciergeV2HandoffResultSchema.safeParse({
        ...base,
        lines: [{ ...base.lines[0], price_status: 'changed' }],
      }).success
    ).toBe(false)
    expect(
      ConciergeV2HandoffResultSchema.safeParse({
        ...base,
        lines: [{ ...base.lines[0], availability: 'unavailable' }],
      }).success
    ).toBe(false)
  })

  it('represents a retried handoff with the same opaque handoff ID without claiming a cart mutation', () => {
    const replay = ConciergeV2HandoffResultSchema.parse({
      handoff_id: HANDOFF_ID,
      draft_id: DRAFT_ID,
      draft_version: 2,
      expires_at: '2026-09-22T12:05:00.000Z',
      replay: true,
      lines: [],
    })

    expect(replay.handoff_id).toBe(HANDOFF_ID)
    expect('cart_mutated' in replay).toBe(false)
  })
})
