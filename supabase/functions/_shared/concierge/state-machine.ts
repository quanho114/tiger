/**
 * Tiger 345 - Concierge Conversation State Machine
 * Based on plans/tiger-345/09-concierge-agent-design.md (§7)
 *
 * Core Guarantees:
 * - Deterministic transitions across conversation steps
 * - Optimistic concurrency control via state_version
 * - Session ownership binding
 * - Clear separation between recommendation, cart addition, quote, and final order confirmation
 */

import type pg from 'pg'
import type {
  ChatMessage,
  ConciergeIntent,
  ConciergeState,
  ConversationStep,
  CustomerConstraints,
} from './types.ts'
import { AppError } from '../errors.ts'
import {
  getConversationRecord,
  saveInitialConversationRecord,
  updateConversationCasRecord,
} from './persistence.ts'

export const ALLOWED_TRANSITIONS: Record<ConversationStep, ConversationStep[]> = {
  IDLE: [
    'ANSWERING',
    'RECOMMENDING_CLARIFYING',
    'RECOMMENDING_BUILDING',
    'RECOMMENDING_PROPOSAL_READY',
    'RECOMMENDING_CART_UPDATED',
    'ORDERING_COLLECTING',
    'ORDERING_QUOTED',
    'ORDERING_CONFIRMING',
    'RESERVING_COLLECTING',
    'RESERVING_CONFIRMING',
  ],
  ANSWERING: [
    'IDLE',
    'ANSWERING',
    'RECOMMENDING_CLARIFYING',
    'RECOMMENDING_BUILDING',
    'RECOMMENDING_PROPOSAL_READY',
    'RECOMMENDING_CART_UPDATED',
    'ORDERING_COLLECTING',
    'RESERVING_COLLECTING',
  ],
  RECOMMENDING_CLARIFYING: [
    'ANSWERING',
    'RECOMMENDING_BUILDING',
    'RECOMMENDING_PROPOSAL_READY',
    'RECOMMENDING_CLARIFYING',
    'ORDERING_COLLECTING',
    'RESERVING_COLLECTING',
    'IDLE',
  ],
  RECOMMENDING_BUILDING: [
    'ANSWERING',
    'RECOMMENDING_PROPOSAL_READY',
    'RECOMMENDING_CLARIFYING',
    'IDLE',
  ],
  RECOMMENDING_PROPOSAL_READY: [
    'ANSWERING',
    'RECOMMENDING_CART_UPDATED',
    'RECOMMENDING_BUILDING',
    'RECOMMENDING_CLARIFYING',
    'RECOMMENDING_PROPOSAL_READY',
    'ORDERING_COLLECTING',
    'ORDERING_QUOTED',
    'ORDERING_CONFIRMING',
    'ORDERING_SUBMITTED',
    'RESERVING_COLLECTING',
    'IDLE',
  ],
  RECOMMENDING_CART_UPDATED: [
    'ANSWERING',
    'ORDERING_COLLECTING',
    'ORDERING_QUOTED',
    'ORDERING_CONFIRMING',
    'ORDERING_SUBMITTED',
    'RECOMMENDING_BUILDING',
    'RECOMMENDING_PROPOSAL_READY',
    'RESERVING_COLLECTING',
    'IDLE',
  ],
  ORDERING_COLLECTING: [
    'ANSWERING',
    'ORDERING_QUOTED',
    'ORDERING_CONFIRMING',
    'ORDERING_SUBMITTED',
    'RECOMMENDING_BUILDING',
    'RESERVING_COLLECTING',
    'IDLE',
  ],
  ORDERING_QUOTED: [
    'ANSWERING',
    'ORDERING_CONFIRMING',
    'ORDERING_SUBMITTING',
    'ORDERING_SUBMITTED',
    'ORDERING_COLLECTING',
    'IDLE',
  ],
  ORDERING_CONFIRMING: [
    'ORDERING_SUBMITTING',
    'ORDERING_SUBMITTED',
    'ORDERING_QUOTED',
    'IDLE',
  ],
  ORDERING_SUBMITTING: [
    'ORDERING_SUBMITTED',
    'ORDERING_RECONCILING',
  ],
  ORDERING_SUBMITTED: [
    'IDLE',
    'ANSWERING',
    'ORDERING_COLLECTING',
    'ORDERING_QUOTED',
    'ORDERING_CONFIRMING',
    'RECOMMENDING_BUILDING',
    'RECOMMENDING_PROPOSAL_READY',
  ],
  ORDERING_RECONCILING: [
    'ORDERING_QUOTED',
    'ORDERING_SUBMITTED',
    'IDLE',
  ],
  RESERVING_COLLECTING: [
    'ANSWERING',
    'RESERVING_CONFIRMING',
    'RESERVING_SUBMITTING',
    'RESERVING_SUBMITTED',
    'IDLE',
  ],
  RESERVING_CONFIRMING: [
    'RESERVING_SUBMITTING',
    'RESERVING_SUBMITTED',
    'RESERVING_COLLECTING',
    'IDLE',
  ],
  RESERVING_SUBMITTING: [
    'RESERVING_SUBMITTED',
    'RESERVING_RECONCILING',
  ],
  RESERVING_SUBMITTED: [
    'IDLE',
    'ANSWERING',
    'RESERVING_COLLECTING',
    'RESERVING_CONFIRMING',
    'RECOMMENDING_BUILDING',
    'RECOMMENDING_PROPOSAL_READY',
  ],
  RESERVING_RECONCILING: [
    'RESERVING_COLLECTING',
    'RESERVING_SUBMITTED',
    'IDLE',
  ],
}

