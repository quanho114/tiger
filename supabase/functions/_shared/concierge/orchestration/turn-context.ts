/**
 * Tiger Agent V3 — Phase 4: Turn scope.
 *
 * The mutable per-turn container shared by the orchestrator, capability
 * router, handlers, and gateway executors. Session persistence stays
 * centralized in runtime (CAS); handlers only mutate scope.next/result.
 */

import type pg from 'pg'
import type {
  ConciergeV2Activity,
  ConciergeV2SessionMutableState,
  ConciergeV2SessionRecord,
  ConciergeV2StoredTurnResult,
  ConciergeV2TurnRequest,
} from '../../contracts/concierge-v2.ts'
import type { TurnBudget, ToolExchange, ModelTool, EvidenceStatus } from '../context.ts'
import type { CapabilityContext } from '../capabilities/resolver.ts'
import type { TurnUnderstanding } from '../understanding/types.ts'
import type { KnowledgeSnapshot } from '../knowledge.ts'
import type { MenuItemCatalogExtended } from '../menu-retrieval.ts'
import type { ToolEvent } from '../tools/gateway.ts'
import type { LlmResponse } from '../llm.ts'

export interface TurnHelpers {
  askModel: (
    prompt: string,
    tools?: ModelTool[],
    exchanges?: ToolExchange[],
  ) => Promise<LlmResponse>
  modelConversation: (prompt: string) => Promise<void>
  modelGroundedReply: (
    prompt: string,
    exchanges: ToolExchange[],
    evidenceStatus?: EvidenceStatus,
  ) => Promise<void>
  onActivity?: (activity: ConciergeV2Activity) => void
  onSafeText?: (text: string) => void
  signal?: AbortSignal
}

export interface TurnScope {
  request: ConciergeV2TurnRequest
  record: ConciergeV2SessionRecord
  pool: pg.Pool
  capability: CapabilityContext
  understanding: TurnUnderstanding | null
  next: ConciergeV2SessionMutableState
  result: ConciergeV2StoredTurnResult
  budget: TurnBudget
  helpers: TurnHelpers
  toolEvents: ToolEvent[]
  /** Loaded by main-context for food/faq/account/draft routes; null otherwise. */
  knowledge: KnowledgeSnapshot | null
  catalog: MenuItemCatalogExtended[]
  catalogUnavailable?: boolean
  referentItemId?: string
  /** Set by reservation-handler before gateway executes availability. */
  reservationQuery: { startsAt: string; guests: number } | null
}
