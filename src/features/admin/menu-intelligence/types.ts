// Tiger Admin — Menu Intelligence types (web-only).
// Taste/role vocabularies mirror the backend taxonomy
// (supabase/functions/_shared/concierge/menu/taxonomy.ts + MealRole).
// Keep them in sync manually; frontend must never import backend runtime.

export type ProfileStatus = 'EMPTY' | 'PARTIAL' | 'READY_FOR_RECOMMENDATION' | 'KITCHEN_VERIFIED'

export type ProfileWarning =
  | 'MISSING_SERVING_PROFILE'
  | 'MISSING_MEAL_ROLE'
  | 'MISSING_TASTE_METADATA'
  | 'ALLERGEN_UNVERIFIED'
  | 'ALLERGEN_UNKNOWN'
  | 'PAIRING_REFERENCE_INVALID'
  | 'STALE_PROFILE'

export interface CoverageReport {
  totalLive: number
  published: number
  withProfile: number
  empty: number
  partial: number
  ready: number
  kitchenVerified: number
  mealRolePct: number
  servingPct: number
  tastePct: number
  allergenExplicitPct: number
  kitchenVerifiedPct: number
  staleSeedIds: string[]
  staleSeedCount: number
  items: { id: string; status: ProfileStatus }[]
}

export type MealRole =
  | 'main_protein' | 'carb' | 'vegetable' | 'soup_hotpot' | 'side'
  | 'dessert' | 'drink' | 'alcohol' | 'set'

export const MEAL_ROLES: { value: MealRole; label: string }[] = [
  { value: 'main_protein', label: 'Món đạm chính' },
  { value: 'carb', label: 'Tinh bột' },
  { value: 'vegetable', label: 'Rau' },
  { value: 'soup_hotpot', label: 'Canh / Lẩu' },
  { value: 'side', label: 'Món phụ' },
  { value: 'dessert', label: 'Tráng miệng' },
  { value: 'drink', label: 'Đồ uống' },
  { value: 'alcohol', label: 'Đồ có cồn' },
  { value: 'set', label: 'Set / Combo' },
]

export const TASTE_TAGS = [
  'spicy', 'smoky', 'savory', 'rich', 'light', 'fresh',
  'sour', 'sweet', 'herbal', 'crispy', 'bitter', 'fragrant',
  'hearty', 'tangy', 'creamy', 'nutty',
] as const

export type AllergenType = 'seafood' | 'peanuts' | 'eggs' | 'dairy' | 'gluten' | 'soy' | 'sesame'

export const ALLERGEN_TYPES: { value: AllergenType; label: string }[] = [
  { value: 'seafood', label: 'Hải sản' },
  { value: 'peanuts', label: 'Đậu phộng' },
  { value: 'eggs', label: 'Trứng' },
  { value: 'dairy', label: 'Sữa' },
  { value: 'gluten', label: 'Gluten' },
  { value: 'soy', label: 'Đậu nành' },
  { value: 'sesame', label: 'Mè' },
]

export type AllergenStatus = 'contains' | 'may_contain' | 'absent' | 'unknown'

export const ALLERGEN_STATUSES: { value: AllergenStatus; label: string }[] = [
  { value: 'contains', label: 'Có chứa' },
  { value: 'may_contain', label: 'Có thể nhiễm' },
  { value: 'absent', label: 'Không chứa' },
  { value: 'unknown', label: 'Chưa rõ' },
]

export interface ProfileDetailItem {
  id: string
  name: string
  description: string | null
  serving: {
    unit: string | null
    description: string | null
    peopleMin: number | null
    peopleMax: number | null
    mealRole: MealRole | null
    mealContext: string
  }
  taste: { spiceLevel: number | null; richnessLevel: number | null; tags: string[] }
  dietaryTags: string[]
  allergens: {
    states: Partial<Record<AllergenType, AllergenStatus>>
    verified: boolean
    source: string
    kitchenNotes: string
  }
  pairingItemIds: string[]
  sources: { serving: string; taste: string; allergen: string }
}

export interface ProfileDetail {
  item: ProfileDetailItem
  status: ProfileStatus
  warnings: ProfileWarning[]
}

export interface AiDraftPayload {
  meal_role?: MealRole | null
  serving_unit?: string | null
  people_min?: number | null
  people_max?: number | null
  spice_level?: number | null
  richness_level?: number | null
  taste_tags?: string[]
  dietary_hints?: string[]
  pairing_names?: string[]
  contribution?: { protein?: number | null; carb?: number | null; vegetable?: number | null; soup?: number | null }
  possible_allergens_for_review?: string[]
  rejected_taste_tags?: string[]
}

export interface AiDraft {
  id: string
  menu_item_id: string
  payload: AiDraftPayload
  provider: string | null
  model: string | null
  created_by: string | null
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string
}

export interface AcceptDraftResult {
  appliedServing: boolean
  appliedTaste: boolean
  droppedPairings: string[]
  rejectedTasteTags: string[]
  allergenCandidatesNoted: string[]
}
