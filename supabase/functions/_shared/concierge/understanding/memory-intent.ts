/**
 * Tiger Agent V3 — Phase 3: Memory-intent signal.
 *
 * Re-exported through the Understanding Engine so the orchestrator stops
 * classifying the same message twice. Retrieval semantics (FAQ skips
 * storage lookup) live in `memory-retrieval.ts` and are unchanged.
 */

export { classifyMemoryIntent, hasFoodOrDraftIntent } from '../memory-retrieval.ts'
export type { MemoryIntent } from './types.ts'