// In-memory conversation session registry for serverless edge functions
const conversationStore = new Map<string, ConciergeState>()

function getCryptoUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodeCrypto = require('node:crypto')
    return nodeCrypto.randomUUID()
  } catch {
    throw new Error('CSPRNG crypto.randomUUID is not available in current environment')
  }
}

export function generateSecureToken(): string {
  const uuid = getCryptoUuid()
  return `cst_${uuid.replace(/-/g, '')}`
}

export function generateActionId(prefix: 'act_ord_' | 'act_res_' = 'act_ord_'): string {
  const uuid = getCryptoUuid().replace(/-/g, '').slice(0, 16)
  return `${prefix}${uuid}`
}

export function createInitialState(
  conversationId?: string,
  customerUserId: string | null = null
): ConciergeState {
  const id = conversationId || getCryptoUuid()
  const token = generateSecureToken() // Must always be CSPRNG-generated, never client-supplied
  const now = new Date().toISOString()

  const defaultConstraints: CustomerConstraints = {
    adults: 2,
    children: 0,
    appetite: 'normal',
    budget_vnd: null,
    is_hard_budget: false,
    preferences: [],
    dislikes: [],
    allergies: [],
  }

  const state: ConciergeState = {
    conversation_id: id,
    state_version: 1,
    session_token: token,
    customer_user_id: customerUserId,
    current_step: 'IDLE',
    current_intent: 'general_chat',
    constraints: defaultConstraints,
    last_proposals: [],
    messages: [],
    created_at: now,
    updated_at: now,
  }

  conversationStore.set(id, JSON.parse(JSON.stringify(state)))
  return state
}

