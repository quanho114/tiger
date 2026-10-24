export { normalizeRecommendationPrice, checkedAdd, checkedMultiply, isMoney } from './price.ts'
export { validateRecommendation, validateRecommendationOptions, itemEligibility } from './validate.ts'
export { scoreRecommendation, recommendationRole } from './quality.ts'
export { recommendDynamicMeals, dynamicRecommendationKey } from './optimizer.ts'
export { DYNAMIC_RECOMMENDATION_LIMITS } from './types.ts'
export type {
  RecommendationItem, RecommendationFeePolicy, DynamicRecommendationOptions,
  NormalizedRecommendationPrice, PriceNormalization, RecommendationLine,
  ValidatedRecommendation, RecommendationValidation, RecommendationQuality,
  DynamicRecommendationPlan, DynamicRecommendationResult,
} from './types.ts'
