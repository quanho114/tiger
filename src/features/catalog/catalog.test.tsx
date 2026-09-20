import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { type ReactNode } from 'react'
import { CatalogProvider } from './CatalogProvider'
import { useCatalog } from './useCatalog'
import * as api from './api'
import type { Category, MenuItem, RestaurantSettings } from './types'

const mockCategories: Category[] = [
  { id: 'cat-1', name: 'Bò nướng', slug: 'bo-nuong', sort_order: 1 },
  { id: 'cat-2', name: 'Lẩu', slug: 'lau', sort_order: 2 },
]

const mockItems: MenuItem[] = [
  {
    id: 'item-1',
    category_id: 'cat-1',
    name: 'Bò tơ nướng tảng',
    slug: 'bo-to-nuong-tang',
    description: 'Thịt bò tơ mềm ngọt nướng trên than hoa',
    price_vnd: 185000,
    image_path: '/images/bo-nuong.jpg',
    image_url: '/images/bo-nuong.jpg',
    available: true,
    is_available: true,
    allow_dine_in: true,
    allow_delivery: true,
    featured_rank: 2,
    is_featured: true,
    tags: ['Bán chạy', 'Đặc sản'],
    serving_size: '2-3 người',
    pairing_note: 'Hợp với bia Tiger bạc',
    delivery_eta: '25-35 phút',
    spice_level: 1,
    is_signature: true,
    is_bestseller: true,
    is_new: false,
  },
  {
    id: 'item-2',
    category_id: 'cat-1',
    name: 'Bò nướng sốt tiêu đen',
    slug: 'bo-nuong-sot-tieu-den',
    description: 'Bò mềm xốt tiêu đen đậm đà',
    price_vnd: 165000,
    image_path: '/images/bo-tieu.jpg',
    image_url: '/images/bo-tieu.jpg',
    available: false,
    is_available: false,
    allow_dine_in: true,
    allow_delivery: true,
    featured_rank: 1,
    is_featured: true,
    tags: ['Cay nhẹ'],
    serving_size: '2 người',
    pairing_note: '',
    delivery_eta: '25-35 phút',
    spice_level: 2,
    is_signature: false,
    is_bestseller: false,
    is_new: true,
  },
  {
    id: 'item-3',
    category_id: 'cat-2',
    name: 'Lẩu riêu cua bắp bò',
    slug: 'lau-rieu-cua-bap-bo',
    description: 'Nước dùng chua thanh đậm đà',
    price_vnd: 295000,
    image_path: '/images/lau-rieu.jpg',
    image_url: '/images/lau-rieu.jpg',
    available: true,
    is_available: true,
    allow_dine_in: true,
    allow_delivery: false,
    featured_rank: null,
    is_featured: false,
    tags: [],
    serving_size: '3-4 người',
    pairing_note: '',
    delivery_eta: '',
    spice_level: 0,
    is_signature: false,
    is_bestseller: false,
    is_new: false,
  },
]

const mockSettings: RestaurantSettings = {
  name: 'Tiger 345',
  phone: '0901234567',
  zalo: '0901234567',
  facebook: 'https://facebook.com/Tiger345HT',
  maps_url: 'https://maps.google.com',
  address: '345 Đường Lê Văn Sỹ, Phường 13, Quận 3, TP.HCM',
  timezone: 'Asia/Ho_Chi_Minh',
  accepting_orders: true,
  accepting_dine_in_orders: true,
  accepting_delivery_orders: true,
  booking_enabled: true,
  min_delivery_order_vnd: 100000,
  reservation_policy: {
    min_notice_minutes: 60,
    max_days_ahead: 30,
    duration_minutes: 120,
    cancel_notice_minutes: 30,
    no_show_grace_minutes: 15,
  },
  business_hours: [
    { id: 'bh-1', weekday: 1, service_type: 'both', open_time: '10:00', close_time: '23:00' },
  ],
  business_closures: [],
  delivery_zones: [
    { id: 'zone-1', name: 'Quận 3', description: 'Khu vực nội thành Quận 3', fee_vnd: 15000, free_threshold_vnd: 300000 },
  ],
  seating_areas: [
    { id: 'area-1', code: 'T1', name: 'Tầng 1' },
  ],
}

