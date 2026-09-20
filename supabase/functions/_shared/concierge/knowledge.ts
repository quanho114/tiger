/**
 * Tiger 345 - Structured Food Knowledge & Grounded Documents
 * Based on plans/tiger-345/09-concierge-agent-design.md (§8, §9, §13, §14)
 */

import type {
  ServingProfile,
  ItemAllergenProfile,
} from './types.ts'

export type { ServingProfile, ItemAllergenProfile }

import { AppError } from '../errors.ts'

export interface RecommendationConfig {
  version: number
  adult_factor: number
  child_factor: number
  appetite_factors: {
    light: number
    normal: number
    heavy: number
  }
  ideal_macro_ratios: {
    protein: number
    carb: number
    vegetable: number
    soup: number
  }
  hard_budget_tolerance_percentage: number
  soft_budget_tolerance_percentage: number
  proposal_ttl_seconds: number
  updated_at?: string
  updated_by?: string
}

export let RECOMMENDATION_CONFIG: RecommendationConfig = {
  version: 1,
  adult_factor: 1.0,
  child_factor: 0.6,
  appetite_factors: {
    light: 0.85,
    normal: 1.0,
    heavy: 1.2,
  },
  ideal_macro_ratios: {
    protein: 0.9, // at least 90% coverage of meal target
    carb: 0.8,
    vegetable: 0.7,
    soup: 0.5,
  },
  hard_budget_tolerance_percentage: 0, // Hard budget means hard cap 0% over
  soft_budget_tolerance_percentage: 5, // Soft budget permits up to 5% with warning
  proposal_ttl_seconds: 1800, // 30 minutes
  updated_at: '2026-09-19T00:00:00Z',
  updated_by: 'system',
}

/**
 * Structured serving profiles for seeded menu items
 * Note on provenance: 'tiger-menu-seed-v1'
 */
