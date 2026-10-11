/**
 * Importers/Callers: tests/server/concierge-meal-planner.test.ts, tests/server/concierge-grounding.test.ts, concierge-turn edge function
 * Affected API: Concierge V2 runtime state initialization
 * Data schemas: ConciergeV2SessionMutableState, ConciergeV2SessionConstraints
 * User verbatim instruction: "ủa sao tên món lạ z ko giống tui đưa á" / "update các món thật này vào, gỡ các món fake ở menu ra đi bạn"
 */
import { assertConciergeHealthy, recordConciergeDependencyFailure } from './health.ts'
import { withConciergeTurnLease } from './turn-lease.ts'
import { aggregateBehavioralMemory } from './behavioral-memory.ts'
import { understandTurn } from './understanding/engine.ts'
import { orchestrateGroundedTurn, recordMutable } from './orchestrator.ts'
import { processAndPersistExplicitMemory } from './memory-extractor.ts'
import { createConciergeV2MemoryRepository } from './memory-repository.ts'
import { emitConciergeMetric } from './observability.ts'
import type pg from 'pg'
import {
  ConciergeV2CompletionPayloadSchema,
  type ConciergeV2ActorBinding,
  type ConciergeV2Activity,
  type ConciergeV2Error,
  type ConciergeV2SessionMutableState,
  type ConciergeV2SessionRecord,
  type ConciergeV2SessionReference,
  type ConciergeV2SessionStore,
  type ConciergeV2StoredTurnResult,
  type ConciergeV2TurnRequest,
} from '../contracts/concierge-v2.ts'
import { sha256 } from '../crypto.ts'
import { AppError } from '../errors.ts'
import { ConciergeLlmOrchestrator } from './llm.ts'
import { PostgresConciergeV2SessionBackend } from './session-store-postgres.ts'
import { createConciergeV2SessionStore } from './session-store.ts'

export function productionConciergeSessionStore(pool: pg.Pool): ConciergeV2SessionStore {
  return createConciergeV2SessionStore({ backend: new PostgresConciergeV2SessionBackend(pool) })
}

export const emptyConciergeSession = (): ConciergeV2SessionMutableState => ({
  transcript: [],
  summary: '',
  draft: null,
  pending_suggestion_ids: [],
  constraints: {
    adults: 2,
    children: 0,
    appetite: 'normal' as const,
    budget_vnd: null,
    is_hard_budget: false,
    preferences: [],
    dislikes: [],
    allergies: [],
  },
})

export class ConciergeRuntimeError extends Error {
  constructor(readonly detail: ConciergeV2Error) {
    super(detail.code)
  }
}

function fail(code: ConciergeV2Error['code'], message: string): never {
  throw new ConciergeRuntimeError({ code, message })
}

function completion(
  requestId: string,
  reference: ConciergeV2SessionReference,
  record: ConciergeV2SessionRecord,
  result: ConciergeV2StoredTurnResult
) {
  return ConciergeV2CompletionPayloadSchema.parse({
    protocol_version: 'concierge-v2',
    request_id: requestId,
    ...result,
    session: {
      ...reference,
      state_version: record.state_version,
      idle_expires_at: record.idle_expires_at,
      absolute_expires_at: record.absolute_expires_at,
    },
  })
}

export async function processConciergeTurn(...args: Parameters<typeof processTurn>) {
  const started = Date.now()
  try { return await processTurn(...args) }
  catch (error) {
    const code = error instanceof ConciergeRuntimeError ? error.detail.code : ''
    const reason = code === 'STATE_CONFLICT' || code === 'SESSION_EXPIRED' || code === 'DEPENDENCY_UNAVAILABLE' ? code : 'SAFE_FAILURE'
    emitConciergeMetric({ outcome: reason === 'DEPENDENCY_UNAVAILABLE' ? 'dependency_unavailable' : 'rejected', reason, latency_ms: Date.now() - started })
    throw error
  }
}

