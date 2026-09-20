/**
 * Tiger 345 - Concierge Personalization & History Test Suite (Task C08 - R09, AT16)
 *
 * Fact-Forcing Metadata:
 * - Importers/Callers: Executed by Vitest runner via vitest.server.config.ts (npm run test:server)
 * - Affected API:
 *   - supabase/functions/_shared/concierge/runtime.ts (processConciergeTurn)
 *   - supabase/functions/_shared/concierge/tools.ts (toolGetCustomerContext, toolCreateOrderQuote)
 *   - supabase/functions/_shared/concierge/types.ts (CustomerContextData, ConciergeActionPayload)
 * - Data Schemas:
 *   - ToolContext, CustomerContextData, ConciergeRequestPayload, ConciergeResponseEnvelope
 * - Verbatim Instructions (C08 / AT16):
 *   - "Query favorites/history/frequent items đúng schema hiện tại; lấy user ID từ verified auth context."
 *   - "Context tối thiểu, không tự tiết lộ địa chỉ/phone; ưu tiên yêu cầu hiện tại hơn lịch sử."
 *   - "Reorder fetch giá/availability hiện tại, hiển thị đổi món/giá và confirm mới; không replay order cũ như giao dịch mới."
 *   - "Login upgrade chứng minh guest owner; logout đổi tài khoản xóa cache/context và chặn response đang bay quay lại UI."
 */

import { describe, it, expect } from 'vitest'
import { processConciergeTurn } from '../../supabase/functions/_shared/concierge/runtime.js'
import { createInitialState } from '../../supabase/functions/_shared/concierge/state-machine.js'
import { saveInitialConversationRecord } from '../../supabase/functions/_shared/concierge/persistence.js'
import { toolGetCustomerContext, type ToolContext } from '../../supabase/functions/_shared/concierge/tools.js'
import type { MenuItemCatalogRecord } from '../../supabase/functions/_shared/concierge/validator.js'