export const SERVING_PROFILES: Record<string, ServingProfile> = {
  // Sườn Nướng Mật Ong Hoa Cà Phê
  '10000000-0000-0000-0000-000000000001': {
    item_id: '10000000-0000-0000-0000-000000000001',
    serving_unit: 'đĩa',
    pieces_or_weight: 'Khoảng 550g sườn non',
    people_min: 2,
    people_max: 3,
    meal_role: 'main_protein',
    contributions: { protein: 0.85, carb: 0, vegetable: 0.1, soup: 0 },
    meal_context: 'shared',
    confidence: 'restaurant_defined',
    notes: 'Món nướng chủ đạo, đậm vị, thích hợp dùng chung cho 2-3 khách',
    provenance: 'tiger-menu-seed-v1',
  },

  // Gỏi Cuốn Tôm Thịt & Bơ Sáp
  '10000000-0000-0000-0000-000000000002': {
    item_id: '10000000-0000-0000-0000-000000000002',
    serving_unit: 'phần',
    pieces_or_weight: '4 cuốn lớn cắt đôi',
    people_min: 2,
    people_max: 4,
    meal_role: 'side',
    contributions: { protein: 0.35, carb: 0.25, vegetable: 0.45, soup: 0 },
    meal_context: 'shared',
    confidence: 'restaurant_defined',
    notes: 'Khai vị thanh mát, nhiều rau rừng và bơ sáp Đắk Lắk',
    provenance: 'tiger-menu-seed-v1',
  },

  // Cá Hồi Áp Chảo Sốt Chanh Leo Hạt Dổi
  '10000000-0000-0000-0000-000000000003': {
    item_id: '10000000-0000-0000-0000-000000000003',
    serving_unit: 'phần',
    pieces_or_weight: '220g phi lê cá hồi Nauy',
    people_min: 1,
    people_max: 2,
    meal_role: 'main_protein',
    contributions: { protein: 0.8, carb: 0.1, vegetable: 0.2, soup: 0 },
    meal_context: 'shared',
    confidence: 'restaurant_defined',
    notes: 'Món chính cao cấp, hương vị sốt chanh leo hạt dổi tinh tế',
    provenance: 'tiger-menu-seed-v1',
  },

  // Lẩu Nấm Chim Câu Hoàng Cung
  '10000000-0000-0000-0000-000000000004': {
    item_id: '10000000-0000-0000-0000-000000000004',
    serving_unit: 'nồi',
    pieces_or_weight: '1 con chim câu + 7 loại nấm tươi + dĩa mì trứng tươi',
    people_min: 3,
    people_max: 4,
    meal_role: 'soup_hotpot',
    contributions: { protein: 0.9, carb: 0.6, vegetable: 0.7, soup: 1.0 },
    meal_context: 'shared',
    confidence: 'restaurant_defined',
    notes: 'Nồi lẩu trọn vẹn giàu dinh dưỡng, đầy đủ đạm, nấm rau và mì',
    provenance: 'tiger-menu-seed-v1',
  },

  // Phở Thăn Bò Wagyu Tái Lăn
  '10000000-0000-0000-0000-000000000005': {
    item_id: '10000000-0000-0000-0000-000000000005',
    serving_unit: 'tô',
    pieces_or_weight: 'Tô lớn 150g thăn Wagyu',
    people_min: 1,
    people_max: 1,
    meal_role: 'main_protein',
    contributions: { protein: 0.8, carb: 0.8, vegetable: 0.2, soup: 0.6 },
    meal_context: 'single_main',
    confidence: 'restaurant_defined',
    notes: 'Khẩu phần ăn riêng cho 1 người ăn no trọn vẹn',
    provenance: 'tiger-menu-seed-v1',
  },

  // Bò Nướng Lụi Cuộn Lá Lốt Rừng
  '10000000-0000-0000-0000-000000000006': {
    item_id: '10000000-0000-0000-0000-000000000006',
    serving_unit: 'đĩa',
    pieces_or_weight: '8 cuộn bò lá lốt kèm đĩa bánh hỏi',
    people_min: 2,
    people_max: 3,
    meal_role: 'main_protein',
    contributions: { protein: 0.7, carb: 0.4, vegetable: 0.3, soup: 0 },
    meal_context: 'shared',
    confidence: 'restaurant_defined',
    notes: 'Món ăn kèm bánh hỏi mỡ hành và rau sống',
    provenance: 'tiger-menu-seed-v1',
  },

  // Bánh Xèo Tôm Nhảy Giòn Rụm
  '10000000-0000-0000-0000-000000000007': {
    item_id: '10000000-0000-0000-0000-000000000007',
    serving_unit: 'đĩa',
    pieces_or_weight: '2 cái bánh xèo lớn + rổ rau rừng',
    people_min: 2,
    people_max: 2,
    meal_role: 'main_protein',
    contributions: { protein: 0.5, carb: 0.6, vegetable: 0.6, soup: 0 },
    meal_context: 'shared',
    confidence: 'restaurant_defined',
    notes: 'Nhiều rau rừng cuốn kèm, giòn rụm thơm nước cốt dừa',
    provenance: 'tiger-menu-seed-v1',
  },

  // Combo Cơm Niêu & Cá Bống Kho Tộ
  '10000000-0000-0000-0000-000000000008': {
    item_id: '10000000-0000-0000-0000-000000000008',
    serving_unit: 'phần',
    pieces_or_weight: '1 niêu cơm + 1 tộ cá bống kho + canh chua nhỏ',
    people_min: 1,
    people_max: 2,
    meal_role: 'main_protein',
    contributions: { protein: 0.7, carb: 0.85, vegetable: 0.3, soup: 0.3 },
    meal_context: 'single_main',
    confidence: 'restaurant_defined',
    notes: 'Bữa trưa giao nhanh đầy đủ cơm, cá kho và canh chua',
    provenance: 'tiger-menu-seed-v1',
  },

  // Mâm Tiệc Sum Vầy 4 Người
  '10000000-0000-0000-0000-000000000009': {
    item_id: '10000000-0000-0000-0000-000000000009',
    serving_unit: 'phần',
    pieces_or_weight: '5 món tiệc lớn trọn vẹn',
    people_min: 4,
    people_max: 5,
    meal_role: 'main_protein',
    contributions: { protein: 1.0, carb: 1.0, vegetable: 1.0, soup: 1.0 },
    meal_context: 'shared',
    confidence: 'restaurant_defined',
    notes: 'Set đại tiệc 5 món được bếp trưởng thiết kế cân đối trọn vẹn cho 4-5 người',
    provenance: 'tiger-menu-seed-v1',
  },

  // Trà Đào Cam Sả Mật Ong Rừng
  '10000000-0000-0000-0000-000000000010': {
    item_id: '10000000-0000-0000-0000-000000000010',
    serving_unit: 'ly',
    pieces_or_weight: 'Ly 500ml',
    people_min: 1,
    people_max: 1,
    meal_role: 'drink',
    contributions: { protein: 0, carb: 0.1, vegetable: 0, soup: 0 },
    meal_context: 'side_pairing',
    confidence: 'restaurant_defined',
    notes: 'Trà thảo mộc thơm mát giải ngấy',
    provenance: 'tiger-menu-seed-v1',
  },

  // Nước Ép Ổi Hồng & Hạt Chia Hữu Cơ
  '10000000-0000-0000-0000-000000000011': {
    item_id: '10000000-0000-0000-0000-000000000011',
    serving_unit: 'chai',
    pieces_or_weight: 'Chai 350ml',
    people_min: 1,
    people_max: 1,
    meal_role: 'drink',
    contributions: { protein: 0, carb: 0.1, vegetable: 0, soup: 0 },
    meal_context: 'side_pairing',
    confidence: 'restaurant_defined',
    notes: 'Nước ép giàu vitamin C, thanh lọc',
    provenance: 'tiger-menu-seed-v1',
  },

  // Bánh Flan Trứng Gà Ta Sốt Caramel Dừa
  '10000000-0000-0000-0000-000000000012': {
    item_id: '10000000-0000-0000-0000-000000000012',
    serving_unit: 'phần',
    pieces_or_weight: '1 bánh lớn kèm thạch dừa',
    people_min: 1,
    people_max: 2,
    meal_role: 'dessert',
    contributions: { protein: 0.1, carb: 0.2, vegetable: 0, soup: 0 },
    meal_context: 'side_pairing',
    confidence: 'restaurant_defined',
    notes: 'Tráng miệng ngọt ngào từ trứng gà ta',
    provenance: 'tiger-menu-seed-v1',
  },

  // Chè Hạt Sen Nhãn Lồng Long Nhãn
  '10000000-0000-0000-0000-000000000013': {
    item_id: '10000000-0000-0000-0000-000000000013',
    serving_unit: 'bát',
    pieces_or_weight: '1 bát sứ dưỡng vị',
    people_min: 1,
    people_max: 1,
    meal_role: 'dessert',
    contributions: { protein: 0.05, carb: 0.25, vegetable: 0, soup: 0 },
    meal_context: 'side_pairing',
    confidence: 'restaurant_defined',
    notes: 'Chè hạt sen thanh nhiệt dưỡng tâm',
    provenance: 'tiger-menu-seed-v1',
  },
}

