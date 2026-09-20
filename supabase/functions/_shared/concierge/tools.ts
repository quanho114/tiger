/**
 * Tiger 345 - Typed Concierge Tools Gateway
 * Based on plans/tiger-345/09-concierge-agent-design.md (§10)
 *
 * Core Guarantees:
 * - Deterministic, typed tool execution
 * - Reuses existing quote engine, auth, and database contracts
 * - Backend enforces prices, availability, and access control
 */

import type pg from 'pg'
import type {
  CustomerConstraints,
  CustomerContextData,
  KnowledgeReference,
  MealProposal,
  MenuItemCardData,
  OrderQuoteCardData,
  ReservationSummaryCardData,
} from './types.ts'
import {
  SERVING_PROFILES,
} from './knowledge.ts'
import {
  type MenuItemCatalogRecord,
} from './validator.ts'
import { buildMealProposals } from './recommendation.ts'
import { searchRestaurantKnowledge } from './rag.ts'
import {
  createOrderQuote,
  createReservationHoldToken,
  normalizeLineItems,
} from '../quote.ts'
import { AppError } from '../errors.ts'
import type { ConciergeLlmOrchestrator } from './llm.ts'

export interface ToolContext {
  catalog: MenuItemCatalogRecord[]
  actor_scope: string
  pool?: pg.Pool
  orchestrator?: ConciergeLlmOrchestrator
}

export async function toolSearchMenuItems(
  args: { query?: string; is_signature?: boolean; limit?: number },
  ctx: ToolContext
): Promise<{ cards: MenuItemCardData[] }> {
  const query = args.query?.toLowerCase().trim() || ''
  const limit = Math.min(args.limit || 6, 12)

  let filtered = ctx.catalog.filter((item) => item.is_available)

  if (query) {
    // Strip common conversational filler words and punctuation
    const cleanTokens = query
      .replace(/[?.,!]/g, '')
      .split(/\s+/)
      .filter(
        (w) =>
          ![
            'quán',
            'có',
            'không',
            'gì',
            'thế',
            'nào',
            'các',
            'cho',
            'mình',
            'bạn',
            'ở',
            'tại',
            'nhà',
            'hàng',
          ].includes(w)
      )

    filtered = filtered.filter((item) => {
      const nameLower = item.name.toLowerCase()
      if (nameLower.includes(query)) return true
      if (cleanTokens.length > 0) {
        return cleanTokens.some((token) => token.length >= 3 && nameLower.includes(token))
      }
      return false
    })
  }

  if (args.is_signature) {
    const signatureIds = new Set([
      '10000000-0000-0000-0000-000000000001', // Sườn nướng mật ong
      '10000000-0000-0000-0000-000000000003', // Cá hồi áp chảo
      '10000000-0000-0000-0000-000000000004', // Lẩu nấm hoàng cung
    ])
    filtered = filtered.filter((item) => signatureIds.has(item.id))
  }

  const selected = filtered.slice(0, limit)
  const cards: MenuItemCardData[] = selected.map((item) => {
    const profile = SERVING_PROFILES[item.id]
    const isSignature = [
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000003',
      '10000000-0000-0000-0000-000000000004',
    ].includes(item.id)

    return {
      type: 'menu_item',
      id: item.id,
      name: item.name,
      description: profile?.notes || 'Món ngon chế biến tươi mỗi ngày tại Tiger 345',
      price_vnd: item.price_vnd,
      image_url: `/images/dishes/${item.id}.jpg`,
      is_available: item.is_available,
      serving_size: profile?.pieces_or_weight,
      pairing_note: profile?.notes,
      tags: [profile?.meal_role || 'món chính'],
      is_signature: isSignature,
    }
  })

  return { cards }
}

export async function toolRecommendMeal(
  constraints: CustomerConstraints,
  ctx: ToolContext
): Promise<{ proposals: MealProposal[] }> {
  const proposals = buildMealProposals(constraints, ctx.catalog)
  return { proposals }
}

