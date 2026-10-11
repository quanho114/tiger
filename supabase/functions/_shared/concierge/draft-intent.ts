/**
 * Compat shim (Phase 3) — canonical implementations live in
 * `./understanding/normalizer.ts` and `./understanding/draft-command.ts`.
 * Kept so existing import paths behave byte-identically.
 */
export { normalizeIntent } from './understanding/normalizer.ts'
export { resolveDraftIntent } from './understanding/draft-command.ts'
export type { DraftCommand as DraftIntent } from './understanding/types.ts'