/**
 * Allergen mapping per item
 * Safety rule: Any unverified allergen defaults to 'unknown'.
 * Never affirm safety when data is missing or marked unknown!
 */
export const ALLERGEN_PROFILES: Record<string, ItemAllergenProfile> = {
  // Sườn Nướng Mật Ong: Có mè/vừng rắc lên, đậu nành trong sốt ướp
  '10000000-0000-0000-0000-000000000001': {
    item_id: '10000000-0000-0000-0000-000000000001',
    allergens: {
      peanuts: 'may_contain',
      sesame: 'contains',
      soy: 'contains',
    },
    kitchen_notes: 'Có dùng mè rang rắc mặt và sốt ướp có nước tương đậu nành',
    source: 'demo_estimate',
    verified_by_kitchen: false,
    updated_at: '2026-09-19',
  },

  // Gỏi Cuốn Tôm Thịt: Có tôm (seafood), sốt chấm đậu phộng
  '10000000-0000-0000-0000-000000000002': {
    item_id: '10000000-0000-0000-0000-000000000002',
    allergens: {
      seafood: 'contains',
      peanuts: 'contains',
      soy: 'may_contain',
    },
    kitchen_notes: 'Tôm sú sông tươi; sốt chấm là tương bơ đậu phộng xay nhuyễn',
    source: 'demo_estimate',
    verified_by_kitchen: false,
    updated_at: '2026-09-19',
  },

  // Cá Hồi Áp Chảo: Cá hồi (seafood), bơ áp chảo (dairy)
  '10000000-0000-0000-0000-000000000003': {
    item_id: '10000000-0000-0000-0000-000000000003',
    allergens: {
      seafood: 'contains',
      dairy: 'contains',
    },
    kitchen_notes: 'Cá hồi Nauy; áp chảo cùng bơ lạt nguyên chất',
    source: 'demo_estimate',
    verified_by_kitchen: false,
    updated_at: '2026-09-19',
  },

  // Lẩu Nấm Chim Câu: Mì trứng tươi (gluten, eggs)
  '10000000-0000-0000-0000-000000000004': {
    item_id: '10000000-0000-0000-0000-000000000004',
    allergens: {
      gluten: 'contains',
      eggs: 'contains',
    },
    kitchen_notes: 'Mì trứng tươi chứa bột mì và trứng gà; có thể đổi bún gạo tươi nếu khách kiêng',
    source: 'demo_estimate',
    verified_by_kitchen: false,
    updated_at: '2026-09-19',
  },

  // Phở Thăn Bò Wagyu: Bánh phở gạo, nước dùng bò
  '10000000-0000-0000-0000-000000000005': {
    item_id: '10000000-0000-0000-0000-000000000005',
    allergens: {
      gluten: 'unknown',
      soy: 'may_contain',
    },
    kitchen_notes: 'Bánh phở tươi làm từ gạo; gia vị nước hầm gia truyền',
    source: 'demo_estimate',
    verified_by_kitchen: false,
    updated_at: '2026-09-19',
  },

  // Bò Nướng Lụi Cuộn Lá Lốt: Có rắc đậu phộng rang
  '10000000-0000-0000-0000-000000000006': {
    item_id: '10000000-0000-0000-0000-000000000006',
    allergens: {
      peanuts: 'contains',
    },
    kitchen_notes: 'Mỡ hành rắc đậu phộng rang giòn; có thể yêu cầu không rắc đậu phộng',
    source: 'demo_estimate',
    verified_by_kitchen: false,
    updated_at: '2026-09-19',
  },

  // Bánh Xèo Tôm Nhảy: Tôm đất (seafood), nước cốt dừa
  '10000000-0000-0000-0000-000000000007': {
    item_id: '10000000-0000-0000-0000-000000000007',
    allergens: {
      seafood: 'contains',
      eggs: 'may_contain',
    },
    kitchen_notes: 'Nhân tôm đất nguyên vỏ giòn ngọt',
    source: 'demo_estimate',
    verified_by_kitchen: false,
    updated_at: '2026-09-19',
  },

  // Combo Cơm Niêu & Cá Bống Kho Tộ: Cá bống (seafood), nước màu
  '10000000-0000-0000-0000-000000000008': {
    item_id: '10000000-0000-0000-0000-000000000008',
    allergens: {
      seafood: 'contains',
      soy: 'may_contain',
    },
    kitchen_notes: 'Cá bống kho tiêu keo',
    source: 'demo_estimate',
    verified_by_kitchen: false,
    updated_at: '2026-09-19',
  },

  // Mâm Tiệc Sum Vầy 4 Người: Gồm tôm, cá hồi, sườn nướng
  '10000000-0000-0000-0000-000000000009': {
    item_id: '10000000-0000-0000-0000-000000000009',
    allergens: {
      seafood: 'contains',
      peanuts: 'contains',
      dairy: 'contains',
      sesame: 'contains',
    },
    kitchen_notes: 'Mâm tiệc phong phú kết hợp gỏi cuốn tôm, cá hồi áp chảo sốt bơ và sườn nướng mè',
    source: 'demo_estimate',
    verified_by_kitchen: false,
    updated_at: '2026-09-19',
  },

  // Trà Đào Cam Sả
  '10000000-0000-0000-0000-000000000010': {
    item_id: '10000000-0000-0000-0000-000000000010',
    allergens: {},
    kitchen_notes: 'Thành phần hoàn toàn từ trà ô long, trái cây tươi và mật ong rừng',
    source: 'demo_estimate',
    verified_by_kitchen: false,
    updated_at: '2026-09-19',
  },

  // Nước Ép Ổi Hồng
  '10000000-0000-0000-0000-000000000011': {
    item_id: '10000000-0000-0000-0000-000000000011',
    allergens: {},
    kitchen_notes: '100% ổi hồng ép tươi và hạt chia hữu cơ',
    source: 'demo_estimate',
    verified_by_kitchen: false,
    updated_at: '2026-09-19',
  },

  // Bánh Flan: Trứng gà, sữa tươi, sữa đặc
  '10000000-0000-0000-0000-000000000012': {
    item_id: '10000000-0000-0000-0000-000000000012',
    allergens: {
      eggs: 'contains',
      dairy: 'contains',
    },
    kitchen_notes: 'Chứa lòng đỏ trứng gà ta và sữa tươi thanh trùng',
    source: 'demo_estimate',
    verified_by_kitchen: false,
    updated_at: '2026-09-19',
  },

  // Chè Hạt Sen Nhãn Lồng
  '10000000-0000-0000-0000-000000000013': {
    item_id: '10000000-0000-0000-0000-000000000013',
    allergens: {},
    kitchen_notes: 'Hạt sen Huế, long nhãn Hưng Yên, đường phèn',
    source: 'demo_estimate',
    verified_by_kitchen: false,
    updated_at: '2026-09-19',
  },
}

