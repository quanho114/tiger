import type { DeliveryZoneOption } from './types'

export const FALLBACK_DELIVERY_ZONES: DeliveryZoneOption[] = [
  {
    id: '40000000-0000-0000-0000-000000000001',
    name: 'Nội ô Thị trấn Vĩnh An (< 3km)',
    description: 'Giao nhanh 20-30 phút trong thị trấn',
    fee_vnd: 15000,
    free_threshold_vnd: 200000,
  },
  {
    id: '40000000-0000-0000-0000-000000000002',
    name: 'Khu vực lân cận Vĩnh Tân / Trị An (3 - 7km)',
    description: 'Giao 30-45 phút lân cận',
    fee_vnd: 30000,
    free_threshold_vnd: 400000,
  },
  {
    id: '40000000-0000-0000-0000-000000000003',
    name: 'Bán kính mở rộng (7 - 12km)',
    description: 'Giao 45-60 phút vùng xa',
    fee_vnd: 50000,
    free_threshold_vnd: null,
  },
]