async function processTurn(
  request: ConciergeV2TurnRequest,
  actor: ConciergeV2ActorBinding,
  dependencies: {
    pool: pg.Pool
    store: ConciergeV2SessionStore
    orchestrator?: ConciergeLlmOrchestrator
    onActivity?: (activity: ConciergeV2Activity) => void
    onSafeText?: (text: string) => void
    onReady?: (reference: ConciergeV2SessionReference) => void
    signal?: AbortSignal
  }
) {
  const started = Date.now()
  const { store, pool } = dependencies
  const existingReference = request.session ?? request.resume_session
  const loaded = existingReference
    ? await store.read(existingReference, actor)
    : await store.create({ ...emptyConciergeSession(), actor })
  if (!loaded.ok) throw new ConciergeRuntimeError(loaded.error)
  const reference =
    existingReference ??
    ('reference' in loaded ? (loaded.reference as ConciergeV2SessionReference) : undefined)
  if (!reference) fail('INTERNAL_SAFE_FAILURE', 'Không thể tạo phiên.')
  dependencies.onReady?.(reference)
  const record = loaded.record
  const operationHash = sha256(
    JSON.stringify({
      draft_operation: request.draft_operation,
      message: request.message,
      action: request.action,
      page_context: request.page_context,
      expected_state_version: request.expected_state_version ?? 1,
    })
  )
  const previous = record.idempotency.find((entry) => entry.request_id === request.request_id)
  if (previous) {
    if (previous.operation_hash !== operationHash)
      fail('IDEMPOTENCY_MISMATCH', 'Mã yêu cầu đã được sử dụng.')
    return completion(request.request_id, reference, record, previous.result)
  }
  if (request.recover_only) fail('TURN_CANCELLED', 'Chưa có kết quả đã xác nhận. Bạn có thể thử lại yêu cầu gốc.')
  if (
    request.action?.type !== 'refresh_session' &&
    request.expected_state_version !== undefined &&
    request.expected_state_version !== record.state_version
  ) {
    fail('STATE_CONFLICT', 'Phiên đã thay đổi. Vui lòng tải lại trạng thái.')
  }
  if (request.resume_session && record.state_version !== 1) fail('STATE_CONFLICT', 'Phiên đã thay đổi. Hãy tải lại trạng thái.')
  let didCommit = false
  const checkCancelled = () => {
    if (dependencies.signal?.aborted) fail('TURN_CANCELLED', 'Đã dừng xử lý phản hồi.')
  }
  let feedbackClient: pg.PoolClient | undefined
  try {
    checkCancelled()
    if (request.action?.type === 'reset_conversation') {
      const result: ConciergeV2StoredTurnResult = {
        response_id: crypto.randomUUID(),
        phase: 'DISCOVERY',
        message: 'Đã bắt đầu phiên trò chuyện mới.',
        cards: [],
        warnings: [],
      }
      const cleared = await store.compareAndSwap({
        reference,
        actor,
        expected_state_version: record.state_version,
        request_id: request.request_id,
        operation_hash: operationHash,
        next: emptyConciergeSession(),
        result,
      })
      if (!cleared.ok) throw new ConciergeRuntimeError(cleared.error)
      didCommit = true
      const deleted = await store.delete(reference, actor)
      if (!deleted.ok) throw new ConciergeRuntimeError(deleted.error)
      const created = await store.create({ ...emptyConciergeSession(), actor })
      if (!created.ok) throw new ConciergeRuntimeError(created.error)
      return completion(request.request_id, created.reference, created.record, result)
    }
    if (request.action?.type !== 'feedback_proposal') {
      if (request.message) await assertConciergeHealthy(pool)
      const memoryRepo = actor.authenticated_user_id && request.message && understandTurn(request.message, Boolean(record.pending_items?.length)).intent === 'food' && process.env.CONCIERGE_MEMORY_DISABLED !== 'true'
        ? createConciergeV2MemoryRepository(pool, { role: 'customer', userId: actor.authenticated_user_id }) : undefined
      const memorySettings = await memoryRepo?.getSettings().catch(() => undefined)
      if (memoryRepo && memorySettings?.enabled && !record.transcript.length) {
        await aggregateBehavioralMemory({ pool, actor, repository: memoryRepo }).catch(() => {})
      }
      const turn = await withConciergeTurnLease(pool, record.session_id,
        (queryPool) => orchestrateGroundedTurn(request, record, queryPool, dependencies.orchestrator, dependencies.onActivity,
          undefined, dependencies.signal))
      checkCancelled()
      const committed = await store.compareAndSwap({ reference, actor, expected_state_version: record.state_version,
        request_id: request.request_id, operation_hash: operationHash, next: turn.next, result: turn.result })
      if (!committed.ok) throw new ConciergeRuntimeError(committed.error)
      didCommit = true
      dependencies.onSafeText?.(committed.result.message)
      // Await admission; no raw-message queue or fire-and-forget Edge work.
      if (!committed.replay && request.message && memoryRepo && memorySettings?.enabled) {
        await processAndPersistExplicitMemory({ message: request.message, actor, expectedMemoryEpoch: memorySettings.memory_epoch,
          repository: memoryRepo }).catch(() => {})
      }
      emitConciergeMetric({ outcome: 'completed', reason: 'NONE', latency_ms: Date.now() - started,
        ...turn.metrics, draft: Boolean(turn.result.draft), handoff: Boolean(turn.result.handoff) })
      return completion(request.request_id, reference, committed.record, committed.result)
    }
    const action = request.action
    const suggested = record.pending_items?.some(item => item.suggestion_id === action.proposal_id && item.state_version === action.proposal_version)
    if (!suggested) fail('INVALID_HANDOFF', 'Gợi ý đã hết hiệu lực hoặc không thuộc phiên này.')
    feedbackClient = await pool.connect()
    await feedbackClient.query('BEGIN')
    await feedbackClient.query(`INSERT INTO public.concierge_feedback_aggregates (day, rating, count) VALUES (CURRENT_DATE, $1, 1)
      ON CONFLICT (day, rating) DO UPDATE SET count = concierge_feedback_aggregates.count + 1`, [action.rating])
    checkCancelled()
    const committed = await store.compareAndSwap({ reference, actor, expected_state_version: record.state_version,
      request_id: request.request_id, operation_hash: operationHash, next: recordMutable(record),
      result: { response_id: crypto.randomUUID(), phase: 'DISCOVERY', message: 'Cảm ơn bạn đã gửi phản hồi!', cards: [], warnings: [], draft: record.draft ?? undefined } })
    if (!committed.ok) throw new ConciergeRuntimeError(committed.error)
    didCommit = true
    await feedbackClient.query(committed.replay ? 'ROLLBACK' : 'COMMIT')
    return completion(request.request_id, reference, committed.record, committed.result)
  } catch (error) {
    if (error instanceof AppError && error.status === 503) await recordConciergeDependencyFailure(pool).catch(() => {})
    if (feedbackClient) await feedbackClient.query('ROLLBACK').catch(() => {})
    if (!existingReference && !didCommit && !dependencies.signal?.aborted) await store.delete(reference, actor)
    if (!didCommit && dependencies.signal?.aborted) fail('TURN_CANCELLED', 'Đã dừng xử lý. Bạn có thể kiểm tra lại yêu cầu gốc.')
    if (error instanceof ConciergeRuntimeError) throw error
    if (error instanceof Error && ['STATE_CONFLICT', 'INVALID_HANDOFF', 'PRICE_CHANGED', 'ITEM_UNAVAILABLE', 'ALLERGY_UNVERIFIED', 'AMBIGUOUS_ACCEPTANCE'].includes(error.message)) {
      fail(error.message as ConciergeV2Error['code'], 'Thao tác chưa thể thực hiện. Hãy kiểm tra lại giỏ nháp và lựa chọn.')
    }
    if (error instanceof AppError) {
      if (error.code === 'PRICE_CHANGED') fail('PRICE_CHANGED', error.message)
      if (error.code === 'MENU_ITEM_UNAVAILABLE') fail('ITEM_UNAVAILABLE', error.message)
      if (error.code === 'QUOTE_EXPIRED' || error.code === 'NOT_FOUND')
        fail('INVALID_HANDOFF', error.message)
      if (error.code === 'FORBIDDEN') fail('INVALID_HANDOFF', error.message)
    }
    if (error instanceof AppError && error.status === 503) {
      fail('DEPENDENCY_UNAVAILABLE', 'Dịch vụ trợ lý tạm thời không khả dụng.')
    }
    fail('INTERNAL_SAFE_FAILURE', 'Không thể xử lý yêu cầu an toàn. Vui lòng thử lại.')
  } finally {
    feedbackClient?.release()
  }
}