/**
 * Grounded restaurant knowledge documents for RAG / retrieval (§14)
 */
export type KnowledgeDocumentStatus = 'draft' | 'published' | 'retired'

export interface KnowledgeDocument {
  id: string
  topic:
    | 'hours_and_location'
    | 'delivery_policy'
    | 'reservation_policy'
    | 'culinary_style'
    | 'allergens_safety'
    | string
  title: string
  keywords: string[]
  content: string
  source: string
  version: number
  status: KnowledgeDocumentStatus
  effective_from?: string | null
  effective_to?: string | null
  approved_by?: string | null
  updated_at: string
}

export let RESTAURANT_KNOWLEDGE_DOCS: KnowledgeDocument[] = [
  {
    id: 'doc-001',
    topic: 'hours_and_location',
    title: 'Giờ mở cửa, địa chỉ và chỗ đỗ xe tại Tiger 345',
    keywords: [
      'giờ',
      'mở cửa',
      'đóng cửa',
      'địa chỉ',
      'ở đâu',
      'chỗ đỗ xe',
      'bãi xe',
      'ô tô',
      'xe máy',
      'vị trí',
      'bản đồ',
      'ngày lễ',
      'hotline',
      'số điện thoại',
      'liên hệ',
    ],
    content:
      'Tiger 345 tọa lạc tại số 17, Đường Số 1, Tổ 6, Khu Phố 2, Thị Trấn Vĩnh An, Huyện Vĩnh Cửu, Tỉnh Đồng Nai. Giờ mở cửa phục vụ hàng ngày (kể cả ngày lễ và cuối tuần) từ 10:30 sáng đến 22:30 tối (bếp nhận order món cuối lúc 21:45). Nhà hàng có khuôn viên sân vườn thoáng mát, phòng VIP riêng tư tiếp khách, bãi đỗ xe ô tô và xe máy rộng rãi, có nhân viên bảo vệ trông giữ xe an toàn và hướng dẫn đỗ xe chu đáo. Hotline liên hệ: 0901 345 345.',
    source: 'tiger-restaurant-policy-2026',
    version: 1,
    status: 'published',
    effective_from: '2026-01-01T00:00:00Z',
    effective_to: null,
    approved_by: 'owner',
    updated_at: '2026-09-19T00:00:00Z',
  },
  {
    id: 'doc-002',
    topic: 'delivery_policy',
    title: 'Chính sách giao hàng tận nơi và đóng gói giữ nhiệt',
    keywords: [
      'giao hàng',
      'ship',
      'tận nơi',
      'thời gian giao',
      'đóng gói',
      'hộp giữ nhiệt',
      'phí ship',
      'phí giao',
      'khoảng cách',
      'chính sách ship',
      'chính sách giao hàng',
    ],
    content:
      'Tiger 345 phục vụ giao tận nơi khu vực Thị trấn Vĩnh An và lân cận thuộc Huyện Vĩnh Cửu. Đơn hàng giao tận nơi được đóng gói trong hộp giữ nhiệt thân thiện môi trường tiệt trùng, kèm nước dùng và món nướng nóng sốt, thời gian giao trung bình từ 25 đến 40 phút. Phí giao hàng được tính minh bạch theo khu vực (Fixed delivery zones). Đối với lẩu giao tận nơi, nhà hàng chuẩn bị sẵn nồi nhôm tiệt trùng và hướng dẫn dùng tiện lợi.',
    source: 'tiger-delivery-standard-2026',
    version: 1,
    status: 'published',
    effective_from: '2026-01-01T00:00:00Z',
    effective_to: null,
    approved_by: 'owner',
    updated_at: '2026-09-19T00:00:00Z',
  },
  {
    id: 'doc-003',
    topic: 'reservation_policy',
    title: 'Quy định đặt bàn trước và giữ chỗ tiệc',
    keywords: [
      'đặt bàn',
      'giữ chỗ',
      'giữ bàn',
      'thời gian giữ bàn',
      'tối đa',
      'bao lâu',
      'bàn tiệc',
      'đặt trước',
      'chờ',
      'hủy bàn',
      'khu vực',
      'phòng riêng',
      'phòng vip',
      'hotline đặt bàn',
      'số điện thoại đặt bàn',
      'xác nhận đặt bàn',
    ],
    content:
      'Khách hàng có thể đặt bàn trực tuyến qua website trước từ 30 phút đến 30 ngày. Không yêu cầu đặt cọc trước cho bàn gia đình thông thường. Sau khi khách gửi yêu cầu, hệ thống ghi nhận ở trạng thái "Chờ nhà hàng xác nhận" (Pending) và nhân viên sẽ liên hệ xác nhận qua điện thoại trong vòng 15 phút. Nhà hàng giữ bàn tối đa trong vòng 15 phút so với giờ hẹn (grace period). Khách có thể hủy yêu cầu đặt bàn trước ít nhất 1 giờ. Hotline hỗ trợ đặt bàn: 0901 345 345.',
    source: 'tiger-reservation-policy-2026',
    version: 1,
    status: 'published',
    effective_from: '2026-01-01T00:00:00Z',
    effective_to: null,
    approved_by: 'owner',
    updated_at: '2026-09-19T00:00:00Z',
  },
  {
    id: 'doc-004',
    topic: 'culinary_style',
    title: 'Phong cách ẩm thực và nguồn nguyên liệu Tiger 345',
    keywords: ['phong cách', 'ẩm thực', 'tây bắc', 'bistro', 'nguyên liệu', 'nướng than', 'gia vị', 'hạt dổi', 'mắc khén'],
    content:
      'Tiger 345 là Contemporary Bistro kết hợp hài hòa giữa đặc sản vùng cao Tây Bắc và kỹ thuật chế biến đương đại. Món nướng sử dụng 100% than hoa tự nhiên, kết hợp gia vị rừng thảo mộc như hạt dổi, mắc khén, mật ong hoa cà phê Tây Nguyên. Nguyên liệu thịt tươi tuyển chọn mỗi ngày, hải sản sống và rau non tươi hữu cơ, không sử dụng chất bảo quản hay phẩm màu độc hại.',
    source: 'tiger-culinary-manifesto-2026',
    version: 1,
    status: 'published',
    effective_from: '2026-01-01T00:00:00Z',
    effective_to: null,
    approved_by: 'owner',
    updated_at: '2026-09-19T00:00:00Z',
  },
  {
    id: 'doc-005',
    topic: 'allergens_safety',
    title: 'Chính sách dị ứng và an toàn thực phẩm tại bếp',
    keywords: ['dị ứng', 'an toàn', 'hải sản', 'đậu phộng', 'trứng', 'sữa', 'gluten', 'bột mì', 'kiêng', 'thay đổi món'],
    content:
      'Tiger 345 luôn chú trọng an toàn cho thực khách có cơ địa nhạy cảm hoặc dị ứng thực phẩm. Nhà hàng ghi nhận rõ các món có chứa hải sản, đậu phộng, trứng, sữa hay bột mì. Nếu bạn có tiền sử dị ứng nghiêm trọng, vui lòng thông báo rõ với trợ lý hoặc nhân viên để bếp chuẩn bị dụng cụ riêng tránh nhiễm chéo (cross-contact). Khi chưa có đủ thông tin kiểm nghiệm từ bếp trưởng, hệ thống sẽ không đưa ra khẳng định an toàn tuyệt đối mà hướng dẫn khách xác nhận trực tiếp.',
    source: 'tiger-allergen-safety-2026',
    version: 1,
    status: 'published',
    effective_from: '2026-01-01T00:00:00Z',
    effective_to: null,
    approved_by: 'owner',
    updated_at: '2026-09-19T00:00:00Z',
  },
]

