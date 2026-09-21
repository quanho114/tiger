/**
 * Tiger 345 - Single Concierge Agent Runtime Loop
 * Based on plans/tiger-345/09-concierge-agent-design.md (§6, §7, §11, §12)
 *
 * Core Guarantees:
 * 1. Single agent turn lifecycle: Intent -> Tools -> Validation -> Enveloped Cards.
 * 2. Separation of recommendation and ordering: Adding to cart requires explicit user action.
 * 3. Backend controls all prices, validation, quotes, and state transitions.
 * 4. Grounded RAG: Knowledge references are attached; unverified facts are rejected.
 */

import type pg from 'pg'
import type {
  AllergenType,
  ClarificationChoicesCardData,
  ConciergeCard,
  ConciergeIntent,
  ConciergeRequestPayload,
  ConciergeResponseEnvelope,
  ConciergeState,
  ConversationStep,
  CustomerConstraints,
  KnowledgeReference,
  OrderStatusCardData,
  PendingAction,
  ReservationStatusCardData,
} from './types.ts'
import {
  ALLOWED_TRANSITIONS,
  appendChatMessage,
  generateActionId,
  getOrCreateConversationAsync,
  resetConversationStateAsync,
  transitionConversationAsync,
  validateStateVersion,
} from './state-machine.ts'
import {
  getProposalRecord,
  saveProposalRecord,
  logConciergeEventRecord,
} from './persistence.ts'
import {
  toolCreateOrderQuote,
  toolGetCustomerContext,
  toolLookupRestaurantInfo,
  toolPrepareReservationSummary,
  toolRecommendMeal,
  toolSearchMenuItems,
  type ToolContext,
} from './tools.ts'
import { ALLERGEN_PROFILES } from './knowledge.ts'
import { verifyOrderQuote, verifyReservationHoldToken, getQuoteSecret } from '../quote.ts'
import { sha256 } from '../crypto.ts'
import { validateMealCandidate } from './validator.ts'
import { createTurnOrchestrator } from './llm-config.ts'
import { extractReservationDetails, resolveReservationDateTime } from './date-resolver.ts'
import { AppError } from '../errors.ts'
import { getConciergeFeatureFlags } from './flags.ts'

export function classifyIntent(text: string): ConciergeIntent {
  const t = text.toLowerCase()

  // 1. Order Status check
  if (t.includes('trạng thái') || t.includes('kiểm tra đơn') || t.includes('mã đơn') || t.includes('đơn hàng tg')) {
    return 'order_status'
  }

  // 2. Restaurant Info & Policies (hours, contact, address, parking, fees, verification)
  if (
    t.includes('số điện thoại') ||
    t.includes('hotline') ||
    t.includes('liên hệ') ||
    t.includes('mấy giờ') ||
    t.includes('mở cửa') ||
    t.includes('đóng cửa') ||
    t.includes('ngày lễ') ||
    t.includes('địa chỉ') ||
    t.includes('ở đâu') ||
    t.includes('đỗ xe') ||
    t.includes('đậu xe') ||
    t.includes('gửi xe') ||
    t.includes('bãi xe') ||
    t.includes('chính sách') ||
    t.includes('phí ship') ||
    t.includes('phí giao') ||
    t.includes('phòng riêng') ||
    t.includes('phòng vip') ||
    t.includes('bếp trưởng đã ký') ||
    t.includes('giữ bàn tối đa')
  ) {
    return 'restaurant_info'
  }

  // 3. Reservation
  if (
    t.includes('đặt bàn') ||
    t.includes('giữ chỗ') ||
    t.includes('bàn tiệc') ||
    t.includes('đặt trước') ||
    t.includes('đặt tiệc') ||
    t.includes('tóm tắt thông tin đặt bàn')
  ) {
    return 'reservation'
  }

  // 3b. Customer history & personalization
  if (
    t.includes('lịch sử') ||
    t.includes('đơn cũ') ||
    t.includes('món quen') ||
    (t.includes('đặt lại') && !t.includes('đặt lại món'))
  ) {
    return 'customer_history'
  }

  // Conversational historical statements without actionable request
  if (t.includes('lần trước') && !t.includes('đặt lại') && !t.includes('gợi ý') && !t.includes('tư vấn')) {
    return 'general_chat'
  }

  // 4. Food Recommendation (advisory, combo builders, portion constraints, allergen/taste preferences)
  if (
    t.includes('gợi ý') ||
    t.includes('tư vấn') ||
    t.includes('ăn gì') ||
    t.includes('mâm') ||
    (t.includes('cho') && (t.includes('người') || t.includes('khách'))) ||
    t.includes('ngân sách') ||
    t.includes('combo') ||
    t.includes('thêm món') ||
    t.includes('bớt món') ||
    t.includes('đổi món') ||
    t.includes('thay món') ||
    t.includes('món rau') ||
    t.includes('thích ăn') ||
    t.includes('muốn ăn') ||
    t.includes('không ăn') ||
    t.includes('dị ứng') ||
    t.includes('đặt lại món') ||
    t.includes('không có thịt bò') ||
    t.includes('nồi lẩu') ||
    (t.includes('thích') && t.includes('món'))
  ) {
    return 'food_recommendation'
  }

  // 5. Order / Quote
  if (
    t.includes('báo giá') ||
    t.includes('tính tiền') ||
    t.includes('lên đơn') ||
    t.includes('giao về') ||
    t.includes('ship') ||
    t.includes('đặt giao') ||
    t.includes('giao hàng') ||
    t.includes('đặt món') ||
    t.includes('đặt hàng')
  ) {
    return 'order'
  }

  // 6. Menu Lookup
  if (
    t.includes('thực đơn') ||
    t.includes('menu') ||
    t.includes('món') ||
    t.includes('giá') ||
    t.includes('bán gì') ||
    t.includes('quán có') ||
    t.includes('có bán') ||
    t.includes('đặc sản') ||
    t.includes('nướng') ||
    t.includes('lẩu') ||
    t.includes('gỏi') ||
    t.includes('cơm niêu') ||
    t.includes('ăn kèm') ||
    t.includes('hương vị') ||
    t.includes('tráng miệng') ||
    t.includes('mô tả') ||
    t.includes('có món')
  ) {
    return 'menu_lookup'
  }

  return 'general_chat'
}

function extractConstraints(
  text: string,
  existing: CustomerConstraints
): CustomerConstraints {
  const updated: CustomerConstraints = { ...existing }
  const t = text.toLowerCase()

  // 1. Extract guest counts (e.g. "4 người", "2 người lớn 1 trẻ em")
  const adultsMatch = t.match(/(\d+)\s*(người lớn|khách lớn|lớn)/)
  if (adultsMatch) {
    updated.adults = parseInt(adultsMatch[1], 10)
  } else {
    const generalMatch = t.match(/(\d+)\s*(người|khách|bạn|suất)/)
    if (generalMatch) {
      updated.adults = parseInt(generalMatch[1], 10)
    }
  }

  const childrenMatch = t.match(/(\d+)\s*(trẻ em|bé|nhỏ|em bé)/)
  if (childrenMatch) {
    updated.children = parseInt(childrenMatch[1], 10)
  }

  // 2. Extract budget (e.g. "500k", "1 triệu", "dưới 800 ngàn", "tối đa 1tr")
  const kBudgetMatch = t.match(/(\d+)\s*(k|nghìn|ngàn)/)
  if (kBudgetMatch) {
    updated.budget_vnd = parseInt(kBudgetMatch[1], 10) * 1000
    if (t.includes('tối đa') || t.includes('cố định') || t.includes('không vượt')) {
      updated.is_hard_budget = true
    }
  }

  const trBudgetMatch = t.match(/(\d+(\.\d+)?)\s*(tr|triệu)/)
  if (trBudgetMatch) {
    updated.budget_vnd = Math.round(parseFloat(trBudgetMatch[1]) * 1000000)
    if (t.includes('tối đa') || t.includes('cố định') || t.includes('không vượt')) {
      updated.is_hard_budget = true
    }
  }

  // 3. Extract allergies
  const knownAllergies: { key: AllergenType; keywords: string[] }[] = [
    { key: 'seafood', keywords: ['hải sản', 'tôm', 'cua', 'cá'] },
    { key: 'peanuts', keywords: ['đậu phộng', 'lạc'] },
    { key: 'eggs', keywords: ['trứng'] },
    { key: 'dairy', keywords: ['sữa', 'bơ', 'phô mai', 'lactose'] },
    { key: 'gluten', keywords: ['bột mì', 'gluten'] },
  ]

  for (const item of knownAllergies) {
    for (const kw of item.keywords) {
      if (t.includes(`dị ứng ${kw}`) || t.includes(`kiêng ${kw}`) || t.includes(`không ăn ${kw}`)) {
        if (!updated.allergies.includes(item.key)) {
          updated.allergies = [...updated.allergies, item.key]
        }
      }
    }
  }

  // 4. Extract appetite
  if (t.includes('ăn khỏe') || t.includes('ăn nhiều') || t.includes('no nê')) {
    updated.appetite = 'heavy'
  } else if (t.includes('ăn ít') || t.includes('thanh đạm') || t.includes('nhẹ nhàng')) {
    updated.appetite = 'light'
  }

  // 5. Extract vegetable preferences
  if (t.includes('thêm món rau') || t.includes('thêm rau') || t.includes('nhiều rau') || t.includes('món rau')) {
    if (!updated.preferences.includes('nhiều rau')) {
      updated.preferences = [...updated.preferences, 'nhiều rau']
    }
  }

  return updated
}

