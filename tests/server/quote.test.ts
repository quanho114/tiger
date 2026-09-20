import { describe, it, expect } from 'vitest'
import {
  normalizeLineItems,
  computeCanonicalRequestHash,
  createOrderQuote,
  verifyOrderQuote,
  extractQuotePayloadUnchecked,
  getQuoteSecret,
} from '../../supabase/functions/_shared/quote.js'
import { AppError } from '../../supabase/functions/_shared/errors.js'

describe('Quote Engine & Canonical Request Utilities (Task T07)', () => {
  const ITEM_A = '10000000-0000-0000-0000-000000000001'
  const ITEM_B = '10000000-0000-0000-0000-000000000002'

  describe('normalizeLineItems', () => {
    it('groups duplicate (menu_item_id, trimmed note) and sums quantities', () => {
      const input = [
        { menu_item_id: ITEM_A, quantity: 2, note: 'ít cay ' },
        { menu_item_id: ITEM_A, quantity: 3, note: ' ít cay' },
        { menu_item_id: ITEM_B, quantity: 1 },
      ]

      const result = normalizeLineItems(input)
      expect(result).toHaveLength(2)

      const itemA = result.find((i) => i.menu_item_id === ITEM_A)
      expect(itemA).toBeDefined()
      expect(itemA!.quantity).toBe(5)
      expect(itemA!.note).toBe('ít cay')

      const itemB = result.find((i) => i.menu_item_id === ITEM_B)
      expect(itemB).toBeDefined()
      expect(itemB!.quantity).toBe(1)
      expect(itemB!.note).toBe('')
    })

    it('keeps identical menu_item_id separate if notes differ', () => {
      const input = [
        { menu_item_id: ITEM_A, quantity: 1, note: 'Bàn ngoài trời' },
        { menu_item_id: ITEM_A, quantity: 2, note: 'Không hành' },
      ]

      const result = normalizeLineItems(input)
      expect(result).toHaveLength(2)
      expect(result[0].note).not.toBe(result[1].note)
    })

    it('sorts lines deterministically by menu_item_id ASC, then note ASC', () => {
      const input = [
        { menu_item_id: ITEM_B, quantity: 1, note: 'ghi chú B' },
        { menu_item_id: ITEM_A, quantity: 1, note: 'ghi chú 2' },
        { menu_item_id: ITEM_A, quantity: 1, note: 'ghi chú 1' },
      ]

      const result = normalizeLineItems(input)
      expect(result).toHaveLength(3)
      expect(result[0].menu_item_id).toBe(ITEM_A)
      expect(result[0].note).toBe('ghi chú 1')
      expect(result[1].menu_item_id).toBe(ITEM_A)
      expect(result[1].note).toBe('ghi chú 2')
      expect(result[2].menu_item_id).toBe(ITEM_B)
    })

    it('throws validation error for empty list', () => {
      expect(() => normalizeLineItems([])).toThrowError(AppError)
    })

    it('throws validation error for invalid UUID or non-integer quantities', () => {
      expect(() =>
        normalizeLineItems([{ menu_item_id: 'invalid-id', quantity: 1 }])
      ).toThrowError(AppError)

      expect(() =>
        normalizeLineItems([{ menu_item_id: ITEM_A, quantity: 0 }])
      ).toThrowError(AppError)

      expect(() =>
        normalizeLineItems([{ menu_item_id: ITEM_A, quantity: 1.5 }])
      ).toThrowError(AppError)

      expect(() =>
        normalizeLineItems([{ menu_item_id: ITEM_A, quantity: 100 }])
      ).toThrowError(AppError)
    })
  })

  describe('computeCanonicalRequestHash', () => {
    it('produces identical hash regardless of line item input order', () => {
      const hash1 = computeCanonicalRequestHash({
        order_type: 'dine_in',
        context: { table_id: 'table-1', table_visit_id: 'visit-1' },
        items: [
          { menu_item_id: ITEM_A, quantity: 2, note: 'cay' },
          { menu_item_id: ITEM_B, quantity: 1, note: '' },
        ],
        note: 'Đem nhanh',
      })

      const hash2 = computeCanonicalRequestHash({
        order_type: 'dine_in',
        context: { table_id: 'table-1', table_visit_id: 'visit-1' },
        items: [
          { menu_item_id: ITEM_B, quantity: 1, note: '' },
          { menu_item_id: ITEM_A, quantity: 2, note: 'cay' },
        ],
        note: '  Đem nhanh  ',
      })

      expect(hash1).toBe(hash2)
    })

    it('produces different hash if note or claim_secret_hash changes', () => {
      const hash1 = computeCanonicalRequestHash({
        order_type: 'dine_in',
        context: { table_id: 'table-1', table_visit_id: 'visit-1' },
        items: [{ menu_item_id: ITEM_A, quantity: 1, note: '' }],
        note: 'Ghi chú 1',
      })

      const hash2 = computeCanonicalRequestHash({
        order_type: 'dine_in',
        context: { table_id: 'table-1', table_visit_id: 'visit-1' },
        items: [{ menu_item_id: ITEM_A, quantity: 1, note: '' }],
        note: 'Ghi chú 2',
      })

      expect(hash1).not.toBe(hash2)
    })
  })

  describe('createOrderQuote & verifyOrderQuote', () => {
    it('creates and verifies a signed order quote payload', () => {
      const { quote_token, expires_at } = createOrderQuote({
        actor_scope: 'guest:hash123',
        order_type: 'dine_in',
        context: {
          table_id: 'table-1',
          table_visit_id: 'visit-1',
          table_name: 'Bàn 1',
          epoch: 1,
        },
        items: [
          {
            menu_item_id: ITEM_A,
            item_name: 'Sườn nướng',
            quantity: 2,
            note: 'ít mỡ',
            unit_price_vnd: 245000,
            line_total_vnd: 490000,
          },
        ],
        subtotal_vnd: 490000,
        shipping_fee_vnd: 0,
        total_vnd: 490000,
      })

      expect(quote_token).toBeDefined()
      expect(expires_at).toBeDefined()

      const verified = verifyOrderQuote(quote_token)
      expect(verified.actor_scope).toBe('guest:hash123')
      expect(verified.order_type).toBe('dine_in')
      expect(verified.context.table_id).toBe('table-1')
      expect(verified.subtotal_vnd).toBe(490000)
      expect(verified.total_vnd).toBe(490000)
      expect(verified.items).toHaveLength(1)
    })

    it('rejects tampered quote token signature', () => {
      const { quote_token } = createOrderQuote({
        actor_scope: 'guest:hash123',
        order_type: 'dine_in',
        context: { table_id: 'table-1', table_visit_id: 'visit-1', table_name: 'Bàn 1', epoch: 1 },
        items: [],
        subtotal_vnd: 0,
        shipping_fee_vnd: 0,
        total_vnd: 0,
      })

      const parts = quote_token.split('.')
      const tampered = `${parts[0]}.${parts[1]}.tamperedsignature`

      expect(() => verifyOrderQuote(tampered)).toThrowError(AppError)
      try {
        verifyOrderQuote(tampered)
      } catch (err: unknown) {
        expect((err as AppError).code).toBe('QUOTE_CHANGED')
      }
    })

    it('rejects expired quote token with QUOTE_EXPIRED', () => {
      const { quote_token } = createOrderQuote(
        {
          actor_scope: 'guest:hash123',
          order_type: 'dine_in',
          context: { table_id: 'table-1', table_visit_id: 'visit-1', table_name: 'Bàn 1', epoch: 1 },
          items: [],
          subtotal_vnd: 0,
          shipping_fee_vnd: 0,
          total_vnd: 0,
        },
        getQuoteSecret(),
        -5 // Already expired
      )

      expect(() => verifyOrderQuote(quote_token)).toThrowError(AppError)
      try {
        verifyOrderQuote(quote_token)
      } catch (err: unknown) {
        expect((err as AppError).code).toBe('QUOTE_EXPIRED')
      }
    })
  })

  describe('extractQuotePayloadUnchecked', () => {
    it('extracts payload from expired or unverified token without throwing', () => {
      const { quote_token } = createOrderQuote(
        {
          actor_scope: 'guest:hash123',
          order_type: 'dine_in',
          context: { table_id: 'table-99', table_visit_id: 'visit-99', table_name: 'Bàn 99', epoch: 2 },
          items: [],
          subtotal_vnd: 0,
          shipping_fee_vnd: 0,
          total_vnd: 0,
        },
        getQuoteSecret(),
        -100 // Expired
      )

      const extracted = extractQuotePayloadUnchecked(quote_token)
      expect(extracted).not.toBeNull()
      expect(extracted!.context.table_id).toBe('table-99')
      expect(extracted!.context.table_visit_id).toBe('visit-99')
    })

    it('returns null for garbage string', () => {
      expect(extractQuotePayloadUnchecked('garbage')).toBeNull()
      expect(extractQuotePayloadUnchecked('a.b.c')).toBeNull()
    })
  })
})
