/** Pure recommendation contracts. These are server-domain types, not a second wire protocol. */
export interface RecommendationItem {
  id: string
  name: string
  price_vnd: number
  pricing_mode?: 'fixed' | 'range' | 'market' | 'unknown'
  price_min?: number | null
  price_max?: number | null
  is_available: boolean
  published?: boolean
  category_name?: string | null
  meal_role?: string | null
  /** Only explicit restaurant/kitchen provenance may contribute verified role quality. */
  role_source?: string | null
  is_bestseller?: boolean
  tags?: string[]
  safety_state?: string
  allow_dine_in?: boolean
  allow_delivery?: boolean
}

/** Bounds must cover every applicable required charge for the combined meal.
 * This module never guesses VAT, shipping thresholds or policy completeness.
 * A caller must derive these conservative bounds from authoritative policy. */
export interface RecommendationFeePolicy {
  complete: boolean
  known_min_vnd: number
  known_max_vnd: number
}

export interface DynamicRecommendationOptions {
  budget_vnd?: number | null
  existingSubtotal?: number
  /** Existing exact-price draft parent IDs, for deduplication/count semantics. */
  existingItemIds?: readonly string[]
  requestedDishCount?: number
  requestedCountScope?: 'new_additions' | 'final_meal'
  preferences?: readonly string[]
  dislikes?: readonly string[]
  bestseller?: 'required' | 'preferred' | 'none'
  mealContext?: 'snack' | 'meal'
  orderMode?: 'dine_in' | 'delivery'
  requireVerifiedSafety?: boolean
  partyConfirmed?: boolean
  feePolicy?: RecommendationFeePolicy
  /** Explicit server-verified quantities; missing values mean one, never invented serving sizes. */
  quantities?: Readonly<Record<string, number>>
  maxEvaluations?: number
  maxPool?: number
  maxPlans?: number
  beamWidth?: number
}

export interface NormalizedRecommendationPrice {
  min: number
  max: number
  kind: 'fixed' | 'range'
  orderableExact: boolean
}
export type PriceNormalization =
  | { ok: true; price: NormalizedRecommendationPrice }
  | { ok: false; reason: 'UNBOUNDED_PRICE' | 'INVALID_PRICE' }

export interface RecommendationLine<T extends RecommendationItem = RecommendationItem> {
  item: T
  quantity: number
  unitMin: number
  unitMax: number
  lineMin: number
  lineMax: number
}
export interface ValidatedRecommendation<T extends RecommendationItem = RecommendationItem> {
  lines: RecommendationLine<T>[]
  /** New proposed food subtotal only. */
  subtotalMin: number
  subtotalMax: number
  existingSubtotal: number
  /** Combined food and known fee bounds; not final-bill bounds when fees incomplete. */
  totalMin: number
  totalMax: number
  knownFeesMin: number
  knownFeesMax: number
  budgetStatus: 'within' | 'conditional'
  feeComplete: boolean
  portionStatus: 'unknown'
  orderableExact: boolean
  distinctCount: number
  finalDistinctCount: number
  warnings: string[]
}
export type RecommendationValidation<T extends RecommendationItem = RecommendationItem> =
  | { ok: true; plan: ValidatedRecommendation<T> }
  | { ok: false; reason: string }

export interface RecommendationQuality {
  score: number
  components: {
    bestseller: number
    preference: number
    coherence: number
    diversity: number
    utilization: number
    redundancyPenalty: number
  }
  reasons: string[]
}
export interface DynamicRecommendationPlan<T extends RecommendationItem = RecommendationItem>
  extends ValidatedRecommendation<T>, RecommendationQuality {
  key: string
}
export interface DynamicRecommendationResult<T extends RecommendationItem = RecommendationItem> {
  plans: DynamicRecommendationPlan<T>[]
  searchStatus: 'complete' | 'bounded_best_found' | 'incomplete' | 'no_feasible_proven' | 'invalid_input'
  stats: { evaluated: number; eligible: number; pool: number; capped: boolean; truncated: boolean }
  exclusions: Record<string, number>
  errors: string[]
}

export const DYNAMIC_RECOMMENDATION_LIMITS = {
  maxDishes: 30,
  maxPool: 48,
  maxEvaluations: 50_000,
  beamWidth: 32,
  maxPlans: 2,
  maxQuantity: 99,
} as const