// Backup clones for test resets
const INITIAL_CONFIG_SNAPSHOT = JSON.parse(JSON.stringify(RECOMMENDATION_CONFIG))
const INITIAL_SERVING_SNAPSHOT = JSON.parse(JSON.stringify(SERVING_PROFILES))
const INITIAL_ALLERGEN_SNAPSHOT = JSON.parse(JSON.stringify(ALLERGEN_PROFILES))
const INITIAL_DOCS_SNAPSHOT = JSON.parse(JSON.stringify(RESTAURANT_KNOWLEDGE_DOCS))

export function resetKnowledgeStore(): void {
  RECOMMENDATION_CONFIG = JSON.parse(JSON.stringify(INITIAL_CONFIG_SNAPSHOT))
  for (const k of Object.keys(SERVING_PROFILES)) {
    delete SERVING_PROFILES[k]
  }
  Object.assign(SERVING_PROFILES, JSON.parse(JSON.stringify(INITIAL_SERVING_SNAPSHOT)))

  for (const k of Object.keys(ALLERGEN_PROFILES)) {
    delete ALLERGEN_PROFILES[k]
  }
  Object.assign(ALLERGEN_PROFILES, JSON.parse(JSON.stringify(INITIAL_ALLERGEN_SNAPSHOT)))

  RESTAURANT_KNOWLEDGE_DOCS.length = 0
  RESTAURANT_KNOWLEDGE_DOCS.push(...JSON.parse(JSON.stringify(INITIAL_DOCS_SNAPSHOT)))
}