export async function toolCreateOrderQuote(
  args: {
    order_type: 'dine_in' | 'delivery'
    items: { menu_item_id: string; quantity: number; note?: string }[]
    context?: Record<string, unknown>
  },
  ctx: ToolContext
): Promise<{ quoteCard: OrderQuoteCardData }> {
  if (!args.items || args.items.length === 0) {
    throw new AppError('VALIDATION_ERROR', 'Danh sách món báo giá không được để trống')
  }

  // 1. Normalize line items using existing quote utility
  const normalized = normalizeLineItems(args.items)

  // 2. Validate availability and recalculate prices strictly from catalog
  const catalogMap = new Map<string, MenuItemCatalogRecord>()
  for (const item of ctx.catalog) {
    catalogMap.set(item.id, item)
  }

  const quoteLines = []
  let subtotalVnd = 0

  for (const line of normalized) {
    const catItem = catalogMap.get(line.menu_item_id)
    if (!catItem) {
      throw new AppError('VALIDATION_ERROR', `Món ${line.menu_item_id} không tồn tại`)
    }
    if (!catItem.is_available) {
      throw new AppError('VALIDATION_ERROR', `Món ${catItem.name} hiện đang tạm ngưng phục vụ`)
    }

    const lineTotal = catItem.price_vnd * line.quantity
    subtotalVnd += lineTotal

    quoteLines.push({
      menu_item_id: catItem.id,
      item_name: catItem.name,
      name: catItem.name,
      quantity: line.quantity,
      unit_price_vnd: catItem.price_vnd,
      line_total_vnd: lineTotal,
      note: line.note,
    })
  }

  let shippingFeeVnd = 0
  let matchedZoneId: string | null = null
  let zoneName = 'Giao hàng tận nơi tại Vĩnh An'

  if (args.order_type === 'delivery') {
    const requestedZoneId = (args.context?.delivery_zone_id as string) || null
    if (ctx.pool) {
      let zoneQuery = `SELECT id, name, fee_vnd::numeric as fee_vnd, free_threshold_vnd::numeric as free_threshold_vnd
                       FROM public.delivery_zones
                       WHERE active = true`
      const params: unknown[] = []
      if (requestedZoneId) {
        zoneQuery += ` AND id = $1`
        params.push(requestedZoneId)
      } else {
        zoneQuery += ` ORDER BY sort_order ASC LIMIT 1`
      }
      const zoneRes = await ctx.pool.query(zoneQuery, params)
      if (zoneRes.rows.length > 0) {
        const z = zoneRes.rows[0]
        matchedZoneId = z.id
        zoneName = z.name
        const baseFee = Number(z.fee_vnd)
        const freeThreshold = z.free_threshold_vnd !== null ? Number(z.free_threshold_vnd) : null
        if (freeThreshold !== null && subtotalVnd >= freeThreshold) {
          shippingFeeVnd = 0
        } else {
          shippingFeeVnd = baseFee
        }
      } else {
        shippingFeeVnd = 25000
      }
    } else {
      // Offline / unit test default (standard delivery fee)
      matchedZoneId = requestedZoneId || '40000000-0000-0000-0000-000000000001'
      shippingFeeVnd = 25000
    }
  }

  const totalVnd = subtotalVnd + shippingFeeVnd

  const quoteContext = {
    ...(args.context || {}),
    ...(matchedZoneId ? { delivery_zone_id: matchedZoneId } : {}),
  }

  const quoteResult = createOrderQuote({
    actor_scope: ctx.actor_scope,
    order_type: args.order_type,
    context: quoteContext,
    items: quoteLines.map((l) => ({
      menu_item_id: l.menu_item_id,
      item_name: l.item_name,
      quantity: l.quantity,
      note: l.note,
      unit_price_vnd: l.unit_price_vnd,
      line_total_vnd: l.line_total_vnd,
    })),
    subtotal_vnd: subtotalVnd,
    shipping_fee_vnd: shippingFeeVnd,
    total_vnd: totalVnd,
  })

  const quoteCard: OrderQuoteCardData = {
    type: 'order_quote',
    quote_token: quoteResult.quote_token,
    quote_version: 1,
    order_type: args.order_type,
    items: quoteLines,
    subtotal_vnd: subtotalVnd,
    shipping_fee_vnd: shippingFeeVnd,
    total_vnd: totalVnd,
    expires_at: quoteResult.expires_at,
    target_summary:
      args.order_type === 'delivery'
        ? `Giao hàng: ${zoneName}`
        : 'Phục vụ dùng tại bàn',
  }

  return { quoteCard }
}