describe('useCatalog & CatalogProvider unit tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('throws error when useCatalog is called outside CatalogProvider', () => {
    expect(() => renderHook(() => useCatalog())).toThrow(
      'useCatalog must be used within a CatalogProvider'
    )
  })

  it('loads menu and settings successfully and derives helper values', async () => {
    vi.spyOn(api, 'fetchMenu').mockResolvedValue({
      categories: mockCategories,
      items: mockItems,
    })
    vi.spyOn(api, 'fetchSettings').mockResolvedValue(mockSettings)

    const wrapper = ({ children }: { children: ReactNode }) => (
      <CatalogProvider>{children}</CatalogProvider>
    )

    const { result } = renderHook(() => useCatalog(), { wrapper })

    // Initially loading
    expect(result.current.isLoading).toBe(true)

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.categories).toEqual(mockCategories)
    expect(result.current.items).toEqual(mockItems)
    expect(result.current.settings).toEqual(mockSettings)
    expect(result.current.isError).toBe(false)
    expect(result.current.error).toBeNull()

    // featuredItems sorted by featured_rank ascending (item-2 rank 1, item-1 rank 2)
    expect(result.current.featuredItems).toHaveLength(2)
    expect(result.current.featuredItems[0].id).toBe('item-2')
    expect(result.current.featuredItems[1].id).toBe('item-1')

    // Helper functions
    expect(result.current.getItemById('item-1')?.name).toBe('Bò tơ nướng tảng')
    expect(result.current.getItemsByCategory('cat-1')).toHaveLength(2)
    expect(result.current.getItemsByCategory('cat-2')).toHaveLength(1)
    expect(result.current.getCategoryBySlug('bo-nuong')?.id).toBe('cat-1')
  })

  it('handles menu API error truthfully without fallback mock data', async () => {
    vi.spyOn(api, 'fetchMenu').mockRejectedValue(new Error('Network offline: connection refused'))
    vi.spyOn(api, 'fetchSettings').mockResolvedValue(mockSettings)

    const wrapper = ({ children }: { children: ReactNode }) => (
      <CatalogProvider>{children}</CatalogProvider>
    )

    const { result } = renderHook(() => useCatalog(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.isError).toBe(true)
    expect(result.current.error?.message).toContain('Network offline')
    expect(result.current.menuError).toContain('Network offline')
    expect(result.current.items).toHaveLength(0)
    expect(result.current.categories).toHaveLength(0)
    expect(result.current.settings).toEqual(mockSettings)
  })

  it('handles settings API error truthfully without crashing menu', async () => {
    vi.spyOn(api, 'fetchMenu').mockResolvedValue({
      categories: mockCategories,
      items: mockItems,
    })
    vi.spyOn(api, 'fetchSettings').mockRejectedValue(new Error('Settings backend timeout'))

    const wrapper = ({ children }: { children: ReactNode }) => (
      <CatalogProvider>{children}</CatalogProvider>
    )

    const { result } = renderHook(() => useCatalog(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.isError).toBe(true)
    expect(result.current.settingsError).toContain('Settings backend timeout')
    expect(result.current.settings).toBeNull()
    expect(result.current.items).toHaveLength(3)
  })

  it('supports refetchMenu and refreshMenu to reload live data', async () => {
    const fetchMenuSpy = vi.spyOn(api, 'fetchMenu').mockResolvedValue({
      categories: mockCategories,
      items: mockItems,
    })
    vi.spyOn(api, 'fetchSettings').mockResolvedValue(mockSettings)

    const wrapper = ({ children }: { children: ReactNode }) => (
      <CatalogProvider>{children}</CatalogProvider>
    )

    const { result } = renderHook(() => useCatalog(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(fetchMenuSpy).toHaveBeenCalledTimes(1)

    // Trigger refetchMenu
    await act(async () => {
      await result.current.refetchMenu()
    })

    expect(fetchMenuSpy).toHaveBeenCalledTimes(2)
  })
})