/**
 * Admin Knowledge Operations & Audit (§A0, §13, §14)
 */
export interface KnowledgeAuditReport {
  total_serving_profiles: number
  total_allergen_profiles: number
  verified_by_kitchen_count: number
  demo_estimate_count: number
  unverified_allergens_count: number
  total_documents: number
  published_documents_count: number
  draft_documents_count: number
  retired_documents_count: number
  config_version: number
  generated_at: string
  details: {
    item_id: string
    serving_confidence: string
    allergen_source?: string
    verified_by_kitchen: boolean
  }[]
}

export function adminUpdateServingProfile(
  itemId: string,
  profileUpdates: Partial<ServingProfile>,
  auditedBy?: string
): ServingProfile {
  if (!itemId || !/^[0-9a-fA-F-]{36}$/.test(itemId)) {
    throw new AppError('VALIDATION_ERROR', 'Mã món ăn không hợp lệ (yêu cầu UUID)', 422)
  }

  if (profileUpdates.people_min !== undefined) {
    if (typeof profileUpdates.people_min !== 'number' || profileUpdates.people_min <= 0) {
      throw new AppError('VALIDATION_ERROR', 'Số người tối thiểu phải là số dương', 422)
    }
  }
  if (profileUpdates.people_max !== undefined) {
    if (typeof profileUpdates.people_max !== 'number' || profileUpdates.people_max <= 0) {
      throw new AppError('VALIDATION_ERROR', 'Số người tối đa phải là số dương', 422)
    }
  }
  const min = profileUpdates.people_min ?? SERVING_PROFILES[itemId]?.people_min ?? 1
  const max = profileUpdates.people_max ?? SERVING_PROFILES[itemId]?.people_max ?? min
  if (min > max) {
    throw new AppError('VALIDATION_ERROR', 'Số người tối thiểu không được lớn hơn số người tối đa', 422)
  }

  if (profileUpdates.contributions) {
    for (const [key, val] of Object.entries(profileUpdates.contributions)) {
      if (typeof val !== 'number' || val < 0 || val > 1.5) {
        throw new AppError('VALIDATION_ERROR', `Giá trị đóng góp nhóm ${key} phải từ 0 đến 1.5`, 422)
      }
    }
  }

  const existing = SERVING_PROFILES[itemId]
  const now = new Date().toISOString()
  const updated: ServingProfile = {
    ...(existing || {
      item_id: itemId,
      serving_unit: 'phần',
      people_min: min,
      people_max: max,
      meal_role: 'main_protein',
      contributions: { protein: 0.5, carb: 0.5, vegetable: 0.2, soup: 0 },
      meal_context: 'shared',
      confidence: 'restaurant_defined',
      provenance: `admin_edit:${auditedBy || 'kitchen_staff'}`,
    }),
    ...profileUpdates,
    people_min: min,
    people_max: max,
    updated_by: auditedBy || 'kitchen_staff',
    updated_at: now,
    provenance: `admin_audit:${auditedBy || 'kitchen_staff'}:${now}`,
  }
  SERVING_PROFILES[itemId] = updated
  return updated
}

const VALID_ALLERGENS = ['seafood', 'peanuts', 'eggs', 'dairy', 'gluten', 'soy', 'sesame']
const VALID_ALLERGEN_STATUSES = ['contains', 'may_contain', 'unknown']