export async function processConciergeTurn(
  payload: ConciergeRequestPayload,
  ctx: ToolContext,
  customerUserId: string | null = null
): Promise<ConciergeResponseEnvelope> {
  // 1. Get or create state
  let state = await getOrCreateConversationAsync(
    ctx.pool,
    payload.conversation_id,
    payload.session_token,
    customerUserId
  )

  // 2. Validate client state version for optimistic concurrency (enforced on existing conversations)
  if (payload.conversation_id) {
    validateStateVersion(state, payload.state_version)
  }

  const startVersion = state.state_version
  let nextStep: ConversationStep = state.current_step
  let nextIntent: ConciergeIntent = state.current_intent
  const stateUpdates: Partial<Omit<ConciergeState, 'conversation_id' | 'state_version' | 'session_token'>> = {}

  const cards: ConciergeCard[] = []
  const suggestedActions: string[] = []
  const warnings: string[] = []
  let references: KnowledgeReference[] = []
  let replyText = ''
  let cartAddition: ConciergeResponseEnvelope['cart_addition']

  const flags = await getConciergeFeatureFlags(ctx.pool)

  // Operational Invariant (AT18):
  // When concierge_disabled is active, allow status checking for committed transactions
  // (order_status, reservation_status), but block all new mutations and generic chat.
  if (flags.concierge_disabled) {
    const isStatusAction =
      payload.action?.type === 'order_status' ||
      payload.action?.type === 'reservation_status'
    const isStatusMessage =
      Boolean(payload.message && classifyIntent(payload.message) === 'order_status')

    if (!isStatusAction && !isStatusMessage) {
      return {
        conversation_id: state.conversation_id,
        state_version: state.state_version,
        session_token: state.session_token,
        intent: 'restaurant_info',
        current_step: 'ANSWERING',
        message:
          'Tiger Concierge đang tạm dừng để nâng cấp hệ thống. Quý khách vui lòng liên hệ trực tiếp hotline 098.345.6789 hoặc đến nhà hàng tại 345 Lê Văn Sỹ, P.13, Q.3, TP.HCM để được hỗ trợ chu đáo nhất.',
        cards: [],
        suggested_actions: ['Hotline: 098.345.6789', 'Địa chỉ nhà hàng'],
        warnings: ['Dịch vụ trợ lý ảo đang tạm dừng theo cấu hình vận hành.'],
        references: [],
      }
    }
  }

  // When ordering_disabled is active, block order creation/submission mutations
  // but allow order_status checks!
  if (flags.ordering_disabled && payload.action) {
    const act = payload.action
    if (act.type === 'confirm_quote' || act.type === 'reorder_order') {
      return {
        conversation_id: state.conversation_id,
        state_version: state.state_version,
        session_token: state.session_token,
        intent: 'order',
        current_step: 'ANSWERING',
        message:
          'Tính năng đặt món qua trợ lý ảo đang tạm dừng để bảo trì. Quý khách vui lòng đặt món trực tiếp qua thực đơn trực tuyến hoặc liên hệ hotline 098.345.6789 để được phục vụ.',
        cards: [],
        suggested_actions: ['Xem thực đơn trực tuyến', 'Hotline: 098.345.6789'],
        warnings: ['Tính năng đặt hàng qua trợ lý ảo đang tạm dừng.'],
        references: [],
      }
    }
  }

  // When reservation_disabled is active, block reservation submission mutations
  // but allow reservation_status checks!
  if (flags.reservation_disabled && payload.action) {
    const act = payload.action
    if (act.type === 'confirm_reservation') {
      return {
        conversation_id: state.conversation_id,
        state_version: state.state_version,
        session_token: state.session_token,
        intent: 'reservation',
        current_step: 'ANSWERING',
        message:
          'Tính năng đặt bàn qua trợ lý ảo đang tạm dừng để bảo trì. Quý khách vui lòng đặt bàn trực tiếp tại trang Đặt bàn hoặc liên hệ hotline 098.345.6789.',
        cards: [],
        suggested_actions: ['Trang Đặt bàn', 'Hotline: 098.345.6789'],
        warnings: ['Tính năng đặt bàn qua trợ lý ảo đang tạm dừng.'],
        references: [],
      }
    }
  }

  // 3. Handle Explicit User Actions First
  if (payload.action) {
    const act = payload.action

    if (act.type === 'reset_conversation') {
      state = await resetConversationStateAsync(ctx.pool, state, customerUserId)
      await logConciergeEventRecord(ctx.pool, {
        conversation_id: state.conversation_id,
        actor_scope: ctx.actor_scope,
        turn_type: 'action',
        action_type: 'reset_conversation',
        action_result: { reset: true, new_version: state.state_version },
        state_version_before: startVersion,
        state_version_after: state.state_version,
      })
      return {
        conversation_id: state.conversation_id,
        state_version: state.state_version,
        session_token: state.session_token,
        intent: state.current_intent,
        current_step: state.current_step,
        message: 'Phiên trò chuyện đã được làm mới. Tiger Concierge sẵn sàng hỗ trợ bạn!',
        cards: [],
        suggested_actions: ['Gợi ý mâm cơm 4 người', 'Xem món đặc sản', 'Giờ mở cửa'],
        warnings: [],
        references: [],
      }
    } else if (act.type === 'add_proposal_to_cart') {
      if (!act.proposal_id) {
        throw new AppError('VALIDATION_ERROR', 'Thiếu proposal_id để thêm vào giỏ')
      }

      let proposal = state.last_proposals.find((p) => p.id === act.proposal_id)
      if (!proposal && ctx.pool) {
        proposal = (await getProposalRecord(ctx.pool, act.proposal_id)) || undefined
      }

      if (!proposal) {
        throw new AppError(
          'NOT_FOUND',
          'Mâm đề xuất không hợp lệ, không còn tồn tại hoặc đã bị chặn (BLOCKED).'
        )
      }

      // Check proposal validation status (fail-closed allergen or budget block)
      if (proposal.validation?.status === 'BLOCKED') {
        const warning = proposal.validation.warnings?.join('; ')
        const blockedMsg = warning
          ? `Mâm đề xuất bị chặn bởi hệ thống kiểm nghiệm: ${warning}`
          : 'Mâm đề xuất đã bị chặn bởi hệ thống kiểm nghiệm dị ứng hoặc ngân sách (BLOCKED).'
        throw new AppError('FORBIDDEN', blockedMsg, 403)
      }

      // Check proposal ownership against actor_scope
      if ((proposal as any).actor_scope && (proposal as any).actor_scope !== ctx.actor_scope) {
        throw new AppError(
          'FORBIDDEN',
          'Mâm đề xuất thuộc về người dùng hoặc phiên khác, không có quyền thêm vào giỏ hàng.',
          403
        )
      }

      // Check proposal expiration
      if (new Date(proposal.expires_at).getTime() < Date.now()) {
        throw new AppError('QUOTE_EXPIRED', 'Mâm đề xuất đã hết thời gian giữ giá. Vui lòng tạo đề xuất mới.', 409)
      }

      // Revalidate freshness against live catalog
      const catalogMap = new Map(ctx.catalog.map((c) => [c.id, c]))
      for (const it of proposal.items) {
        const catItem = catalogMap.get(it.menu_item_id)
        if (!catItem || !catItem.is_available) {
          throw new AppError(
            'MENU_ITEM_UNAVAILABLE',
            `Món [${catItem?.name || it.item_name || it.menu_item_id}] hiện tại không còn khả dụng tại bếp.`,
            409
          )
        }
      }

      // Revalidate live catalog prices vs proposal subtotal
      let currentCatalogSubtotal = 0
      for (const it of proposal.items) {
        const catItem = catalogMap.get(it.menu_item_id)
        currentCatalogSubtotal += (catItem?.price_vnd || 0) * it.quantity
      }

      if (currentCatalogSubtotal !== proposal.subtotal_vnd && !act.accept_price_change) {
        throw new AppError(
          'PRICE_CHANGED',
          `Giá món ăn đã thay đổi từ ${proposal.subtotal_vnd.toLocaleString('vi-VN')} đ sang ${currentCatalogSubtotal.toLocaleString('vi-VN')} đ kể từ lúc đề xuất mâm. Vui lòng xác nhận bạn đồng ý với mức giá cập nhật để thêm vào giỏ hàng.`,
          409
        )
      }

      // Strict Allergen Safety Gate:
      // If customer declared allergies, dishes with missing profile, unverified profile,
      // 'contains', 'may_contain', cross_contact_risk, or 'unknown' must be blocked as safety risks.
      if (state.constraints.allergies && state.constraints.allergies.length > 0) {
        for (const item of proposal.items) {
          const profile = ALLERGEN_PROFILES[item.menu_item_id]
          const catItem = catalogMap.get(item.menu_item_id)
          const itemName = catItem?.name || item.item_name || item.menu_item_id

          if (!profile) {
            throw new AppError(
              'FORBIDDEN',
              `Món [${itemName}] chưa có hồ sơ kiểm nghiệm dị ứng đối với dị ứng đã khai báo (${state.constraints.allergies.join(', ')}). Không thể thêm vào giỏ hàng khi chưa xác nhận an toàn.`,
              403
            )
          }

          if (!profile.verified_by_kitchen) {
            throw new AppError(
              'FORBIDDEN',
              `Hồ sơ dị ứng của món [${itemName}] chưa được bếp trưởng kiểm nghiệm thực tế (dữ liệu ước tính/demo). Để đảm bảo an toàn tuyệt đối cho thực khách có tiền sử dị ứng, món này không thể thêm vào giỏ hàng.`,
              403
            )
          }

          for (const allergy of state.constraints.allergies) {
            const status = profile.allergens ? profile.allergens[allergy] : undefined
            if (status === 'contains') {
              throw new AppError(
                'FORBIDDEN',
                `Món [${itemName}] có chứa dị nguyên [${allergy}]. Đề xuất bị chặn để bảo vệ an toàn của bạn.`,
                403
              )
            }
            if (status === 'may_contain' || profile.cross_contact_risk) {
              throw new AppError(
                'FORBIDDEN',
                `Món [${itemName}] có nguy cơ nhiễm chéo dị nguyên [${allergy}] (may_contain). Không thể đảm bảo an toàn tuyệt đối khi khách có tiền sử dị ứng đã khai báo.`,
                403
              )
            }
            if (!status || status === 'unknown') {
              throw new AppError(
                'FORBIDDEN',
                `Món [${itemName}] chưa đủ dữ liệu kiểm định về dị nguyên [${allergy}] (INSUFFICIENT_DATA). Không thể thêm vào giỏ hàng.`,
                403
              )
            }
          }
        }
      }

      // Re-run deterministic validator over live catalog and constraints
      const reval = validateMealCandidate(proposal.items, state.constraints, ctx.catalog)
      if (reval.status === 'BLOCKED') {
        const blockedMsg =
          reval.checks.find((c) => c.status === 'BLOCKED')?.message ||
          'Mâm đề xuất vi phạm an toàn dị ứng hoặc ngân sách cố định, không thể thêm vào giỏ hàng.'
        throw new AppError('FORBIDDEN', blockedMsg, 403)
      }

      if (
        state.constraints.is_hard_budget &&
        state.constraints.budget_vnd &&
        reval.subtotal_vnd > state.constraints.budget_vnd
      ) {
        throw new AppError(
          'FORBIDDEN',
          `Tổng giá sau cập nhật (${reval.subtotal_vnd.toLocaleString('vi-VN')} đ) vượt quá ngân sách cố định (${state.constraints.budget_vnd.toLocaleString('vi-VN')} đ)`,
          403
        )
      }

      // Prepare cart addition line items with real catalog names and unit prices
      cartAddition = {
        proposal_id: proposal.id,
        items: proposal.items.map((it) => {
          const catItem = catalogMap.get(it.menu_item_id)
          return {
            menu_item_id: it.menu_item_id,
            item_name: catItem?.name || it.item_name || 'Món đặc sản Tiger',
            quantity: it.quantity,
            note: it.note,
            unit_price_vnd: catItem?.price_vnd || it.unit_price_vnd || 0,
          }
        }),
      }

      nextStep = 'RECOMMENDING_CART_UPDATED'
      nextIntent = 'food_recommendation'
      stateUpdates.active_proposal_id = proposal.id

      replyText = `Đã chuyển toàn bộ ${proposal.items.length} món trong [${proposal.title}] vào giỏ hàng của bạn! Bạn có thể kiểm tra giỏ hàng để tiến hành đặt món.`
      suggestedActions.push('Xem giỏ hàng & Báo giá', 'Chọn thêm món tráng miệng', 'Tư vấn món khác')
    } else if (act.type === 'confirm_quote') {
      if (!act.quote_token) {
        throw new AppError('VALIDATION_ERROR', 'Thiếu quote_token để xác nhận đặt đơn', 422)
      }

      let verifiedQuote: ReturnType<typeof verifyOrderQuote>
      try {
        verifiedQuote = verifyOrderQuote(act.quote_token, getQuoteSecret(), { allowExpired: true })
      } catch (qErr: unknown) {
        if (qErr instanceof AppError && qErr.code === 'QUOTE_EXPIRED') {
          throw qErr
        }
        throw new AppError('QUOTE_INVALID', 'Mã báo giá không hợp lệ hoặc đã bị thay đổi', 409)
      }

      if (verifiedQuote.actor_scope !== ctx.actor_scope) {
        throw new AppError(
          'FORBIDDEN',
          'Báo giá thuộc về người dùng hoặc phiên khác, không có quyền xác nhận.',
          403
        )
      }

      if (state.current_step === 'IDLE') {
        throw new AppError(
          'VALIDATION_ERROR',
          'Không thể xác nhận đặt đơn từ trạng thái IDLE khi chưa có báo giá được khởi tạo.',
          422
        )
      }

      const qContext = (verifiedQuote.context || {}) as Record<string, unknown>

      let dineInContext: Record<string, unknown> | null = null
      let deliveryContext: Record<string, unknown> | null = null

      if (verifiedQuote.order_type === 'dine_in') {
        const tableId = (qContext.table_id as string) || (act as any).table_id
        const tableVisitId = (qContext.table_visit_id as string) || (act as any).table_visit_id
        const epoch = (qContext.epoch as number) || (act as any).epoch || 1

        // Disallow client override of signed quote context
        if ((act as any).table_id && qContext.table_id && (act as any).table_id !== qContext.table_id) {
          throw new AppError(
            'FORBIDDEN',
            'Không được phép ghi đè thông tin bàn (table_id) đã được xác thực và ký trong báo giá.',
            403
          )
        }
        if ((act as any).table_visit_id && qContext.table_visit_id && (act as any).table_visit_id !== qContext.table_visit_id) {
          throw new AppError(
            'FORBIDDEN',
            'Không được phép ghi đè thông tin phiên bàn (table_visit_id) đã được xác thực và ký trong báo giá.',
            403
          )
        }
        if ((act as any).epoch && qContext.epoch && (act as any).epoch !== qContext.epoch) {
          throw new AppError(
            'FORBIDDEN',
            'Không được phép ghi đè phiên bản bàn (epoch) đã được xác thực và ký trong báo giá.',
            403
          )
        }

        if (!tableId || !tableVisitId) {
          throw new AppError(
            'VALIDATION_ERROR',
            'Đơn tại bàn yêu cầu thông tin bàn (table_id) và phiên bàn hợp lệ (table_visit_id).',
            422
          )
        }
        dineInContext = {
          table_id: tableId,
          table_visit_id: tableVisitId,
          epoch,
        }
      } else {
        const delDetails = act.delivery_details || (qContext.delivery_details as Record<string, unknown>) || {}
        const deliveryZoneId = (delDetails as any).delivery_zone_id || qContext.delivery_zone_id
        const customerName = ((delDetails as any).customer_name as string)?.trim()
        const customerPhone = (((delDetails as any).phone || (delDetails as any).customer_phone) as string)?.trim()
        const address = ((delDetails as any).address as string)?.trim()

        if (!customerName || customerName.length < 2) {
          throw new AppError('VALIDATION_ERROR', 'Vui lòng cung cấp họ và tên người nhận để giao hàng.', 422)
        }
        const phoneRegex = /(84|0[3|5|7|8|9])+([0-9]{7,10})\b/
        if (!customerPhone || customerPhone.length < 9 || !phoneRegex.test(customerPhone)) {
          throw new AppError('VALIDATION_ERROR', 'Vui lòng cung cấp số điện thoại hợp lệ để giao hàng.', 422)
        }
        if (!address || address.length < 5) {
          throw new AppError('VALIDATION_ERROR', 'Vui lòng cung cấp địa chỉ giao hàng chi tiết.', 422)
        }
        if (!deliveryZoneId) {
          throw new AppError('VALIDATION_ERROR', 'Vui lòng chọn khu vực giao hàng hợp lệ.', 422)
        }

        deliveryContext = {
          delivery_zone_id: deliveryZoneId,
          customer_name: customerName,
          customer_phone: customerPhone,
          address: address,
          expected_shipping_fee_vnd: verifiedQuote.shipping_fee_vnd,
        }
      }

      // Compute canonical fingerprint of the exact action content
      const canonicalQuoteFingerprint = sha256(
        JSON.stringify({
          actor_scope: ctx.actor_scope,
          customer_user_id: state.customer_user_id || null,
          order_type: verifiedQuote.order_type,
          quote_token: act.quote_token,
          items: verifiedQuote.items.map((i) => ({
            menu_item_id: i.menu_item_id,
            quantity: i.quantity,
            unit_price_vnd: i.unit_price_vnd,
            note: i.note || '',
          })),
          subtotal_vnd: verifiedQuote.subtotal_vnd,
          shipping_fee_vnd: verifiedQuote.shipping_fee_vnd,
          total_vnd: verifiedQuote.total_vnd,
          dine_in: dineInContext,
          delivery: deliveryContext,
          note: act.note || '',
        })
      )

      // Derive action ID and stable business idempotency key
      const currentActionId =
        act.action_id ||
        (state.pending_action?.action_type === 'confirm_quote' &&
         (!state.pending_action.payload?.quote_token || state.pending_action.payload.quote_token === act.quote_token)
          ? state.pending_action.id
          : null) ||
        generateActionId('act_ord_')

      const stableBusinessIdempotencyKey = `concierge_order_${currentActionId}_${ctx.actor_scope}`
      const idempotencyKeyHash = sha256(stableBusinessIdempotencyKey)

      // Check if pending action already completed for safe replay matching this exact action content
      let replayedReceipt: Record<string, unknown> | null = null
      if (
        state.pending_action &&
        state.pending_action.status === 'completed' &&
        state.pending_action.action_type === 'confirm_quote'
      ) {
        const isSameAction =
          (act.action_id && act.action_id === state.pending_action.id) ||
          (!act.action_id && state.pending_action.payload?.quote_token === act.quote_token)

        if (isSameAction) {
          if (state.pending_action.actor_scope !== ctx.actor_scope) {
            throw new AppError('FORBIDDEN', 'Giao dịch thuộc về người dùng hoặc phiên khác.', 403)
          }

          if (state.pending_action.content_fingerprint !== canonicalQuoteFingerprint) {
            throw new AppError(
              'QUOTE_PAYLOAD_CHANGED',
              'Nội dung xác nhận đã bị thay đổi so với báo giá hoặc giao dịch trước đó. Vui lòng tạo báo giá mới và xác nhận lại.',
              409
            )
          }

          replayedReceipt = state.pending_action.transaction_receipt || null
        }
      }

      // Reconciliation: check if order was already committed in DB under stable business idempotency key (e.g. crash after DB commit before state update)
      if (!replayedReceipt && ctx.pool) {
        let checkIdemp: pg.QueryResult
        try {
          checkIdemp = await ctx.pool.query(
            `SELECT response_json, actor_scope, request_hash
             FROM public.idempotency_requests
             WHERE operation = 'create_order' AND key_hash = $1`,
            [idempotencyKeyHash]
          )
        } catch (dbErr: unknown) {
          throw new AppError(
            'SERVICE_UNAVAILABLE',
            'Không thể xác minh trạng thái giao dịch đã ghi nhận. Vui lòng thử lại.',
            503
          )
        }
        if (checkIdemp.rows.length > 0) {
          const existingRow = checkIdemp.rows[0]
          if (existingRow.actor_scope === ctx.actor_scope) {
            if (existingRow.request_hash && existingRow.request_hash !== canonicalQuoteFingerprint) {
              throw new AppError(
                'QUOTE_PAYLOAD_CHANGED',
                'Nội dung yêu cầu khác với giao dịch đã ghi nhận với cùng mã thao tác.',
                409
              )
            }
            if (!existingRow.response_json) {
              throw new AppError(
                'SERVICE_UNAVAILABLE',
                'Giao dịch đang được xử lý hoặc kết quả chưa xác định. Vui lòng thử lại sau.',
                503
              )
            }
            replayedReceipt = existingRow.response_json as Record<string, unknown>
          } else {
            throw new AppError(
              'FORBIDDEN',
              'Giao dịch thuộc về người dùng hoặc phiên khác, không có quyền truy cập biên nhận.',
              403
            )
          }
        }
      }

      if (replayedReceipt) {
        const prevReceipt = replayedReceipt as {
          code?: string
          order_code?: string
          status?: string
          total_vnd?: number
          created_at?: string
          order_type?: 'dine_in' | 'delivery'
        }
        const orderCode = prevReceipt.code || prevReceipt.order_code
        if (orderCode) {
          const replayCard: OrderStatusCardData = {
            type: 'order_status',
            order_code: orderCode,
            status: prevReceipt.status || 'pending',
            order_type: prevReceipt.order_type || verifiedQuote.order_type || 'delivery',
            total_vnd: Number(prevReceipt.total_vnd || verifiedQuote.total_vnd || 0),
            created_at: prevReceipt.created_at || new Date().toISOString(),
            note: `Đơn hàng ${orderCode} đã được tiếp nhận trước đó (Idempotent replay).`,
          }
          cards.push(replayCard)
          replyText = `Đơn hàng [${orderCode}] đã được tiếp nhận thành công trước đó (Trạng thái: ${prevReceipt.status || 'chờ xác nhận'}).`

          // When another action (Action B) is active, preserve Action B's step, intent, pending_action, active_quote, and constraints
          const isOtherActionActive = Boolean(
            (state.pending_action && state.pending_action.id !== currentActionId) ||
            (state.active_quote && state.active_quote.quote_token !== act.quote_token) ||
            state.pending_reservation ||
            state.current_step.startsWith('RESERVING_')
          )

          if (!isOtherActionActive) {
            nextStep = 'ORDERING_SUBMITTED'
            nextIntent = 'order'
            stateUpdates.active_quote = undefined
            stateUpdates.pending_action = {
              id: currentActionId,
              action_type: 'confirm_quote',
              actor_scope: ctx.actor_scope,
              conversation_id: state.conversation_id,
              state_version: state.state_version,
              content_fingerprint: canonicalQuoteFingerprint,
              reference_id: orderCode,
              expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
              status: 'completed',
              payload: {
                action_id: currentActionId,
                quote_token: act.quote_token,
                order_type: verifiedQuote.order_type,
                items: verifiedQuote.items,
                subtotal_vnd: verifiedQuote.subtotal_vnd,
                shipping_fee_vnd: verifiedQuote.shipping_fee_vnd,
                total_vnd: verifiedQuote.total_vnd,
                delivery_details: deliveryContext,
                dine_in_details: dineInContext,
                note: act.note || '',
              },
              stable_business_idempotency_key: stableBusinessIdempotencyKey,
              transaction_receipt: {
                code: orderCode,
                status: prevReceipt.status || 'pending',
                total_vnd: Number(prevReceipt.total_vnd || verifiedQuote.total_vnd || 0),
                order_type: prevReceipt.order_type || verifiedQuote.order_type || 'delivery',
                created_at: prevReceipt.created_at || new Date().toISOString(),
              },
              created_at: state.pending_action?.created_at || new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
            suggestedActions.push(`Kiểm tra trạng thái đơn ${orderCode}`, 'Theo dõi giao hàng', 'Đặt thêm món')
          } else {
            nextStep = state.current_step
            nextIntent = state.current_intent
          }
          state = appendChatMessage(state, 'assistant', replyText, cards)
          state = await transitionConversationAsync(ctx.pool, state, nextStep, nextIntent, {
            ...stateUpdates,
            messages: state.messages,
          })
          return {
            conversation_id: state.conversation_id,
            state_version: state.state_version,
            session_token: state.session_token,
            intent: state.current_intent,
            current_step: state.current_step,
            message: replyText,
            cards,
            suggested_actions: suggestedActions,
            warnings: [],
            references: [],
          }
        }
      }

      // Unconsumed expired quotes must be rejected - expired quotes cannot create new transactions
      if (
        verifiedQuote.is_expired ||
        (verifiedQuote.expires_at && new Date(String(verifiedQuote.expires_at)).getTime() < Date.now())
      ) {
        throw new AppError('QUOTE_EXPIRED', 'Báo giá đã hết hạn, vui lòng tạo báo giá mới.', 409)
      }

      // Pre-mutation step validation: do not execute database mutations if conversation state does not permit transition to ORDERING_SUBMITTED
      const allowedFromCurrent = ALLOWED_TRANSITIONS[state.current_step] || []
      if (
        !allowedFromCurrent.includes('ORDERING_SUBMITTED') &&
        !allowedFromCurrent.includes('ORDERING_CONFIRMING') &&
        state.current_step !== 'ORDERING_SUBMITTING'
      ) {
        throw new AppError(
          'VALIDATION_ERROR',
          `Không thể xác nhận đặt đơn từ trạng thái [${state.current_step}] khi chưa có báo giá được đề xuất hoặc xác nhận.`,
          422
        )
      }

      const requestHash = canonicalQuoteFingerprint

      if (!ctx.pool) {
        throw new AppError(
          'SERVICE_UNAVAILABLE',
          'Dịch vụ cơ sở dữ liệu chưa sẵn sàng để thực thi giao dịch đặt đơn thật.',
          503
        )
      }

      let rpcRes: pg.QueryResult
      try {
        rpcRes = await ctx.pool.query(
          `SELECT public.create_order($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) as result`,
          [
            idempotencyKeyHash,
            ctx.actor_scope,
            requestHash,
            verifiedQuote.order_type,
            state.customer_user_id || null,
            dineInContext ? JSON.stringify(dineInContext) : null,
            deliveryContext ? JSON.stringify(deliveryContext) : null,
            JSON.stringify(verifiedQuote.items),
            act.note || '',
            null,
          ]
        )
      } catch (dbErr: unknown) {
        if (dbErr && typeof dbErr === 'object') {
          const errObj = dbErr as { code?: string; message?: string }
          const code = errObj.code || ''
          const msg = errObj.message || 'Lỗi xử lý tạo đơn hàng'
          if (code === 'P0001') throw new AppError('TABLE_UNAVAILABLE', msg, 409)
          if (code === 'P0010') throw new AppError('IDEMPOTENCY_CONFLICT', msg, 409)
          if (code === 'P0011') throw new AppError('SERVICE_CLOSED', msg, 409)
          if (code === 'P0012') throw new AppError('VALIDATION_ERROR', msg, 422)
          if (code === 'P0013') throw new AppError('VISIT_CLOSED', msg, 409)
          if (code === 'P0014') throw new AppError('CAPABILITY_REVOKED', msg, 401)
          if (code === 'P0015') throw new AppError('UNSUPPORTED_ORDER_TYPE', msg, 422)
          if (code === 'P0016') throw new AppError('QUOTE_CHANGED', msg, 409)
          if (code === 'P0017') throw new AppError('ITEM_UNAVAILABLE', msg, 409)
          if (code === 'P0021') throw new AppError('ZONE_UNAVAILABLE', msg, 409)
        }
        throw dbErr
      }

      const rpcResult = (rpcRes.rows[0]?.result || rpcRes.rows[0] || {}) as {
        replayed?: boolean
        receipt?: Record<string, unknown>
        id?: string
        code?: string
        status?: string
        total_vnd?: number
        created_at?: string
      }

      const receipt = (rpcResult.receipt || rpcResult) as {
        id?: string
        code?: string
        status?: string
        total_vnd?: number
        created_at?: string
      }

      if (!receipt.code || !receipt.status) {
        throw new AppError('SERVICE_UNAVAILABLE', 'Không nhận được biên nhận giao dịch hợp lệ từ máy chủ đơn hàng.', 503)
      }

      const orderCode = receipt.code
      const orderCard: OrderStatusCardData = {
        type: 'order_status',
        order_code: orderCode,
        status: receipt.status,
        order_type: verifiedQuote.order_type,
        total_vnd: Number(receipt.total_vnd || verifiedQuote.total_vnd),
        created_at: receipt.created_at || new Date().toISOString(),
        note: `Đơn hàng ${orderCode} đã được tiếp nhận (trạng thái: ${receipt.status}).`,
      }
      cards.push(orderCard)

      const statusDesc = receipt.status === 'pending'
        ? 'chờ nhà hàng xác nhận'
        : (receipt.status === 'confirmed' ? 'đã được xác nhận' : receipt.status)

      replyText = `Đơn hàng [${receipt.code}] với tổng thanh toán ${Number(receipt.total_vnd || verifiedQuote.total_vnd).toLocaleString('vi-VN')} đ đã được gửi thành công từ báo giá hợp lệ (Trạng thái: ${statusDesc}). Nhà hàng sẽ liên hệ xác nhận đơn trong ít phút.`
      nextStep = 'ORDERING_SUBMITTED'
      nextIntent = 'order'
      stateUpdates.active_quote = undefined
      stateUpdates.pending_action = {
        id: currentActionId,
        action_type: 'confirm_quote',
        actor_scope: ctx.actor_scope,
        conversation_id: state.conversation_id,
        state_version: state.state_version,
        content_fingerprint: canonicalQuoteFingerprint,
        reference_id: receipt.code || orderCode,
        expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        status: 'completed',
        payload: {
          action_id: currentActionId,
          quote_token: act.quote_token,
          order_type: verifiedQuote.order_type,
          items: verifiedQuote.items,
          subtotal_vnd: verifiedQuote.subtotal_vnd,
          shipping_fee_vnd: verifiedQuote.shipping_fee_vnd,
          total_vnd: verifiedQuote.total_vnd,
          delivery_details: deliveryContext,
          dine_in_details: dineInContext,
          note: act.note || '',
        },
        stable_business_idempotency_key: stableBusinessIdempotencyKey,
        transaction_receipt: {
          code: receipt.code,
          status: receipt.status,
          total_vnd: Number(receipt.total_vnd || verifiedQuote.total_vnd),
          order_type: verifiedQuote.order_type,
          created_at: receipt.created_at || new Date().toISOString(),
        },
        created_at: state.pending_action?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      suggestedActions.push(`Kiểm tra trạng thái đơn ${receipt.code}`, 'Theo dõi giao hàng', 'Đặt thêm món')
    } else if (act.type === 'confirm_reservation') {
      if (state.current_step === 'IDLE') {
        throw new AppError(
          'VALIDATION_ERROR',
          'Không thể xác nhận đặt bàn từ trạng thái IDLE khi chưa có thông tin đặt bàn được thu thập.',
          422
        )
      }

      // Anti-tamper verification: check hold_token if passed
      let verifiedHold: ReturnType<typeof verifyReservationHoldToken> | undefined
      if (act.hold_token) {
        try {
          verifiedHold = verifyReservationHoldToken(act.hold_token, getQuoteSecret(), { allowExpired: true })
        } catch (holdErr: unknown) {
          throw new AppError(
            'RESERVATION_HOLD_INVALID',
            'Mã giữ chỗ (hold_token) không hợp lệ. Vui lòng tạo tóm tắt đặt bàn mới.',
            409
          )
        }

        if (verifiedHold.actor_scope !== ctx.actor_scope) {
          throw new AppError(
            'FORBIDDEN',
            'Mã giữ chỗ thuộc về người dùng hoặc phiên khác, không có quyền xác nhận.',
            403
          )
        }
      }

      const details = act.reservation_details || (verifiedHold as any) || (state.pending_reservation as any)
      if (!details) {
        throw new AppError('VALIDATION_ERROR', 'Thiếu thông tin chi tiết đặt bàn để xác nhận.', 422)
      }

      const customerName = details.customer_name?.trim()
      if (!customerName || customerName.length < 2) {
        throw new AppError('VALIDATION_ERROR', 'Tên khách hàng đặt bàn phải từ 2 ký tự trở lên.', 422)
      }

      const customerPhone = details.phone?.trim()
      const phoneRegex = /(?:84|0)(?:3[2-9]|5[25689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}\b|^(?:84|0)[35789][0-9]{8}$/
      if (!customerPhone || customerPhone.length < 9 || !phoneRegex.test(customerPhone)) {
        throw new AppError('VALIDATION_ERROR', 'Số điện thoại đặt bàn không hợp lệ (tối thiểu 9 số).', 422)
      }

      const guestCount = details.guest_count
      if (!guestCount || guestCount < 1 || guestCount > 30) {
        throw new AppError('VALIDATION_ERROR', 'Số lượng khách phải từ 1 đến 30 người.', 422)
      }

      if (!details.starts_at_iso) {
        throw new AppError('VALIDATION_ERROR', 'Thiếu thời gian bắt đầu đặt bàn (starts_at_iso).', 422)
      }

      const startsAtDate = new Date(details.starts_at_iso)
      if (isNaN(startsAtDate.getTime())) {
        throw new AppError('VALIDATION_ERROR', 'Thời gian đặt bàn không đúng định dạng.', 422)
      }

      if (verifiedHold) {
        const holdStartsAt = new Date(verifiedHold.starts_at_iso).getTime()
        if (
          verifiedHold.customer_name !== customerName ||
          verifiedHold.phone !== customerPhone ||
          verifiedHold.guest_count !== guestCount ||
          holdStartsAt !== startsAtDate.getTime()
        ) {
          throw new AppError(
            'RESERVATION_PAYLOAD_CHANGED',
            'Thông tin đặt bàn đã bị thay đổi so với phiếu tóm tắt đã phát hành. Vui lòng tạo phiếu tóm tắt mới.',
            409
          )
        }
      }

      // If pending_action exists for confirm_reservation, verify against it
      if (
        state.pending_action &&
        state.pending_action.action_type === 'confirm_reservation' &&
        state.pending_action.status === 'pending' &&
        (!act.action_id || act.action_id === state.pending_action.id)
      ) {
        const pendingDetails = state.pending_action.payload?.reservation_details as Record<string, unknown> | undefined
        if (pendingDetails) {
          const pName = (pendingDetails.customer_name as string)?.trim()
          const pPhone = (pendingDetails.phone as string)?.trim()
          const pGuests = pendingDetails.guest_count as number
          const pStartsAt = pendingDetails.starts_at_iso ? new Date(pendingDetails.starts_at_iso as string).getTime() : 0

          if (
            (pName && pName !== customerName) ||
            (pPhone && pPhone !== customerPhone) ||
            (pGuests && pGuests !== guestCount) ||
            (pStartsAt && pStartsAt !== startsAtDate.getTime())
          ) {
            throw new AppError(
              'RESERVATION_PAYLOAD_CHANGED',
              'Thông tin đặt bàn đã bị thay đổi so với phiếu tóm tắt đã phát hành. Vui lòng tạo phiếu tóm tắt mới.',
              409
            )
          }
        }
      }

      const nowMs = Date.now()

      // Compute canonical reservation fingerprint
      const canonicalReservationFingerprint = sha256(
        JSON.stringify({
          actor_scope: ctx.actor_scope,
          customer_name: customerName,
          customer_phone: customerPhone,
          starts_at: startsAtDate.toISOString(),
          guest_count: guestCount,
          seating_area_id: details.seating_area_id || null,
          note: details.note || '',
          customer_user_id: state.customer_user_id || null,
        })
      )

      // Derive action ID and stable business idempotency key
      const currentActionId =
        act.action_id ||
        (state.pending_action?.action_type === 'confirm_reservation' &&
         (!act.hold_token || state.pending_action.reference_id === act.hold_token)
          ? state.pending_action.id
          : null) ||
        generateActionId('act_res_')

      const stableBusinessIdempotencyKey = `concierge_res_${currentActionId}_${ctx.actor_scope}`
      const idempotencyKeyHash = sha256(stableBusinessIdempotencyKey)

      // Check if pending action already completed for safe replay matching this exact action content
      let replayedReceipt: Record<string, unknown> | null = null
      if (
        state.pending_action &&
        state.pending_action.status === 'completed' &&
        state.pending_action.action_type === 'confirm_reservation'
      ) {
        const isSameAction =
          (act.action_id && act.action_id === state.pending_action.id) ||
          (!act.action_id && state.pending_action.reference_id === act.hold_token)

        if (isSameAction) {
          if (state.pending_action.actor_scope !== ctx.actor_scope) {
            throw new AppError('FORBIDDEN', 'Yêu cầu đặt bàn thuộc về người dùng hoặc phiên khác.', 403)
          }

          if (state.pending_action.content_fingerprint !== canonicalReservationFingerprint) {
            throw new AppError(
              'RESERVATION_PAYLOAD_CHANGED',
              'Thông tin đặt bàn đã bị thay đổi so với yêu cầu trước đó. Vui lòng tạo tóm tắt mới và xác nhận lại.',
              409
            )
          }

          replayedReceipt = state.pending_action.transaction_receipt || null
        }
      }

      // Reconciliation: check if reservation was already committed in DB under stable business idempotency key
      if (!replayedReceipt && ctx.pool) {
        let checkIdemp: pg.QueryResult
        try {
          checkIdemp = await ctx.pool.query(
            `SELECT response_json, actor_scope, request_hash
             FROM public.idempotency_requests
             WHERE operation = 'create_reservation' AND key_hash = $1`,
            [idempotencyKeyHash]
          )
        } catch (dbErr: unknown) {
          throw new AppError(
            'SERVICE_UNAVAILABLE',
            'Không thể xác minh trạng thái yêu cầu đặt bàn đã ghi nhận. Vui lòng thử lại.',
            503
          )
        }
        if (checkIdemp.rows.length > 0) {
          const existingRow = checkIdemp.rows[0]
          if (existingRow.actor_scope === ctx.actor_scope) {
            if (existingRow.request_hash && existingRow.request_hash !== canonicalReservationFingerprint) {
              throw new AppError(
                'RESERVATION_PAYLOAD_CHANGED',
                'Thông tin đặt bàn khác với yêu cầu đã ghi nhận với cùng mã thao tác.',
                409
              )
            }
            if (!existingRow.response_json) {
              throw new AppError(
                'SERVICE_UNAVAILABLE',
                'Yêu cầu đặt bàn đang được xử lý hoặc kết quả chưa xác định. Vui lòng thử lại sau.',
                503
              )
            }
            replayedReceipt = existingRow.response_json as Record<string, unknown>
          } else {
            throw new AppError(
              'FORBIDDEN',
              'Yêu cầu đặt bàn thuộc về người dùng hoặc phiên khác, không có quyền truy cập biên nhận.',
              403
            )
          }
        }
      }

      if (replayedReceipt) {
        const prevReceipt = replayedReceipt as {
          code?: string
          reservation_code?: string
          status?: string
          starts_at_formatted?: string
          starts_at?: string
          guest_count?: number
          customer_name?: string
        }
        const resvCode = prevReceipt.code || prevReceipt.reservation_code
        if (resvCode) {
          const startsAtFormatted = prevReceipt.starts_at_formatted || (prevReceipt.starts_at ? new Date(prevReceipt.starts_at).toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: '2-digit',
          }) : '')
          const replayCard: ReservationStatusCardData = {
            type: 'reservation_status',
            reservation_code: resvCode,
            status: prevReceipt.status || 'pending',
            starts_at_formatted: startsAtFormatted,
            guest_count: prevReceipt.guest_count || guestCount,
            customer_name: prevReceipt.customer_name || customerName,
          }
          cards.push(replayCard)
          replyText = `Yêu cầu đặt bàn [${resvCode}] đã được tiếp nhận thành công trước đó (Idempotent replay). Nhà hàng sẽ liên hệ xác nhận trong ít phút.`
          const isOtherActionActive = Boolean(
            (state.pending_action && state.pending_action.id !== currentActionId) ||
            state.active_quote ||
            state.current_step.startsWith('ORDERING_') ||
            (state.pending_reservation &&
             (state.pending_reservation as any).hold_token &&
             act.hold_token &&
             (state.pending_reservation as any).hold_token !== act.hold_token)
          )

          if (!isOtherActionActive) {
            nextStep = 'RESERVING_SUBMITTED'
            nextIntent = 'reservation'
            suggestedActions.push(`Kiểm tra đặt bàn ${resvCode}`, 'Thực đơn món ngon', 'Chính sách giữ bàn')
            if (!state.pending_reservation || (state.pending_reservation as any).starts_at_iso === startsAtDate.toISOString()) {
              stateUpdates.pending_reservation = undefined
            }
            stateUpdates.pending_action = {
              id: currentActionId,
              action_type: 'confirm_reservation',
              actor_scope: ctx.actor_scope,
              conversation_id: state.conversation_id,
              state_version: state.state_version,
              content_fingerprint: canonicalReservationFingerprint,
              reference_id: resvCode,
              expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
              status: 'completed',
              payload: {
                action_id: currentActionId,
                reservation_code: resvCode,
                customer_name: customerName,
                phone: customerPhone,
                starts_at_iso: startsAtDate.toISOString(),
                guest_count: guestCount,
                seating_area_id: details.seating_area_id || null,
                note: details.note || '',
              },
              stable_business_idempotency_key: stableBusinessIdempotencyKey,
              transaction_receipt: {
                code: resvCode,
                status: prevReceipt.status || 'pending',
                starts_at_formatted: startsAtFormatted,
                guest_count: prevReceipt.guest_count || guestCount,
                customer_name: prevReceipt.customer_name || customerName,
              },
              created_at: state.pending_action?.created_at || new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
          } else {
            nextStep = state.current_step
            nextIntent = state.current_intent
          }
          state = appendChatMessage(state, 'assistant', replyText, cards)
          state = await transitionConversationAsync(ctx.pool, state, nextStep, nextIntent, {
            ...stateUpdates,
            messages: state.messages,
          })
          return {
            conversation_id: state.conversation_id,
            state_version: state.state_version,
            session_token: state.session_token,
            intent: state.current_intent,
            current_step: state.current_step,
            message: replyText,
            cards,
            suggested_actions: suggestedActions,
            warnings: [],
            references: [],
          }
        }
      }

      if (!replayedReceipt && verifiedHold?.is_expired) {
        throw new AppError(
          'RESERVATION_HOLD_INVALID',
          'Mã giữ chỗ (hold_token) đã hết hạn. Vui lòng tạo tóm tắt đặt bàn mới.',
          409
        )
      }

      // Timing checks for new reservations
      if (startsAtDate.getTime() <= nowMs) {
        throw new AppError('VALIDATION_ERROR', 'Thời gian đặt bàn phải ở tương lai.', 422)
      }
      if ((startsAtDate.getTime() - nowMs) < 30 * 60 * 1000) {
        throw new AppError('VALIDATION_ERROR', 'Thời gian đặt bàn phải trước ít nhất 30 phút.', 422)
      }
      if ((startsAtDate.getTime() - nowMs) > 30 * 24 * 60 * 60 * 1000) {
        throw new AppError('VALIDATION_ERROR', 'Chỉ nhận đặt bàn trong vòng 30 ngày tới.', 422)
      }

      // Pre-mutation step validation: do not execute database mutations if conversation state does not permit transition to RESERVING_SUBMITTED
      const allowedFromCurrent = ALLOWED_TRANSITIONS[state.current_step] || []
      if (
        !allowedFromCurrent.includes('RESERVING_SUBMITTED') &&
        !allowedFromCurrent.includes('RESERVING_CONFIRMING') &&
        state.current_step !== 'RESERVING_SUBMITTING'
      ) {
        throw new AppError(
          'VALIDATION_ERROR',
          `Không thể xác nhận đặt bàn từ trạng thái [${state.current_step}] khi chưa có thông tin đặt bàn được thu thập hoặc xác nhận.`,
          422
        )
      }

      if (!ctx.pool) {
        throw new AppError(
          'SERVICE_UNAVAILABLE',
          'Dịch vụ cơ sở dữ liệu chưa sẵn sàng để thực thi giao dịch đặt bàn thật.',
          503
        )
      }

      const requestHash = sha256(
        JSON.stringify({
          actor_scope: ctx.actor_scope,
          customer_name: customerName,
          customer_phone: customerPhone,
          starts_at: startsAtDate.toISOString(),
          guest_count: guestCount,
          seating_area_id: details.seating_area_id || null,
          note: details.note || '',
          customer_user_id: state.customer_user_id || null,
        })
      )

      let rpcRes: pg.QueryResult
      try {
        rpcRes = await ctx.pool.query(
          `SELECT public.create_reservation($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) as result`,
          [
            idempotencyKeyHash,
            requestHash,
            ctx.actor_scope,
            customerName,
            customerPhone,
            startsAtDate.toISOString(),
            guestCount,
            details.seating_area_id || null,
            details.note || '',
            state.customer_user_id || null,
            null,
          ]
        )
      } catch (dbErr: unknown) {
        if (dbErr && typeof dbErr === 'object') {
          const errObj = dbErr as { code?: string; message?: string }
          const code = errObj.code || ''
          const msg = errObj.message || 'Lỗi đặt bàn'
          if (code === 'P0001') throw new AppError('AREA_UNAVAILABLE', msg, 409)
          if (code === 'P0010') throw new AppError('IDEMPOTENCY_CONFLICT', msg, 409)
          if (code === 'P0011') throw new AppError('SERVICE_CLOSED', msg, 409)
          if (code === 'P0012') throw new AppError('VALIDATION_ERROR', msg, 422)
          if (code === 'P0020') throw new AppError('BOOKING_DISABLED', msg, 409)
          if (code === 'P0021') throw new AppError('RESERVATION_NOTICE_TOO_SHORT', msg, 422)
          if (code === 'P0022') throw new AppError('RESERVATION_TOO_FAR_AHEAD', msg, 422)
        }
        throw dbErr
      }

      const rpcResult = (rpcRes.rows[0]?.result || rpcRes.rows[0] || {}) as {
        replayed?: boolean
        receipt?: Record<string, unknown>
        id?: string
        code?: string
        status?: string
        starts_at?: string
        guest_count?: number
        customer_name?: string
      }

      const receipt = (rpcResult.receipt || rpcResult) as {
        id?: string
        code?: string
        status?: string
        starts_at?: string
        guest_count?: number
        customer_name?: string
      }

      if (!receipt.code) {
        throw new AppError('SERVICE_UNAVAILABLE', 'Không nhận được mã xác nhận đặt bàn hợp lệ từ máy chủ.', 503)
      }

      const resvCode = receipt.code
      const startsAtFormatted = new Date(receipt.starts_at || startsAtDate).toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
      })

      const resStatusCard: ReservationStatusCardData = {
        type: 'reservation_status',
        reservation_code: resvCode,
        status: receipt.status || 'pending',
        starts_at_formatted: startsAtFormatted,
        guest_count: receipt.guest_count || guestCount,
        customer_name: receipt.customer_name || customerName,
      }
      cards.push(resStatusCard)

      nextStep = 'RESERVING_SUBMITTED'
      nextIntent = 'reservation'
      stateUpdates.pending_reservation = undefined
      stateUpdates.pending_action = {
        id: currentActionId,
        action_type: 'confirm_reservation',
        actor_scope: ctx.actor_scope,
        conversation_id: state.conversation_id,
        state_version: state.state_version,
        content_fingerprint: canonicalReservationFingerprint,
        reference_id: resvCode,
        expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        status: 'completed',
        payload: {
          action_id: currentActionId,
          reservation_code: resvCode,
          customer_name: customerName,
          phone: customerPhone,
          starts_at_iso: startsAtDate.toISOString(),
          guest_count: guestCount,
          seating_area_id: details.seating_area_id || null,
          note: details.note || '',
        },
        stable_business_idempotency_key: stableBusinessIdempotencyKey,
        transaction_receipt: {
          code: resvCode,
          status: receipt.status || 'pending',
          starts_at_formatted: startsAtFormatted,
          guest_count: receipt.guest_count || guestCount,
          customer_name: receipt.customer_name || customerName,
        },
        created_at: state.pending_action?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      replyText = `Tiger 345 đã nhận yêu cầu đặt bàn [Mã đặt bàn: ${resvCode}] cho ${guestCount} khách lúc ${startsAtFormatted} (Trạng thái: Chờ nhà hàng xác nhận - PENDING). Nhà hàng sẽ liên hệ qua SĐT ${customerPhone} trong vòng 15 phút để hoàn tất giữ chỗ.`
      suggestedActions.push(`Kiểm tra đặt bàn ${resvCode}`, 'Thực đơn món ngon', 'Chính sách giữ bàn')
    } else if (act.type === 'answer_clarification') {
      if (act.choice_field === 'guests' && act.choice_value) {
        state.constraints.adults = parseInt(act.choice_value, 10) || 2
      } else if (act.choice_field === 'appetite' && act.choice_value) {
        state.constraints.appetite = act.choice_value as 'light' | 'normal' | 'heavy'
      }

      // Re-trigger recommendation with updated constraints
      const recResult = await toolRecommendMeal(state.constraints, ctx)
      for (const prop of recResult.proposals) {
        await saveProposalRecord(
          ctx.pool,
          prop,
          state.conversation_id,
          ctx.actor_scope,
          state.customer_user_id,
          state.constraints.budget_vnd
        )
      }

      nextStep = 'RECOMMENDING_PROPOSAL_READY'
      nextIntent = 'food_recommendation'
      stateUpdates.last_proposals = recResult.proposals

      for (const prop of recResult.proposals) {
        cards.push({
          type: 'meal_recommendation',
          proposal: prop,
        })
        warnings.push(...prop.validation.warnings)
      }

      replyText = `Dựa trên số lượng ${state.constraints.adults} khách và khẩu vị bạn chọn, bếp trưởng Tiger 345 xin gửi 3 phương án thực đơn đã được kiểm định cân bằng:`
      suggestedActions.push('Thêm mâm số 1 vào giỏ', 'Thêm mâm số 2 vào giỏ', 'Xem thông tin giờ mở cửa')
    } else if (act.type === 'feedback_proposal') {
      if (!act.proposal_id) {
        throw new AppError('VALIDATION_ERROR', 'Thiếu proposal_id để gửi phản hồi', 422)
      }
      if (!act.rating) {
        throw new AppError('VALIDATION_ERROR', 'Thiếu rating đánh giá mâm đề xuất', 422)
      }

      let proposal = state.last_proposals.find((p) => p.id === act.proposal_id)
      if (!proposal && ctx.pool) {
        proposal = (await getProposalRecord(ctx.pool, act.proposal_id)) || undefined
      }

      if (!proposal) {
        throw new AppError('NOT_FOUND', 'Không tìm thấy mâm đề xuất tương ứng để gửi phản hồi', 404)
      }

      if ((proposal as any).actor_scope && (proposal as any).actor_scope !== ctx.actor_scope) {
        throw new AppError('FORBIDDEN', 'Không có quyền gửi phản hồi cho đề xuất của người dùng khác', 403)
      }

      if (ctx.pool) {
        await ctx.pool.query(
          `INSERT INTO public.concierge_feedback (
             proposal_id, proposal_version, config_version, rating, feedback_text,
             actor_scope, customer_user_id, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
          [
            act.proposal_id,
            act.proposal_version || proposal.version || 1,
            '1.0',
            act.rating,
            act.feedback_text || '',
            ctx.actor_scope,
            state.customer_user_id || null,
          ]
        )
      }

      replyText = 'Cảm ơn bạn đã gửi phản hồi! Đóng góp của bạn giúp bếp trưởng Tiger 345 hoàn thiện thực đơn tốt hơn.'
      suggestedActions.push('Gợi ý mâm khác', 'Xem thực đơn', 'Đặt bàn')
    } else if (act.type === 'reorder_order') {
      if (!customerUserId || !ctx.actor_scope?.startsWith('user:')) {
        throw new AppError('FORBIDDEN', 'Bạn cần đăng nhập để đặt lại đơn hàng cũ', 403)
      }

      if (!ctx.pool) {
        throw new AppError('SERVICE_UNAVAILABLE', 'Dịch vụ cơ sở dữ liệu chưa sẵn sàng để tra cứu đơn cũ.', 503)
      }

      // Find the order: by act.order_id, act.order_code, or latest order for customerUserId
      let orderQuery = `SELECT id, code, order_type, delivery_zone_id, status FROM public.orders WHERE customer_user_id = $1`
      const queryParams: unknown[] = [customerUserId]

      if (act.order_id) {
        orderQuery += ` AND id = $2`
        queryParams.push(act.order_id)
      } else if (act.order_code) {
        orderQuery += ` AND code = $2`
        queryParams.push(act.order_code)
      } else {
        orderQuery += ` ORDER BY created_at DESC LIMIT 1`
      }

      const orderRes = await ctx.pool.query(orderQuery, queryParams)
      if (orderRes.rows.length === 0) {
        throw new AppError('NOT_FOUND', 'Không tìm thấy đơn hàng trước đây để đặt lại.', 404)
      }

      const pastOrder = orderRes.rows[0]

      // Fetch order items
      const itemsRes = await ctx.pool.query(
        `SELECT oi.menu_item_id, oi.item_name, oi.quantity, oi.unit_price_vnd::numeric as unit_price_vnd
         FROM public.order_items oi
         WHERE oi.order_id = $1`,
        [pastOrder.id]
      )

      if (itemsRes.rows.length === 0) {
        throw new AppError('NOT_FOUND', `Đơn hàng [${pastOrder.code}] không có món nào để đặt lại.`, 404)
      }

      // Live revalidation against current catalog (price and availability)
      const catalogMap = new Map((ctx.catalog || []).map((c) => [c.id, c]))
      const unavailableItems: string[] = []
      const priceChanges: { name: string; oldPrice: number; newPrice: number }[] = []
      const validItems: { menu_item_id: string; quantity: number; note?: string }[] = []

      for (const oi of itemsRes.rows) {
        const catItem = catalogMap.get(oi.menu_item_id)
        if (!catItem || !catItem.is_available) {
          unavailableItems.push(catItem?.name || oi.item_name || oi.menu_item_id)
        } else {
          const oldPrice = Number(oi.unit_price_vnd)
          const newPrice = Number(catItem.price_vnd)
          if (newPrice !== oldPrice) {
            priceChanges.push({
              name: catItem.name,
              oldPrice,
              newPrice,
            })
          }
          validItems.push({
            menu_item_id: oi.menu_item_id,
            quantity: oi.quantity,
          })
        }
      }

      if (validItems.length === 0) {
        replyText = `Tất cả các món trong đơn cũ [${pastOrder.code}] (${unavailableItems.join(', ')}) hiện tại đều đã hết hàng hoặc không còn khả dụng tại bếp. Bạn vui lòng chọn món khác từ thực đơn nhé.`
        nextStep = 'ANSWERING'
        nextIntent = 'order'
        suggestedActions.push('Xem thực đơn hôm nay', 'Tư vấn món ngon', 'Món đặc sản')
      } else {
        const quoteResult = await toolCreateOrderQuote(
          {
            order_type: pastOrder.order_type || 'delivery',
            items: validItems,
            context: {
              delivery_zone_id: pastOrder.delivery_zone_id,
            },
          },
          ctx
        )

        const actionId = generateActionId('act_ord_')
        quoteResult.quoteCard.action_id = actionId
        cards.push(quoteResult.quoteCard)
        stateUpdates.active_quote = quoteResult.quoteCard
        stateUpdates.pending_action = {
          id: actionId,
          action_type: 'confirm_quote',
          actor_scope: ctx.actor_scope,
          conversation_id: state.conversation_id,
          state_version: state.state_version,
          content_fingerprint: sha256(
            JSON.stringify({
              actor_scope: ctx.actor_scope,
              customer_user_id: state.customer_user_id || null,
              order_type: quoteResult.quoteCard.order_type,
              quote_token: quoteResult.quoteCard.quote_token,
              items: quoteResult.quoteCard.items.map((i) => ({
                menu_item_id: i.menu_item_id,
                quantity: i.quantity,
                unit_price_vnd: i.unit_price_vnd,
                note: i.note || '',
              })),
              subtotal_vnd: quoteResult.quoteCard.subtotal_vnd,
              shipping_fee_vnd: quoteResult.quoteCard.shipping_fee_vnd,
              total_vnd: quoteResult.quoteCard.total_vnd,
            })
          ),
          reference_id: quoteResult.quoteCard.quote_token,
          expires_at: quoteResult.quoteCard.expires_at,
          status: 'pending',
          payload: {
            action_id: actionId,
            quote_token: quoteResult.quoteCard.quote_token,
            order_type: quoteResult.quoteCard.order_type,
            items: quoteResult.quoteCard.items,
            subtotal_vnd: quoteResult.quoteCard.subtotal_vnd,
            shipping_fee_vnd: quoteResult.quoteCard.shipping_fee_vnd,
            total_vnd: quoteResult.quoteCard.total_vnd,
            target_summary: quoteResult.quoteCard.target_summary,
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        nextStep = 'ORDERING_CONFIRMING'
        nextIntent = 'order'

        let reorderMsg = `Báo giá mới để đặt lại đơn [${pastOrder.code}] đã sẵn sàng với tổng tiền ${quoteResult.quoteCard.total_vnd.toLocaleString('vi-VN')} đ (Hiệu lực trong 5 phút).`
        if (unavailableItems.length > 0) {
          reorderMsg += `\n- Lưu ý hết hàng: Món [${unavailableItems.join(', ')}] hiện không còn khả dụng nên đã được loại khỏi đơn.`
          warnings.push(`Món [${unavailableItems.join(', ')}] đã hết hàng nên không được đưa vào báo giá.`)
        }
        if (priceChanges.length > 0) {
          reorderMsg += `\n- Cập nhật giá mới: ` + priceChanges.map((p) => `${p.name} (${p.oldPrice.toLocaleString('vi-VN')} đ → ${p.newPrice.toLocaleString('vi-VN')} đ)`).join(', ')
          warnings.push('Một số món có thay đổi giá so với thời điểm đặt đơn trước.')
        }
        reorderMsg += '\nVui lòng kiểm tra lại báo giá và bấm "Xác nhận đặt đơn" để gửi đơn đến nhà hàng nhé!'
        replyText = reorderMsg
        suggestedActions.push('Xác nhận đặt đơn', 'Thêm món khác', 'Hủy')
      }
    } else {
      replyText = 'Hành động đã được tiếp nhận.'
    }
  }

  // 4. Handle Text Message Lifecycle
  else if (payload.message && payload.message.trim()) {
    const rawMessage = payload.message.trim()
    state = appendChatMessage(state, 'user', rawMessage)

    // Finding 7: Check ambiguous "ok" to avoid premature confirmation
    const isAmbiguousOk = /^(ok|okie|okay|được|uh|ừ|yes)$/i.test(rawMessage)
    if (isAmbiguousOk) {
      replyText = 'Dạ bạn muốn xác nhận chọn mâm nào trong các đề xuất trên (mâm số 1, mâm số 2, hay mâm số 3), hay bạn cần chỉnh sửa bổ sung món nào ạ?'
      suggestedActions.push('Thêm mâm số 1 vào giỏ', 'Thêm mâm số 2 vào giỏ', 'Thêm món rau')
    } else {
      // Classify intent
      const intent = classifyIntent(rawMessage)
      state.constraints = extractConstraints(rawMessage, state.constraints)

      // Finding 4: Empty catalog check - fail-closed without mock fallback
      if ((!ctx.catalog || ctx.catalog.length === 0) && (intent === 'food_recommendation' || intent === 'menu_lookup')) {
        replyText = 'Hiện tại thực đơn nhà hàng đang được cập nhật hoặc không có dữ liệu món khả dụng. Quý khách vui lòng liên hệ trực tiếp hotline 0901 345 345 để được hỗ trợ tốt nhất.'
        nextStep = 'ANSWERING'
        nextIntent = intent
        state = appendChatMessage(state, 'assistant', replyText, cards)
        state = await transitionConversationAsync(ctx.pool, state, nextStep, nextIntent, {
          ...stateUpdates,
          messages: state.messages,
        })
        return {
          conversation_id: state.conversation_id,
          state_version: state.state_version,
          session_token: state.session_token,
          intent: state.current_intent,
          current_step: state.current_step,
          message: replyText,
          cards: [],
          suggested_actions: ['Giờ mở cửa', 'Vị trí nhà hàng', 'Chính sách giao hàng'],
          warnings: ['Danh mục thực đơn hiện hành đang rỗng'],
          references: [],
        }
      }

      // 5. Connect Single LLM Orchestrator (AT11 / AT12)
      // DB-driven shared config wins when admin enabled it; otherwise env/stub.
      const orchestrator = await createTurnOrchestrator(ctx.pool, ctx.orchestrator)
      const llmResult = await orchestrator.orchestrateTurn(
        rawMessage,
        state.messages,
        {
          constraints: state.constraints,
          customerUserId,
          actorScope: ctx.actor_scope,
          currentStep: state.current_step,
          pendingReservation: state.pending_reservation as any,
        }
      )

      if (llmResult.tool_calls.length > 0) {
        for (const call of llmResult.tool_calls) {
          if (call.name === 'lookup_restaurant_info') {
            const query = (call.arguments.query as string) || rawMessage
            const info = toolLookupRestaurantInfo({ query })
            replyText = info.content || llmResult.reply_text || 'Thông tin nhà hàng Tiger 345'
            references.push(...info.references)
            nextStep = 'ANSWERING'
            nextIntent = 'restaurant_info'
            // FAQ interruption: preserve active proposals in state
            if (state.last_proposals && state.last_proposals.length > 0) {
              stateUpdates.last_proposals = state.last_proposals
            }
            // FAQ interruption during reservation flow: preserve pending reservation and pending action
            if (state.pending_reservation) {
              stateUpdates.pending_reservation = state.pending_reservation
            }
            if (state.pending_action && state.pending_action.action_type === 'confirm_reservation') {
              stateUpdates.pending_action = state.pending_action
            }
            if (state.current_step === 'RESERVING_COLLECTING' || state.current_step === 'RESERVING_CONFIRMING') {
              nextStep = state.current_step
              nextIntent = 'reservation'
              suggestedActions.push('Tiếp tục đặt bàn', 'Xác nhận đặt bàn', 'Xem thực đơn')
            } else {
              suggestedActions.push('Gợi ý mâm cơm ngon', 'Xem thực đơn', 'Đặt bàn tiệc')
            }
          } else if (call.name === 'search_menu_items') {
            const searchArgs = {
              query: (call.arguments.query as string) || rawMessage.replace(/(thực đơn|menu|món|giá)/gi, '').trim(),
              limit: typeof call.arguments.limit === 'number' ? call.arguments.limit : 4,
              is_signature: Boolean(call.arguments.is_signature),
            }
            const search = await toolSearchMenuItems(searchArgs, ctx)
            cards.push(...search.cards)
            replyText = llmResult.reply_text || 'Dưới đây là các món ngon tiêu biểu tại Tiger 345 phù hợp với tìm kiếm của bạn:'
            nextStep = 'ANSWERING'
            nextIntent = 'menu_lookup'
            suggestedActions.push('Tư vấn mâm tiệc trọn bữa', 'Xem chính sách giao hàng')
          } else if (call.name === 'recommend_meal') {
            if (typeof call.arguments.adults === 'number') {
              state.constraints.adults = call.arguments.adults
            }
            if (typeof call.arguments.children === 'number') {
              state.constraints.children = call.arguments.children
            }
            if (typeof call.arguments.budget_vnd === 'number') {
              state.constraints.budget_vnd = call.arguments.budget_vnd
            }
            if (typeof call.arguments.is_hard_budget === 'boolean') {
              state.constraints.is_hard_budget = call.arguments.is_hard_budget
            }
            if (Array.isArray(call.arguments.allergies)) {
              state.constraints.allergies = Array.from(
                new Set([...state.constraints.allergies, ...(call.arguments.allergies as AllergenType[])])
              )
            }
            if (call.arguments.appetite && ['light', 'normal', 'heavy'].includes(call.arguments.appetite as string)) {
              state.constraints.appetite = call.arguments.appetite as 'light' | 'normal' | 'heavy'
            }

            const isModifyVegetable =
              rawMessage.toLowerCase().includes('rau') ||
              rawMessage.toLowerCase().includes('thêm món') ||
              rawMessage.toLowerCase().includes('bổ sung')

            const hasSpecificDetails =
              rawMessage.includes('người') ||
              rawMessage.includes('khách') ||
              rawMessage.includes('k') ||
              rawMessage.includes('triệu') ||
              isModifyVegetable ||
              (state.constraints.adults && state.constraints.adults > 0)

            if (!hasSpecificDetails && state.current_step === 'IDLE') {
              const choiceCard: ClarificationChoicesCardData = {
                type: 'clarification_choices',
                question: 'Bạn đang dự định đi dùng bữa cùng bao nhiêu người?',
                choices: [
                  { label: '1-2 người', value: '2', field: 'guests' },
                  { label: '3-4 người', value: '4', field: 'guests' },
                  { label: 'Mâm tiệc 5-6 người', value: '6', field: 'guests' },
                ],
              }
              cards.push(choiceCard)
              replyText =
                llmResult.reply_text ||
                'Dạ để gợi ý thực đơn chuẩn xác và cân đối dinh dưỡng nhất, bạn cho mình biết bàn của mình gồm bao nhiêu người ạ?'
              nextStep = 'RECOMMENDING_CLARIFYING'
              nextIntent = 'food_recommendation'
            } else {
              const recResult = await toolRecommendMeal(state.constraints, ctx)
              for (const prop of recResult.proposals) {
                ;(prop as any).actor_scope = ctx.actor_scope
                await saveProposalRecord(
                  ctx.pool,
                  prop,
                  state.conversation_id,
                  ctx.actor_scope,
                  state.customer_user_id,
                  state.constraints.budget_vnd
                )
              }

              nextStep = 'RECOMMENDING_PROPOSAL_READY'
              nextIntent = 'food_recommendation'
              stateUpdates.last_proposals = recResult.proposals

              for (const prop of recResult.proposals) {
                cards.push({
                  type: 'meal_recommendation',
                  proposal: prop,
                })
                warnings.push(...prop.validation.warnings)
              }

              if (llmResult.reply_text) {
                replyText = llmResult.reply_text
              } else if (isModifyVegetable) {
                replyText = `Tiger Concierge đã cập nhật và bổ sung thêm món rau tươi ngon vào mâm ăn cho ${state.constraints.adults} người để bữa ăn thêm thanh mát và cân bằng:`
              } else {
                replyText = `Tiger Concierge xin gợi ý các phương án mâm ăn cho ${state.constraints.adults} người. Tất cả các mâm đã được tính toán khẩu phần và kiểm tra dị ứng tự động:`
              }
              suggestedActions.push('Thêm mâm số 1 vào giỏ', 'Xem thông tin bãi đỗ xe', 'Đặt bàn giữ chỗ')
            }
          } else if (call.name === 'prepare_reservation_summary') {
            const resvArgs = call.arguments as {
              customer_name?: string
              phone?: string
              guest_count?: number
              starts_at_iso?: string
              seating_area_name?: string
              note?: string
            }

            const extracted = extractReservationDetails(
              rawMessage,
              (state.pending_reservation as any) || (resvArgs ? {
                customer_name: resvArgs.customer_name,
                phone: resvArgs.phone,
                guest_count: resvArgs.guest_count,
                starts_at_iso: resvArgs.starts_at_iso,
                seating_area_name: resvArgs.seating_area_name,
                note: resvArgs.note,
              } : undefined)
            )

            // Save in-flight draft updates
            stateUpdates.pending_reservation = {
              ...((state.pending_reservation as any) || {}),
              customer_name: extracted.customer_name,
              phone: extracted.phone,
              guest_count: extracted.guest_count,
              starts_at_iso: extracted.starts_at_iso,
              starts_at_formatted: extracted.starts_at_formatted,
              seating_area_name: extracted.seating_area_name,
              note: extracted.note,
            }

            if (!extracted.is_complete) {
              nextStep = 'RESERVING_COLLECTING'
              nextIntent = 'reservation'

              const missing = extracted.missing_fields
              if (missing.includes('customer_name') && missing.includes('phone') && missing.includes('starts_at_iso')) {
                replyText =
                  'Để đặt bàn nhanh tại Tiger 345, bạn vui lòng cho mình xin: Họ tên, Số điện thoại và Giờ hẹn dùng bữa (quán đón khách từ 10:30 đến 20:30) nhé!'
              } else if (missing.includes('customer_name') && missing.includes('phone')) {
                replyText =
                  'Mình đã ghi nhận thời gian và số lượng khách. Bạn vui lòng cho mình xin Họ tên và Số điện thoại liên hệ để tạo phiếu tóm tắt đặt bàn nhé!'
              } else if (missing.includes('phone')) {
                replyText = `Dạ anh/chị ${extracted.customer_name || ''} cho em xin thêm Số điện thoại liên hệ để nhà hàng gọi xác nhận giữ bàn ạ!`
              } else if (missing.includes('customer_name')) {
                replyText = 'Bạn cho mình xin Họ và tên người đại diện đặt bàn để nhà hàng đón tiếp chu đáo nhé!'
              } else if (missing.includes('starts_at_iso')) {
                replyText =
                  'Bạn dự định đến nhà hàng vào ngày nào và mấy giờ ạ? (Tiger 345 mở cửa từ 10:30 đến 22:30, ngừng nhận đặt bàn sau 20:30).'
              } else if (missing.includes('guest_count')) {
                replyText = 'Bàn của bạn dự kiến đi cùng bao nhiêu người để nhà hàng sắp xếp khu vực phù hợp ạ?'
              } else {
                replyText =
                  'Bạn vui lòng cung cấp đầy đủ thông tin: Họ tên, Số điện thoại, Số khách và Thời gian đến dùng bữa để Tiger Concierge tạo phiếu đặt bàn nhé!'
              }

              suggestedActions.push('19:00 ngày mai', 'Đặt bàn 4 người', 'Chính sách giữ bàn')
            } else {
              try {
                const resvSummary = toolPrepareReservationSummary({
                  customer_name: extracted.customer_name!,
                  phone: extracted.phone!,
                  guest_count: extracted.guest_count!,
                  starts_at_iso: extracted.starts_at_iso!,
                  seating_area_name: extracted.seating_area_name || 'Khu vực sân vườn thoáng mát',
                  note: extracted.note || 'Đặt qua Tiger Concierge',
                  actor_scope: ctx.actor_scope,
                })
                const resvActionId = generateActionId('act_res_')
                resvSummary.reservationCard.action_id = resvActionId
                cards.push(resvSummary.reservationCard)

                const pendingAction: PendingAction = {
                  id: resvActionId,
                  action_type: 'confirm_reservation',
                  actor_scope: ctx.actor_scope,
                  conversation_id: state.conversation_id,
                  state_version: state.state_version,
                  content_fingerprint: sha256(JSON.stringify(resvSummary.reservationCard)),
                  reference_id: `draft_${Date.now()}`,
                  expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
                  status: 'pending',
                  payload: { reservation_details: resvSummary.reservationCard },
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                }
                stateUpdates.pending_action = pendingAction
                stateUpdates.pending_reservation = resvSummary.reservationCard
                nextStep = 'RESERVING_CONFIRMING'
                nextIntent = 'reservation'
                replyText =
                  llmResult.reply_text ||
                  `Mình đã chuẩn bị tóm tắt thông tin đặt bàn cho ${extracted.guest_count} khách vào lúc ${resvSummary.reservationCard.starts_at_formatted}. Bạn vui lòng kiểm tra thông tin và nhấn "Xác nhận đặt bàn" bên dưới nhé!`
                suggestedActions.push('Xác nhận đặt bàn', 'Đổi giờ đặt bàn', 'Xem thực đơn')
              } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : 'Thông tin đặt bàn chưa hợp lệ.'
                replyText = `${errMsg} Bạn vui lòng cung cấp lại thông tin phù hợp nhé!`
                nextStep = 'RESERVING_COLLECTING'
                nextIntent = 'reservation'
                suggestedActions.push('19:00 ngày mai', 'Đặt bàn 4 người', 'Chính sách giữ bàn')
              }
            }
          } else if (call.name === 'create_order_quote') {
            const quoteArgs = call.arguments as {
              order_type?: 'dine_in' | 'delivery'
              items?: { menu_item_id: string; quantity: number; note?: string }[]
              delivery_zone_id?: string
              table_id?: string
              table_visit_id?: string
            }
            const quoteResult = await toolCreateOrderQuote(
              {
                order_type: quoteArgs.order_type || 'delivery',
                items: quoteArgs.items || [],
                context: {
                  delivery_zone_id: quoteArgs.delivery_zone_id,
                  table_id: quoteArgs.table_id,
                  table_visit_id: quoteArgs.table_visit_id,
                },
              },
              ctx
            )
            const quoteActionId = generateActionId('act_ord_')
            quoteResult.quoteCard.action_id = quoteActionId
            cards.push(quoteResult.quoteCard)
            stateUpdates.active_quote = quoteResult.quoteCard
            stateUpdates.pending_action = {
              id: quoteActionId,
              action_type: 'confirm_quote',
              actor_scope: ctx.actor_scope,
              conversation_id: state.conversation_id,
              state_version: state.state_version,
              content_fingerprint: sha256(
                JSON.stringify({
                  actor_scope: ctx.actor_scope,
                  customer_user_id: state.customer_user_id || null,
                  order_type: quoteResult.quoteCard.order_type,
                  quote_token: quoteResult.quoteCard.quote_token,
                  items: quoteResult.quoteCard.items.map((i) => ({
                    menu_item_id: i.menu_item_id,
                    quantity: i.quantity,
                    unit_price_vnd: i.unit_price_vnd,
                    note: i.note || '',
                  })),
                  subtotal_vnd: quoteResult.quoteCard.subtotal_vnd,
                  shipping_fee_vnd: quoteResult.quoteCard.shipping_fee_vnd,
                  total_vnd: quoteResult.quoteCard.total_vnd,
                  dine_in: null,
                  delivery: null,
                  note: '',
                })
              ),
              reference_id: `quote_${quoteResult.quoteCard.quote_token.slice(0, 16)}`,
              expires_at: quoteResult.quoteCard.expires_at,
              status: 'pending',
              payload: {
                quote: quoteResult.quoteCard,
                quote_token: quoteResult.quoteCard.quote_token,
                quote_version: quoteResult.quoteCard.quote_version,
              },
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
            nextStep = 'ORDERING_CONFIRMING'
            nextIntent = 'order'
            replyText =
              llmResult.reply_text ||
              `Báo giá của bạn đã sẵn sàng với tổng tiền ${quoteResult.quoteCard.total_vnd.toLocaleString('vi-VN')} đ (Hiệu lực trong 5 phút).`
            suggestedActions.push('Xác nhận đặt đơn', 'Thêm món khác', 'Thay đổi số lượng')
          } else if (call.name === 'get_customer_context') {
            const targetUserId = (call.arguments.customer_user_id as string) || customerUserId
            if (!targetUserId) {
              replyText =
                'Bạn vui lòng đăng nhập tài khoản để Tiger Concierge hiển thị lịch sử đơn hàng, các món quen thuộc và địa chỉ giao hàng của bạn nhé!'
              nextStep = 'ANSWERING'
              nextIntent = 'customer_history'
              suggestedActions.push('Đăng nhập', 'Xem thực đơn', 'Tư vấn món ngon')
            } else {
              const customerCtx = await toolGetCustomerContext(targetUserId, ctx)
              const lowerMsg = (payload.message || '').toLowerCase()
              const isReorderRequest = lowerMsg.includes('đặt lại') || lowerMsg.includes('reorder')

              if (isReorderRequest && customerCtx && customerCtx.recent_orders.length > 0) {
                const recentOrder = customerCtx.recent_orders[0]
                const catalogMap = new Map((ctx.catalog || []).map((c) => [c.id, c]))
                const unavailableItems: string[] = []
                const priceChanges: { name: string; oldPrice: number; newPrice: number }[] = []
                const validItems: { menu_item_id: string; quantity: number; note?: string }[] = []

                for (const item of recentOrder.items) {
                  const catItem = catalogMap.get(item.menu_item_id)
                  if (!catItem || !catItem.is_available) {
                    unavailableItems.push(catItem?.name || item.item_name || item.menu_item_id)
                  } else {
                    const oldPrice = Number(item.unit_price_vnd)
                    const newPrice = Number(catItem.price_vnd)
                    if (newPrice !== oldPrice) {
                      priceChanges.push({
                        name: catItem.name,
                        oldPrice,
                        newPrice,
                      })
                    }
                    validItems.push({
                      menu_item_id: item.menu_item_id,
                      quantity: item.quantity,
                    })
                  }
                }

                if (validItems.length === 0) {
                  replyText = `Tất cả các món trong đơn cũ [${recentOrder.order_code}] (${unavailableItems.join(', ')}) hiện tại đều đã hết hàng hoặc không còn khả dụng tại bếp. Bạn vui lòng chọn món khác từ thực đơn nhé.`
                  nextStep = 'ANSWERING'
                  nextIntent = 'order'
                  suggestedActions.push('Xem thực đơn hôm nay', 'Tư vấn món ngon', 'Món đặc sản')
                } else {
                  const quoteResult = await toolCreateOrderQuote(
                    {
                      order_type: recentOrder.order_type || 'delivery',
                      items: validItems,
                      context: {},
                    },
                    ctx
                  )
                  const reorderActionId = generateActionId('act_ord_')
                  quoteResult.quoteCard.action_id = reorderActionId

                  cards.push(quoteResult.quoteCard)
                  stateUpdates.active_quote = quoteResult.quoteCard
                  stateUpdates.pending_action = {
                    id: reorderActionId,
                    action_type: 'confirm_quote',
                    actor_scope: ctx.actor_scope,
                    conversation_id: state.conversation_id,
                    state_version: state.state_version,
                    content_fingerprint: sha256(
                      JSON.stringify({
                        actor_scope: ctx.actor_scope,
                        customer_user_id: state.customer_user_id || null,
                        order_type: quoteResult.quoteCard.order_type,
                        quote_token: quoteResult.quoteCard.quote_token,
                        items: quoteResult.quoteCard.items.map((i) => ({
                          menu_item_id: i.menu_item_id,
                          quantity: i.quantity,
                          unit_price_vnd: i.unit_price_vnd,
                          note: i.note || '',
                        })),
                        subtotal_vnd: quoteResult.quoteCard.subtotal_vnd,
                        shipping_fee_vnd: quoteResult.quoteCard.shipping_fee_vnd,
                        total_vnd: quoteResult.quoteCard.total_vnd,
                        dine_in: null,
                        delivery: null,
                        note: '',
                      })
                    ),
                    reference_id: `quote_${quoteResult.quoteCard.quote_token.slice(0, 16)}`,
                    expires_at: quoteResult.quoteCard.expires_at,
                    status: 'pending',
                    payload: {
                      quote: quoteResult.quoteCard,
                      quote_token: quoteResult.quoteCard.quote_token,
                      quote_version: quoteResult.quoteCard.quote_version,
                    },
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  }
                  nextStep = 'ORDERING_CONFIRMING'
                  nextIntent = 'order'

                  let reorderMsg = `Báo giá mới để đặt lại đơn [${recentOrder.order_code}] đã sẵn sàng với tổng tiền ${quoteResult.quoteCard.total_vnd.toLocaleString('vi-VN')} đ (Hiệu lực trong 5 phút).`
                  if (unavailableItems.length > 0) {
                    reorderMsg += `\n- Lưu ý hết hàng: Món [${unavailableItems.join(', ')}] hiện không còn khả dụng nên đã được loại khỏi đơn.`
                    warnings.push(`Món [${unavailableItems.join(', ')}] đã hết hàng nên không được đưa vào báo giá.`)
                  }
                  if (priceChanges.length > 0) {
                    reorderMsg += `\n- Cập nhật giá mới: ` + priceChanges.map((p) => `${p.name} (${p.oldPrice.toLocaleString('vi-VN')} đ → ${p.newPrice.toLocaleString('vi-VN')} đ)`).join(', ')
                    warnings.push('Một số món có thay đổi giá so với thời điểm đặt đơn trước.')
                  }
                  reorderMsg += '\nVui lòng kiểm tra lại báo giá và bấm "Xác nhận đặt đơn" để gửi đơn đến nhà hàng nhé!'
                  replyText = reorderMsg
                  suggestedActions.push('Xác nhận đặt đơn', 'Thêm món khác', 'Hủy')
                }
              } else if (customerCtx && (customerCtx.favorites.length > 0 || customerCtx.recent_orders.length > 0)) {
                const favNames = customerCtx.favorites.slice(0, 3).map((f) => f.item_name).join(', ')
                const recentOrder = customerCtx.recent_orders[0]
                replyText = llmResult.reply_text || `Chào ${customerCtx.display_name || 'bạn'}! Mình đã tìm thấy thông tin của bạn:`
                if (!llmResult.reply_text) {
                  if (favNames) replyText += `\n- Món ưa thích: ${favNames}`
                  if (recentOrder) {
                    replyText += `\n- Đơn gần nhất: [${recentOrder.order_code}] (${Number(recentOrder.total_vnd).toLocaleString('vi-VN')} đ, ${recentOrder.status})`
                  }
                  if (customerCtx.default_address) {
                    replyText += `\n- Địa chỉ giao hàng: Đã lưu địa chỉ mặc định (${customerCtx.default_address.label || 'Mặc định'})`
                  }
                  replyText += '\nBạn muốn đặt lại món quen hay xem thêm gợi ý mới hôm nay ạ?'
                }
                suggestedActions.push('Đặt lại món quen', 'Xem thực đơn hôm nay', 'Tư vấn mâm tiệc')
              } else {
                replyText =
                  llmResult.reply_text ||
                  'Bạn chưa có đơn hàng nào trước đây tại Tiger 345. Hãy để mình gợi ý những món đặc sản được yêu thích nhất cho bạn nhé!'
                suggestedActions.push('Gợi ý mâm cơm 4 người', 'Món đặc sản Tây Bắc', 'Xem thực đơn')
              }
              nextStep = 'ANSWERING'
              nextIntent = 'customer_history'
            }
          }
        }
      } else {
        // Fallback when LLM returns pure conversational text without tool calls
        replyText = llmResult.reply_text
        nextIntent = intent
        nextStep = intent === 'food_recommendation' ? 'RECOMMENDING_CLARIFYING' : (intent === 'reservation' ? 'RESERVING_COLLECTING' : 'ANSWERING')
        suggestedActions.push('Gợi ý mâm cơm 4 người', 'Món đặc sản Tây Bắc', 'Giờ mở cửa & Vị trí')
      }
    }
  } else {
    replyText = 'Chào bạn, Tiger Concierge sẵn sàng hỗ trợ bạn khám phá ẩm thực Tiger 345!'
    suggestedActions.push('Gợi ý món ăn', 'Xem thực đơn', 'Địa chỉ nhà hàng')
  }

  // Deduplicate warnings
  const uniqueWarnings = Array.from(new Set(warnings))

  // Append assistant message and commit state transition via atomic CAS
  state = appendChatMessage(state, 'assistant', replyText, cards)
  state = await transitionConversationAsync(ctx.pool, state, nextStep, nextIntent, {
    ...stateUpdates,
    messages: state.messages,
  })

  // Append-only audit log for turn event
  await logConciergeEventRecord(ctx.pool, {
    conversation_id: state.conversation_id,
    actor_scope: ctx.actor_scope,
    turn_type: payload.action ? 'action' : 'chat',
    user_message: payload.message,
    intent: state.current_intent,
    agent_reply: replyText,
    action_type: payload.action?.type,
    action_result: {
      cards_count: cards.length,
      cart_addition: cartAddition,
      step: state.current_step,
    },
    state_version_before: startVersion,
    state_version_after: state.state_version,
  })

  return {
    conversation_id: state.conversation_id,
    state_version: state.state_version,
    session_token: state.session_token,
    intent: state.current_intent,
    current_step: state.current_step,
    message: replyText,
    cards,
    suggested_actions: suggestedActions,
    warnings: uniqueWarnings,
    references,
    cart_addition: cartAddition,
  }
}