export async function getOrCreateConversationAsync(
  pool: pg.Pool | undefined,
  conversationId?: string,
  sessionToken?: string,
  customerUserId: string | null = null
): Promise<ConciergeState> {
  if (conversationId) {
    if (!sessionToken || !sessionToken.trim()) {
      throw new AppError('UNAUTHORIZED', 'Yêu cầu session_token hợp lệ để truy cập phiên hội thoại', 401)
    }

    const existing = await getConversationRecord(pool, conversationId)
    if (!existing) {
      throw new AppError('NOT_FOUND', 'Phiên trò chuyện không tồn tại hoặc đã hết hạn', 404)
    }

    if (existing.session_token !== sessionToken.trim()) {
      throw new AppError('FORBIDDEN', 'Mã phiên trò chuyện không hợp lệ', 403)
    }

    if (existing.customer_user_id) {
      if (customerUserId && customerUserId !== existing.customer_user_id) {
        throw new AppError('FORBIDDEN', 'Phiên trò chuyện thuộc về người dùng khác', 403)
      }
      if (!customerUserId) {
        throw new AppError('FORBIDDEN', 'Phiên trò chuyện yêu cầu đăng nhập tài khoản đã tạo, không có quyền truy cập', 403)
      }
    } else if (customerUserId) {
      // Guest-to-login upgrade: guest authenticates with matching token
      existing.customer_user_id = customerUserId
      existing.updated_at = new Date().toISOString()
      await updateConversationCasRecord(pool, conversationId, existing.state_version, existing)
    }

    conversationStore.set(conversationId, JSON.parse(JSON.stringify(existing)))
    return existing
  }

  const newState = createInitialState(undefined, customerUserId)
  await saveInitialConversationRecord(pool, newState)
  conversationStore.set(newState.conversation_id, JSON.parse(JSON.stringify(newState)))
  return newState
}

export function getOrCreateConversation(
  conversationId?: string,
  sessionToken?: string,
  customerUserId: string | null = null
): ConciergeState {
  if (conversationId) {
    if (!sessionToken || !sessionToken.trim()) {
      throw new AppError('UNAUTHORIZED', 'Yêu cầu session_token hợp lệ để truy cập phiên hội thoại', 401)
    }

    const existing = conversationStore.get(conversationId)
    if (!existing) {
      throw new AppError('NOT_FOUND', 'Phiên trò chuyện không tồn tại hoặc đã hết hạn', 404)
    }

    if (existing.session_token !== sessionToken.trim()) {
      throw new AppError('FORBIDDEN', 'Mã phiên trò chuyện không hợp lệ', 403)
    }

    if (existing.customer_user_id) {
      if (customerUserId && customerUserId !== existing.customer_user_id) {
        throw new AppError('FORBIDDEN', 'Phiên trò chuyện thuộc về người dùng khác', 403)
      }
      if (!customerUserId) {
        throw new AppError('FORBIDDEN', 'Phiên trò chuyện yêu cầu đăng nhập tài khoản đã tạo, không có quyền truy cập', 403)
      }
    } else if (customerUserId) {
      // Guest-to-login upgrade: guest authenticates with matching token
      existing.customer_user_id = customerUserId
      existing.updated_at = new Date().toISOString()
      conversationStore.set(conversationId, existing)
    }

    return existing
  }

  return createInitialState(undefined, customerUserId)
}

export function validateStateVersion(
  state: ConciergeState,
  clientVersion?: number
): void {
  if (typeof clientVersion !== 'number') {
    throw new AppError(
      'CONCIERGE_STATE_CONFLICT',
      'Yêu cầu state_version của phiên trò chuyện để đảm bảo tính nhất quán (tránh xung đột đồng thời).',
      409
    )
  }
  if (clientVersion !== state.state_version) {
    throw new AppError(
      'CONCIERGE_STATE_CONFLICT',
      `Phiên trò chuyện đã được cập nhật ở lượt khác (Server v${state.state_version}, Client v${clientVersion}). Vui lòng tải lại tin nhắn.`,
      409
    )
  }
}

export async function resetConversationStateAsync(
  pool: pg.Pool | undefined,
  state: ConciergeState,
  customerUserId: string | null = null
): Promise<ConciergeState> {
  const currentVersion = state.state_version
  const nextVersion = currentVersion + 1
  const newToken = generateSecureToken()
  const now = new Date().toISOString()

  const defaultConstraints: CustomerConstraints = {
    adults: 2,
    children: 0,
    appetite: 'normal',
    budget_vnd: null,
    is_hard_budget: false,
    preferences: [],
    dislikes: [],
    allergies: [],
  }

  const resetState: ConciergeState = {
    conversation_id: state.conversation_id,
    state_version: nextVersion,
    session_token: newToken,
    customer_user_id: customerUserId ?? state.customer_user_id,
    current_step: 'IDLE',
    current_intent: 'general_chat',
    constraints: defaultConstraints,
    last_proposals: [],
    messages: [],
    created_at: state.created_at,
    updated_at: now,
  }

  await updateConversationCasRecord(pool, state.conversation_id, currentVersion, resetState)
  conversationStore.set(state.conversation_id, JSON.parse(JSON.stringify(resetState)))
  return resetState
}

