/**
 * Compat shim (Phase 3) — canonical implementation lives in
 * `./understanding/intent-classifier.ts`. Kept so existing import
 * paths behave byte-identically.
 */
export { classifyConciergeTurn, namedMenuQuery } from './understanding/intent-classifier.ts'
export type { ConciergeTurnIntent } from './understanding/types.ts'