export function toolPrepareReservationSummary(args: {
  customer_name: string
  phone: string
  guest_count: number
  starts_at_iso: string
  seating_area_name?: string
  note?: string
  actor_scope?: string
}): { reservationCard: ReservationSummaryCardData } {
  const name = args.customer_name?.trim()
  if (!name || name.length < 2) {
    throw new AppError('VALIDATION_ERROR', 'Tên người đặt bàn phải từ 2 ký tự trở lên')
  }

  const phone = args.phone?.trim()
  const phoneRegex = /(?:84|0)(?:3[2-9]|5[25689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}\b|^(?:84|0)[35789][0-9]{8}$/
  if (!phone || !phoneRegex.test(phone)) {
    throw new AppError('VALIDATION_ERROR', 'Số điện thoại đặt bàn không hợp lệ')
  }

  const guestCount = Math.max(1, args.guest_count || 1)
  const startsAt = new Date(args.starts_at_iso)
  if (isNaN(startsAt.getTime())) {
    throw new AppError('VALIDATION_ERROR', 'Thời gian đặt bàn không đúng định dạng')
  }

  const now = new Date()
  const diffMinutes = (startsAt.getTime() - now.getTime()) / (1000 * 60)
  if (diffMinutes < 30) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Vui lòng đặt bàn trước giờ dùng bữa ít nhất 30 phút'
    )
  }

  const formattedTime = startsAt.toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  const holdResult = createReservationHoldToken({
    actor_scope: args.actor_scope || 'guest',
    customer_name: name,
    phone,
    guest_count: guestCount,
    starts_at_iso: startsAt.toISOString(),
    seating_area_name: args.seating_area_name,
    note: args.note,
  })

  const reservationCard: ReservationSummaryCardData = {
    type: 'reservation_summary',
    customer_name: name,
    phone,
    guest_count: guestCount,
    starts_at_iso: startsAt.toISOString(),
    starts_at_formatted: formattedTime,
    seating_area_name: args.seating_area_name || 'Khu vực sân vườn thoáng mát',
    note: args.note,
    disclaimer:
      'Nhà hàng giữ bàn tối đa 15 phút so với giờ hẹn. Nhân viên sẽ gọi xác nhận trong vòng 15 phút.',
    hold_token: holdResult.hold_token,
  }

  return { reservationCard }
}

export function toolLookupRestaurantInfo(args: {
  query: string
}): {
  content: string
  references: KnowledgeReference[]
} {
  const search = searchRestaurantKnowledge(args.query)

  if (search.results.length === 0) {
    return {
      content:
        'Tiger 345 luôn sẵn sàng phục vụ quý khách. Bạn có thể ghé trực tiếp nhà hàng tại 17 Đường Số 1, KP2, TT. Vĩnh An, Vĩnh Cửu hoặc gọi hotline để được tư vấn thêm.',
      references: [],
    }
  }

  const matched = search.results[0]
  return {
    content: matched.document.content,
    references: search.references,
  }
}

