/**
 * Compat shim (Phase 3) — canonical implementation lives in
 * `./understanding/constraint-extractor.ts`. Kept so existing import
 * paths behave byte-identically.
 */
export { applyTurnConstraints, extractConstraintDelta, mergeConstraintDelta } from './understanding/constraint-extractor.ts'