export function resetConversationState(
  state: ConciergeState,
  customerUserId: string | null = null
): ConciergeState {
  const nextVersion = state.state_version + 1
  const newToken = generateSecureToken()
  const now = new Date().toISOString()

  const defaultConstraints: CustomerConstraints = {
    adults: 2,
    children: 0,
    appetite: 'normal',
    budget_vnd: null,
    is_hard_budget: false,
    preferences: [],
    dislikes: [],
    allergies: [],
  }

  const resetState: ConciergeState = {
    conversation_id: state.conversation_id,
    state_version: nextVersion,
    session_token: newToken,
    customer_user_id: customerUserId ?? state.customer_user_id,
    current_step: 'IDLE',
    current_intent: 'general_chat',
    constraints: defaultConstraints,
    last_proposals: [],
    messages: [],
    created_at: state.created_at,
    updated_at: now,
  }

  conversationStore.set(state.conversation_id, JSON.parse(JSON.stringify(resetState)))
  return resetState
}

export async function transitionConversationAsync(
  pool: pg.Pool | undefined,
  state: ConciergeState,
  nextStep: ConversationStep,
  intent?: ConciergeIntent,
  updates?: Partial<Omit<ConciergeState, 'conversation_id' | 'state_version' | 'session_token'>>
): Promise<ConciergeState> {
  const allowed = ALLOWED_TRANSITIONS[state.current_step] || []

  if (nextStep !== state.current_step && !allowed.includes(nextStep) && nextStep !== 'IDLE') {
    throw new AppError(
      'VALIDATION_ERROR',
      `Không thể chuyển trạng thái từ [${state.current_step}] sang [${nextStep}]`,
      422
    )
  }

  const currentVersion = state.state_version
  const nextVersion = currentVersion + 1
  const now = new Date().toISOString()

  const updatedState: ConciergeState = {
    ...state,
    ...updates,
    current_step: nextStep,
    current_intent: intent || state.current_intent,
    state_version: nextVersion,
    updated_at: now,
  }

  await updateConversationCasRecord(pool, state.conversation_id, currentVersion, updatedState)
  conversationStore.set(state.conversation_id, JSON.parse(JSON.stringify(updatedState)))
  return updatedState
}

export function transitionConversation(
  state: ConciergeState,
  nextStep: ConversationStep,
  intent?: ConciergeIntent,
  updates?: Partial<Omit<ConciergeState, 'conversation_id' | 'state_version' | 'session_token'>>
): ConciergeState {
  const allowed = ALLOWED_TRANSITIONS[state.current_step] || []

  if (nextStep !== state.current_step && !allowed.includes(nextStep) && nextStep !== 'IDLE') {
    throw new AppError(
      'VALIDATION_ERROR',
      `Không thể chuyển trạng thái từ [${state.current_step}] sang [${nextStep}]`,
      422
    )
  }

  const nextVersion = state.state_version + 1
  const now = new Date().toISOString()

  const updatedState: ConciergeState = {
    ...state,
    ...updates,
    current_step: nextStep,
    current_intent: intent || state.current_intent,
    state_version: nextVersion,
    updated_at: now,
  }

  conversationStore.set(state.conversation_id, updatedState)
  return updatedState
}

export function appendChatMessage(
  state: ConciergeState,
  sender: 'user' | 'assistant' | 'system',
  text: string,
  cards?: ConciergeState['messages'][number]['cards']
): ConciergeState {
  const msg: ChatMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    sender,
    text,
    timestamp: new Date().toISOString(),
    cards,
  }

  const updatedMessages = [...state.messages.slice(-30), msg]
  return {
    ...state,
    messages: updatedMessages,
  }
}