export async function toolGetCustomerContext(
  customerUserId: string,
  ctx: ToolContext
): Promise<CustomerContextData | null> {
  if (!customerUserId) {
    return null
  }

  // Ensure customerUserId matches authenticated actorScope to prevent cross-user data access
  if (!ctx.actor_scope || !ctx.actor_scope.startsWith('user:')) {
    throw new AppError('FORBIDDEN', 'Khách vãng lai không có quyền truy cập thông tin cá nhân', 403)
  }
  const authenticatedUserId = ctx.actor_scope.slice(5)
  if (customerUserId !== authenticatedUserId) {
    throw new AppError('FORBIDDEN', 'Không được phép truy cập dữ liệu cá nhân của người dùng khác', 403)
  }

  const catalogMap = new Map((ctx.catalog || []).map((c) => [c.id, c]))

  let displayName: string | undefined
  let phone: string | undefined
  let defaultAddress: CustomerContextData['default_address'] = undefined
  const favorites: CustomerContextData['favorites'] = []
  const recentOrders: CustomerContextData['recent_orders'] = []
  const frequentItemsMap = new Map<
    string,
    {
      menu_item_id: string
      item_name: string
      total_ordered_quantity: number
      price_vnd: number
      is_available: boolean
    }
  >()

  if (ctx.pool) {
    // 1. Fetch customer profile
    const profileRes = await ctx.pool.query(
      `SELECT display_name, phone FROM public.customer_profiles WHERE user_id = $1 LIMIT 1`,
      [customerUserId]
    )
    if (profileRes.rows.length > 0) {
      displayName = profileRes.rows[0].display_name
      phone = profileRes.rows[0].phone
    }

    // 2. Fetch default address
    const addressRes = await ctx.pool.query(
      `SELECT id, label, recipient_name, phone, address_line, ward, district, province
       FROM public.customer_addresses
       WHERE user_id = $1 AND is_default = true
       LIMIT 1`,
      [customerUserId]
    )
    if (addressRes.rows.length > 0) {
      const row = addressRes.rows[0]
      defaultAddress = {
        id: row.id,
        label: row.label,
        recipient_name: row.recipient_name,
        phone: row.phone,
        address_line: row.address_line,
        ward: row.ward || undefined,
        district: row.district || undefined,
        province: row.province || undefined,
      }
    }

    // 3. Fetch favorites (join with live catalog)
    const favRes = await ctx.pool.query(
      `SELECT cf.menu_item_id, mi.name, mi.price_vnd::numeric as price_vnd, mi.is_available
       FROM public.customer_favorites cf
       JOIN public.menu_items mi ON mi.id = cf.menu_item_id
       WHERE cf.user_id = $1
       ORDER BY cf.created_at DESC`,
      [customerUserId]
    )
    for (const r of favRes.rows) {
      const catItem = catalogMap.get(r.menu_item_id)
      favorites.push({
        menu_item_id: r.menu_item_id,
        item_name: catItem?.name || r.name,
        price_vnd: Number(catItem?.price_vnd ?? r.price_vnd),
        is_available: catItem ? catItem.is_available : Boolean(r.is_available),
      })
    }

    // 4. Fetch recent orders with items
    const ordersRes = await ctx.pool.query(
      `SELECT o.id, o.code, o.order_type, o.status, o.total_vnd::numeric as total_vnd, o.created_at
       FROM public.orders o
       WHERE o.customer_user_id = $1
       ORDER BY o.created_at DESC
       LIMIT 5`,
      [customerUserId]
    )

    for (const oRow of ordersRes.rows) {
      const itemsRes = await ctx.pool.query(
        `SELECT oi.menu_item_id, oi.item_name, oi.quantity, oi.unit_price_vnd::numeric as unit_price_vnd
         FROM public.order_items oi
         WHERE oi.order_id = $1`,
        [oRow.id]
      )

      const items: CustomerContextData['recent_orders'][0]['items'] = []
      for (const iRow of itemsRes.rows) {
        const catItem = catalogMap.get(iRow.menu_item_id)
        // Live revalidation for reordering: use live price and availability
        const isAvailable = catItem ? catItem.is_available : false
        const livePrice = catItem ? catItem.price_vnd : Number(iRow.unit_price_vnd)

        items.push({
          menu_item_id: iRow.menu_item_id,
          item_name: catItem?.name || iRow.item_name,
          quantity: iRow.quantity,
          unit_price_vnd: livePrice,
          is_available: isAvailable,
        })

        // Track frequent items
        const existingFreq = frequentItemsMap.get(iRow.menu_item_id)
        if (existingFreq) {
          existingFreq.total_ordered_quantity += iRow.quantity
        } else {
          frequentItemsMap.set(iRow.menu_item_id, {
            menu_item_id: iRow.menu_item_id,
            item_name: catItem?.name || iRow.item_name,
            total_ordered_quantity: iRow.quantity,
            price_vnd: livePrice,
            is_available: isAvailable,
          })
        }
      }

      recentOrders.push({
        order_id: oRow.id,
        order_code: oRow.code,
        order_type: oRow.order_type,
        status: oRow.status,
        total_vnd: Number(oRow.total_vnd),
        created_at: oRow.created_at instanceof Date ? oRow.created_at.toISOString() : String(oRow.created_at),
        items,
      })
    }
  }

  const frequentItems = Array.from(frequentItemsMap.values()).sort(
    (a, b) => b.total_ordered_quantity - a.total_ordered_quantity
  )

  return {
    customer_user_id: customerUserId,
    display_name: displayName,
    phone,
    favorites,
    recent_orders: recentOrders,
    frequent_items: frequentItems,
    default_address: defaultAddress,
  }
}