export function adminUpdateAllergenProfile(
  itemId: string,
  profileUpdates: Partial<ItemAllergenProfile>,
  auditedBy?: string
): ItemAllergenProfile {
  if (!itemId || !/^[0-9a-fA-F-]{36}$/.test(itemId)) {
    throw new AppError('VALIDATION_ERROR', 'Mã món ăn không hợp lệ (yêu cầu UUID)', 422)
  }

  if (profileUpdates.allergens) {
    for (const [allergen, status] of Object.entries(profileUpdates.allergens)) {
      if (!VALID_ALLERGENS.includes(allergen)) {
        throw new AppError('VALIDATION_ERROR', `Dị ứng không hợp lệ: ${allergen}`, 422)
      }
      if (!VALID_ALLERGEN_STATUSES.includes(status as string)) {
        throw new AppError('VALIDATION_ERROR', `Trạng thái dị ứng không hợp lệ: ${status}`, 422)
      }
    }
  }

  // AT07 Safety Gate: verified_by_kitchen can NEVER self-verify or be set without kitchen attribution/notes
  const existing = ALLERGEN_PROFILES[itemId]
  let isVerified = existing?.verified_by_kitchen ?? false

  if (profileUpdates.verified_by_kitchen !== undefined) {
    if (profileUpdates.verified_by_kitchen === true) {
      const hasAuditor = Boolean(auditedBy && auditedBy.trim().length > 0)
      const hasKitchenNotes = Boolean(
        profileUpdates.kitchen_notes && profileUpdates.kitchen_notes.trim().length > 0
      )
      if (!hasAuditor && !hasKitchenNotes) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Xác nhận an toàn bếp (verified_by_kitchen) bắt buộc phải có ghi chú kiểm nghiệm của bếp hoặc thông tin người duyệt',
          422
        )
      }
      isVerified = true
    } else {
      isVerified = false
    }
  }

  const now = new Date().toISOString()
  const updated: ItemAllergenProfile = {
    ...(existing || {
      item_id: itemId,
      allergens: {},
      verified_by_kitchen: false,
    }),
    ...profileUpdates,
    verified_by_kitchen: isVerified,
    source: isVerified
      ? 'kitchen_audited'
      : (profileUpdates.source || existing?.source || 'demo_estimate'),
    updated_by: auditedBy || 'bếp trưởng',
    updated_at: now,
    kitchen_notes: `${profileUpdates.kitchen_notes || existing?.kitchen_notes || ''}${
      auditedBy ? ` [Duyệt bởi: ${auditedBy}]` : ''
    }`.trim(),
  }
  ALLERGEN_PROFILES[itemId] = updated
  return updated
}

export function adminUpdateConfig(
  updates: Partial<RecommendationConfig>,
  auditedBy?: string
): RecommendationConfig {
  if (
    updates.adult_factor !== undefined &&
    (typeof updates.adult_factor !== 'number' || updates.adult_factor <= 0)
  ) {
    throw new AppError('VALIDATION_ERROR', 'Hệ số người lớn (adult_factor) phải là số dương', 422)
  }
  if (
    updates.child_factor !== undefined &&
    (typeof updates.child_factor !== 'number' || updates.child_factor <= 0)
  ) {
    throw new AppError('VALIDATION_ERROR', 'Hệ số trẻ em (child_factor) phải là số dương', 422)
  }
  if (updates.appetite_factors) {
    for (const [lvl, factor] of Object.entries(updates.appetite_factors)) {
      if (typeof factor !== 'number' || factor <= 0) {
        throw new AppError('VALIDATION_ERROR', `Hệ số sức ăn ${lvl} phải là số dương`, 422)
      }
    }
  }
  if (
    updates.hard_budget_tolerance_percentage !== undefined &&
    (typeof updates.hard_budget_tolerance_percentage !== 'number' ||
      updates.hard_budget_tolerance_percentage < 0)
  ) {
    throw new AppError('VALIDATION_ERROR', 'Độ lệch ngân sách cứng phải >= 0', 422)
  }
  if (
    updates.soft_budget_tolerance_percentage !== undefined &&
    (typeof updates.soft_budget_tolerance_percentage !== 'number' ||
      updates.soft_budget_tolerance_percentage < 0)
  ) {
    throw new AppError('VALIDATION_ERROR', 'Độ lệch ngân sách mềm phải >= 0', 422)
  }

  const newVersion = RECOMMENDATION_CONFIG.version + 1
  RECOMMENDATION_CONFIG = {
    ...RECOMMENDATION_CONFIG,
    ...updates,
    appetite_factors: {
      ...RECOMMENDATION_CONFIG.appetite_factors,
      ...(updates.appetite_factors || {}),
    },
    ideal_macro_ratios: {
      ...RECOMMENDATION_CONFIG.ideal_macro_ratios,
      ...(updates.ideal_macro_ratios || {}),
    },
    version: newVersion,
    updated_at: new Date().toISOString(),
    updated_by: auditedBy || 'admin',
  }
  return RECOMMENDATION_CONFIG
}