describe('Task C08: Personalization & History Server Validation (AT16)', () => {
  const ITEM_GA_HAP: MenuItemCatalogRecord = {
    id: '10000000-0000-0000-0000-000000000001',
    name: 'Gà Hấp Nước Mắm Nhĩ',
    price_vnd: 260000, // Price updated from 240,000 to 260,000
    is_available: true,
  }

  const ITEM_LAU_CA: MenuItemCatalogRecord = {
    id: '10000000-0000-0000-0000-000000000002',
    name: 'Lẩu Cá Kèo Lá Giang',
    price_vnd: 280000,
    is_available: true,
  }

  const ITEM_BO_TO_OUT_OF_STOCK: MenuItemCatalogRecord = {
    id: '10000000-0000-0000-0000-000000000003',
    name: 'Bò Tơ Cuốn Rau Rừng',
    price_vnd: 320000,
    is_available: false, // Out of stock
  }

  const catalog: MenuItemCatalogRecord[] = [ITEM_GA_HAP, ITEM_LAU_CA, ITEM_BO_TO_OUT_OF_STOCK]

  const USER_ALICE_ID = '00000000-0000-0000-0000-0000000000aa'
  const USER_BOB_ID = '00000000-0000-0000-0000-0000000000bb'

  it('AT16-1: Rejects guest actor attempting to call get_customer_context with 403 FORBIDDEN', async () => {
    const guestContext: ToolContext = {
      actor_scope: 'guest:session-guest-999',
      catalog,
      pool: undefined,
    }

    await expect(toolGetCustomerContext(USER_ALICE_ID, guestContext)).rejects.toThrowError(
      expect.objectContaining({
        code: 'FORBIDDEN',
        status: 403,
      })
    )
  })

  it('AT16-2: Cross-user isolation - Alice cannot query Bob customer context', async () => {
    const aliceContext: ToolContext = {
      actor_scope: `user:${USER_ALICE_ID}`,
      catalog,
      pool: undefined,
    }

    // Alice trying to read Bob's context must be strictly forbidden
    await expect(toolGetCustomerContext(USER_BOB_ID, aliceContext)).rejects.toThrowError(
      expect.objectContaining({
        code: 'FORBIDDEN',
        status: 403,
      })
    )
  })

  it('AT16-3: Reorder action requires authenticated user; guest is rejected with 403', async () => {
    const conv = createInitialState(undefined, null)
    await saveInitialConversationRecord(undefined, conv)

    const turnContext = {
      actor_scope: 'guest:session-guest-999',
      catalog,
      pool: null as any,
    }

    await expect(
      processConciergeTurn(
        {
          conversation_id: conv.conversation_id,
          session_token: conv.session_token,
          state_version: conv.state_version,
          action: {
            type: 'reorder_order',
            order_code: 'ORD-TEST-001',
          },
        },
        turnContext
      )
    ).rejects.toThrowError(
      expect.objectContaining({
        code: 'FORBIDDEN',
        status: 403,
      })
    )
  })

  it('AT16-4: Reorder performs live repricing, filters out-of-stock items, and requires explicit confirmation', async () => {
    const conv = createInitialState(undefined, USER_ALICE_ID)
    await saveInitialConversationRecord(undefined, conv)

    // Mock pool to simulate past order lookup
    const mockPastOrder = {
      id: 'ord-past-001',
      code: 'TG-20260901-001',
      order_type: 'delivery',
      delivery_zone_id: null,
      status: 'completed',
    }

    const mockPastOrderItems = [
      {
        menu_item_id: ITEM_GA_HAP.id,
        item_name: ITEM_GA_HAP.name,
        quantity: 1,
        unit_price_vnd: 240000, // old price
      },
      {
        menu_item_id: ITEM_BO_TO_OUT_OF_STOCK.id,
        item_name: ITEM_BO_TO_OUT_OF_STOCK.name,
        quantity: 1,
        unit_price_vnd: 320000, // out of stock in current catalog
      },
    ]

    const mockPool = {
      query: async (queryText: string, params: any[]) => {
        if (queryText.includes('UPDATE public.concierge_conversations')) {
          return { rowCount: 1, rows: [] }
        }
        if (queryText.includes('FROM public.orders')) {
          return { rowCount: 1, rows: [mockPastOrder] }
        }
        if (queryText.includes('FROM public.order_items')) {
          return { rowCount: mockPastOrderItems.length, rows: mockPastOrderItems }
        }
        return { rowCount: 0, rows: [] }
      },
    }

    const turnContext = {
      actor_scope: `user:${USER_ALICE_ID}`,
      catalog,
      pool: mockPool as any,
    }

    const envelope = await processConciergeTurn(
      {
        conversation_id: conv.conversation_id,
        session_token: conv.session_token,
        state_version: conv.state_version,
        action: {
          type: 'reorder_order',
          order_code: 'TG-20260901-001',
        },
      },
      turnContext,
      USER_ALICE_ID
    )

    // Verify step transition to ORDERING_CONFIRMING (never auto-submitting)
    expect(envelope.current_step).toBe('ORDERING_CONFIRMING')
    expect(envelope.intent).toBe('order')

    // Verify quote card exists
    const quoteCard = envelope.cards.find((c) => c.type === 'order_quote')
    expect(quoteCard).toBeDefined()
    if (quoteCard && quoteCard.type === 'order_quote') {
      // Out of stock item should be excluded
      expect(quoteCard.items.length).toBe(1)
      expect(quoteCard.items[0].menu_item_id).toBe(ITEM_GA_HAP.id)
      // Unit price must reflect live catalog price (260,000 instead of old 240,000)
      expect(quoteCard.items[0].unit_price_vnd).toBe(260000)
    }

    // Verify warnings and message notify about out of stock and price change
    expect(envelope.warnings).toContain('Món [Bò Tơ Cuốn Rau Rừng] đã hết hàng nên không được đưa vào báo giá.')
    expect(envelope.warnings).toContain('Một số món có thay đổi giá so với thời điểm đặt đơn trước.')
    expect(envelope.message).toContain('Hiệu lực trong 5 phút')
    expect(envelope.suggested_actions).toContain('Xác nhận đặt đơn')
  })

  it('AT16-5: Reorder handles case where all past items are out of stock gracefully without creating quote', async () => {
    const conv = createInitialState(undefined, USER_ALICE_ID)
    await saveInitialConversationRecord(undefined, conv)

    const mockPastOrder = {
      id: 'ord-past-002',
      code: 'TG-20260901-002',
      order_type: 'delivery',
      delivery_zone_id: null,
      status: 'completed',
    }

    const mockPastOrderItems = [
      {
        menu_item_id: ITEM_BO_TO_OUT_OF_STOCK.id,
        item_name: ITEM_BO_TO_OUT_OF_STOCK.name,
        quantity: 2,
        unit_price_vnd: 320000,
      },
    ]

    const mockPool = {
      query: async (queryText: string, params: any[]) => {
        if (queryText.includes('UPDATE public.concierge_conversations')) {
          return { rowCount: 1, rows: [] }
        }
        if (queryText.includes('FROM public.orders')) {
          return { rowCount: 1, rows: [mockPastOrder] }
        }
        if (queryText.includes('FROM public.order_items')) {
          return { rowCount: mockPastOrderItems.length, rows: mockPastOrderItems }
        }
        return { rowCount: 0, rows: [] }
      },
    }

    const turnContext = {
      actor_scope: `user:${USER_ALICE_ID}`,
      catalog,
      pool: mockPool as any,
    }

    const envelope = await processConciergeTurn(
      {
        conversation_id: conv.conversation_id,
        session_token: conv.session_token,
        state_version: conv.state_version,
        action: {
          type: 'reorder_order',
          order_code: 'TG-20260901-002',
        },
      },
      turnContext,
      USER_ALICE_ID
    )

    expect(envelope.current_step).toBe('ANSWERING')
    expect(envelope.cards.find((c) => c.type === 'order_quote')).toBeUndefined()
    expect(envelope.message).toContain('Tất cả các món trong đơn cũ [TG-20260901-002]')
    expect(envelope.message).toContain('đều đã hết hàng hoặc không còn khả dụng')
  })

  it('AT16-6: Minimal context disclosure - does not leak raw address line in chat response', async () => {
    const conv = createInitialState(undefined, USER_ALICE_ID)
    await saveInitialConversationRecord(undefined, conv)

    const mockCustomerProfile = {
      id: USER_ALICE_ID,
      full_name: 'Alice Nguyen',
      phone: '0901234567',
    }

    const mockAddress = {
      id: 'addr-001',
      label: 'Nhà riêng',
      recipient_name: 'Alice',
      phone: '0901234567',
      address_line: 'Số 123 Đường Nhạy Cảm, Phường Bí Mật, Quận 1',
      ward: 'Phường Bí Mật',
      district: 'Quận 1',
      province: 'TP.HCM',
    }

    const mockPool = {
      query: async (queryText: string) => {
        if (queryText.includes('UPDATE public.concierge_conversations')) {
          return { rowCount: 1, rows: [] }
        }
        if (queryText.includes('FROM public.profiles')) {
          return { rowCount: 1, rows: [mockCustomerProfile] }
        }
        if (queryText.includes('FROM public.customer_addresses')) {
          return { rowCount: 1, rows: [mockAddress] }
        }
        if (queryText.includes('FROM public.customer_favorites')) {
          return { rowCount: 1, rows: [{ menu_item_id: ITEM_GA_HAP.id, item_name: ITEM_GA_HAP.name, price_vnd: 260000 }] }
        }
        if (queryText.includes('FROM public.orders')) {
          return { rowCount: 0, rows: [] }
        }
        return { rowCount: 0, rows: [] }
      },
    }

    const turnContext = {
      actor_scope: `user:${USER_ALICE_ID}`,
      catalog,
      pool: mockPool as any,
    }

    const envelope = await processConciergeTurn(
      {
        conversation_id: conv.conversation_id,
        session_token: conv.session_token,
        state_version: conv.state_version,
        message: 'Tôi muốn xem lịch sử và thông tin của tôi',
      },
      turnContext,
      USER_ALICE_ID
    )

    // The raw address line 'Số 123 Đường Nhạy Cảm' MUST NOT appear in the assistant text
    expect(envelope.message).not.toContain('Số 123 Đường Nhạy Cảm')
    // Instead, only the address label should be referenced
    expect(envelope.message).toContain('Nhà riêng')
  })
})
