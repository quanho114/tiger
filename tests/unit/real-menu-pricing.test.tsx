import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { normalizeVietnamese } from '@/shared/lib/normalizeVietnamese'
import { CartProvider, useCart } from '@/features/cart'
import type { MenuItem } from '@/features/catalog/legacyMenuItem'
// @ts-expect-error JS migration script without d.ts declaration file
import { DISH_DESCRIPTIONS as RAW_DESCRIPTIONS } from '../../scripts/update_dish_descriptions.mjs'

const DISH_DESCRIPTIONS = RAW_DESCRIPTIONS as Record<string, string>

describe('Vietnamese Accent Normalization for Menu Search', () => {
  it('strips accents and converts to lowercase', () => {
    expect(normalizeVietnamese('Gà nướng muối ớt')).toBe('ga nuong muoi ot')
    expect(normalizeVietnamese('Bò lúc lắc khoai tây')).toBe('bo luc lac khoai tay')
    expect(normalizeVietnamese('Ếch chiên rơm')).toBe('ech chien rom')
    expect(normalizeVietnamese('Lẩu cá thác lác khổ qua')).toBe('lau ca thac lac kho qua')
  })

  it('correctly maps Vietnamese letter D with stroke (đ/Đ) to d', () => {
    expect(normalizeVietnamese('Đặc sản')).toBe('dac san')
    expect(normalizeVietnamese('đậu hũ')).toBe('dau hu')
    expect(normalizeVietnamese('ĐỒ UỐNG')).toBe('do uong')
  })

  it('handles empty and whitespace-only strings gracefully', () => {
    expect(normalizeVietnamese('')).toBe('')
    expect(normalizeVietnamese('   ')).toBe('')
  })

  it('enables seamless fuzzy matching for accented searches', () => {
    const dishName = 'Gà nướng muối ớt'
    const query = 'ga'
    expect(normalizeVietnamese(dishName).includes(normalizeVietnamese(query))).toBe(true)

    const query2 = 'muoi ot'
    expect(normalizeVietnamese(dishName).includes(normalizeVietnamese(query2))).toBe(true)
  })
})

describe('Cart Multi-Tier Pricing Mode Protection', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  const wrapper = ({ children }: { children: ReactNode }) => (
    <CartProvider>{children}</CartProvider>
  )

  const fixedDish: MenuItem = {
    id: 'dish-fixed-01',
    name: 'Gà ta hấp mắm nhĩ',
    category: 'ga',
    description: 'Thơm lừng nước mắm nhĩ Phú Quốc',
    price: 290000,
    pricing_mode: 'fixed',
    image: '/images/dishes/ga-hap-mam-nhi.jpg',
    modes: ['dine-in', 'delivery', 'takeaway'],
  }

  const rangeDish: MenuItem = {
    id: 'dish-range-01',
    name: 'Gà nướng muối ớt',
    category: 'ga',
    description: 'Tùy chọn nguyên con hoặc nửa con',
    price: 280000,
    price_min: 280000,
    price_max: 300000,
    pricing_mode: 'range',
    image: '/images/dishes/ga-nuong-muoi-ot.jpg',
    modes: ['dine-in', 'delivery', 'takeaway'],
  }

  const marketDish: MenuItem = {
    id: 'dish-market-01',
    name: 'Cá chim nướng muối ớt',
    category: 'ca',
    description: 'Cá tươi sống nướng than hoa',
    price: 0,
    pricing_mode: 'market',
    image: '/images/dishes/ca-chim.jpg',
    modes: ['dine-in', 'delivery', 'takeaway'],
  }

  const unknownDish: MenuItem = {
    id: 'dish-unknown-01',
    name: 'Tiệc trọn gói phục vụ tại gia',
    category: 'mon-phu',
    description: 'Thực đơn đặt tiệc theo yêu cầu',
    price: 0,
    pricing_mode: 'unknown',
    image: '/images/dishes/tiec.jpg',
    modes: ['dine-in', 'delivery', 'takeaway'],
  }

  it('allows adding fixed price items to the cart', () => {
    const { result } = renderHook(() => useCart(), { wrapper })

    act(() => {
      result.current.add(fixedDish)
    })

    expect(result.current.cartItems).toHaveLength(1)
    expect(result.current.cartItems[0].dish.name).toBe('Gà ta hấp mắm nhĩ')
    expect(result.current.subtotal).toBe(290000)
  })

  it('prevents range price items from being added directly to the cart', () => {
    const { result } = renderHook(() => useCart(), { wrapper })

    act(() => {
      result.current.add(rangeDish)
    })

    expect(result.current.cartItems).toHaveLength(0)
    expect(result.current.subtotal).toBe(0)
  })

  it('prevents market (thời giá) items from being added directly to the cart', () => {
    const { result } = renderHook(() => useCart(), { wrapper })

    act(() => {
      result.current.add(marketDish)
    })

    expect(result.current.cartItems).toHaveLength(0)
    expect(result.current.subtotal).toBe(0)
  })

  it('prevents unknown (liên hệ) items from being added directly to the cart', () => {
    const { result } = renderHook(() => useCart(), { wrapper })

    act(() => {
      result.current.add(unknownDish)
    })

    expect(result.current.cartItems).toHaveLength(0)
    expect(result.current.subtotal).toBe(0)
  })
})

describe('Authentic 98 Dishes Culinary Descriptions Quality', () => {
  it('covers exactly 98 authentic dishes with zero missing', () => {
    const keys = Object.keys(DISH_DESCRIPTIONS)
    expect(keys).toHaveLength(98)
  })

  it('ensures each description is rich, evocative, and non-empty (>= 40 characters)', () => {
    for (const [dishName, desc] of Object.entries(DISH_DESCRIPTIONS)) {
      expect(typeof desc).toBe('string')
      expect(desc.trim().length, `Description for ${dishName} too short`).toBeGreaterThanOrEqual(40)
      expect(desc).not.toContain('Lorem')
      expect(desc).not.toContain('TODO')
    }
  })

  it('contains authentic culinary keywords for signature regional specialties', () => {
    expect(DISH_DESCRIPTIONS['Sò huyết Lacot']).toContain('Lacoste')
    expect(DISH_DESCRIPTIONS['Ếch núp lùm']).toContain('sả')
    expect(DISH_DESCRIPTIONS['Cà đắng cá khô' as keyof typeof DISH_DESCRIPTIONS] || DISH_DESCRIPTIONS['Gỏi cà đắng cá khô']).toBeDefined()
    expect(DISH_DESCRIPTIONS['Sườn cháy riềng']).toContain('riềng')
    expect(DISH_DESCRIPTIONS['Cơm lam']).toContain('Tây Bắc')
  })
})