export function adminCreateDocument(
  doc: Omit<KnowledgeDocument, 'id' | 'version' | 'updated_at'> & { id?: string },
  auditedBy?: string
): KnowledgeDocument {
  if (!doc.title || doc.title.trim().length === 0) {
    throw new AppError('VALIDATION_ERROR', 'Tiêu đề tài liệu không được để trống', 422)
  }
  if (!doc.content || doc.content.trim().length === 0) {
    throw new AppError('VALIDATION_ERROR', 'Nội dung tài liệu không được để trống', 422)
  }
  if (!doc.topic || doc.topic.trim().length === 0) {
    throw new AppError('VALIDATION_ERROR', 'Chủ đề tài liệu không được để trống', 422)
  }
  if (!doc.source || doc.source.trim().length === 0) {
    throw new AppError('VALIDATION_ERROR', 'Nguồn gốc tài liệu không được để trống', 422)
  }

  const validStatuses: KnowledgeDocumentStatus[] = ['draft', 'published', 'retired']
  const status: KnowledgeDocumentStatus =
    doc.status && validStatuses.includes(doc.status) ? doc.status : 'published'

  const id = doc.id && doc.id.trim().length > 0 ? doc.id.trim() : `doc-${Date.now().toString(36)}`
  const newDoc: KnowledgeDocument = {
    id,
    topic: doc.topic.trim(),
    title: doc.title.trim(),
    keywords: Array.isArray(doc.keywords) ? doc.keywords : [],
    content: doc.content.trim(),
    source: doc.source.trim(),
    version: 1,
    status,
    effective_from: doc.effective_from || null,
    effective_to: doc.effective_to || null,
    approved_by: auditedBy || doc.approved_by || 'admin',
    updated_at: new Date().toISOString(),
  }

  RESTAURANT_KNOWLEDGE_DOCS.push(newDoc)
  return newDoc
}

export function adminUpdateDocument(
  docId: string,
  updates: Partial<KnowledgeDocument>,
  auditedBy?: string
): KnowledgeDocument {
  const doc = RESTAURANT_KNOWLEDGE_DOCS.find((d) => d.id === docId)
  if (!doc) {
    throw new AppError('NOT_FOUND', `Tài liệu tri thức ${docId} không tồn tại`, 404)
  }

  if (updates.status) {
    const validStatuses: KnowledgeDocumentStatus[] = ['draft', 'published', 'retired']
    if (!validStatuses.includes(updates.status)) {
      throw new AppError('VALIDATION_ERROR', `Trạng thái tài liệu không hợp lệ: ${updates.status}`, 422)
    }
  }

  doc.version += 1
  if (updates.title) doc.title = updates.title.trim()
  if (updates.content) doc.content = updates.content.trim()
  if (updates.topic) doc.topic = updates.topic.trim()
  if (updates.source) doc.source = updates.source.trim()
  if (updates.keywords) doc.keywords = updates.keywords
  if (updates.status) doc.status = updates.status
  if (updates.effective_from !== undefined) doc.effective_from = updates.effective_from
  if (updates.effective_to !== undefined) doc.effective_to = updates.effective_to
  doc.approved_by = auditedBy || doc.approved_by || 'admin'
  doc.updated_at = new Date().toISOString()

  return doc
}

export function adminRetireDocument(docId: string, auditedBy?: string): KnowledgeDocument {
  return adminUpdateDocument(docId, { status: 'retired' }, auditedBy)
}

export function adminAuditKnowledge(): KnowledgeAuditReport {
  const allItemIds = Array.from(
    new Set([...Object.keys(SERVING_PROFILES), ...Object.keys(ALLERGEN_PROFILES)])
  )

  let verifiedCount = 0
  let demoEstimateCount = 0
  let unverifiedAllergensCount = 0

  const details = allItemIds.map((itemId) => {
    const serving = SERVING_PROFILES[itemId]
    const allergen = ALLERGEN_PROFILES[itemId]

    if (allergen?.verified_by_kitchen) {
      verifiedCount++
    } else {
      unverifiedAllergensCount++
      if (allergen?.source === 'demo_estimate') {
        demoEstimateCount++
      }
    }

    return {
      item_id: itemId,
      serving_confidence: serving?.confidence || 'missing',
      allergen_source: allergen?.source,
      verified_by_kitchen: Boolean(allergen?.verified_by_kitchen),
    }
  })

  const publishedCount = RESTAURANT_KNOWLEDGE_DOCS.filter((d) => d.status === 'published').length
  const draftCount = RESTAURANT_KNOWLEDGE_DOCS.filter((d) => d.status === 'draft').length
  const retiredCount = RESTAURANT_KNOWLEDGE_DOCS.filter((d) => d.status === 'retired').length

  return {
    total_serving_profiles: Object.keys(SERVING_PROFILES).length,
    total_allergen_profiles: Object.keys(ALLERGEN_PROFILES).length,
    verified_by_kitchen_count: verifiedCount,
    demo_estimate_count: demoEstimateCount,
    unverified_allergens_count: unverifiedAllergensCount,
    total_documents: RESTAURANT_KNOWLEDGE_DOCS.length,
    published_documents_count: publishedCount,
    draft_documents_count: draftCount,
    retired_documents_count: retiredCount,
    config_version: RECOMMENDATION_CONFIG.version,
    generated_at: new Date().toISOString(),
    details,
  }
}


