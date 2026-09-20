/**
 * Tiger 345 - Concierge Feature Flags & Kill Switches
 * Based on plans/tiger-345/09-concierge-agent-design.md (§21) and Task C09 (AT18)
 *
 * Core Guarantees:
 * 1. Granular kill switches:
 *    - `concierge_disabled`: Disables all concierge interactions (with fallback to hotline/location).
 *    - `ordering_disabled`: Disables creating quotes or submitting orders via concierge.
 *    - `reservation_disabled`: Disables booking tables via concierge.
 *    - `recommendation_disabled`: Disables meal recommendation engine.
 * 2. Status & Reconcile Isolation:
 *    - Even when mutations or all concierge features are disabled, status inquiries
 *      and receipt reconciliation for committed transactions (orders & reservations)
 *      REMAIN ACCESSIBLE.
 * 3. Tool execution budgets (5 tools / turn, 15s timeout).
 */

import type pg from 'pg'

export interface ConciergeFeatureFlags {
  concierge_disabled: boolean
  ordering_disabled: boolean
  reservation_disabled: boolean
  recommendation_disabled: boolean
}

export const MAX_TOOL_CALLS_PER_TURN = 5
export const MAX_TOOL_EXECUTION_TIME_MS = 15000

// In-memory overrides for deterministic test runs
let testOverrides: Partial<ConciergeFeatureFlags> | null = null

export function setConciergeFeatureFlagsForTesting(flags: Partial<ConciergeFeatureFlags> | null): void {
  testOverrides = flags
}

export async function getConciergeFeatureFlags(pool?: pg.Pool): Promise<ConciergeFeatureFlags> {
  const defaults: ConciergeFeatureFlags = {
    concierge_disabled: process.env.CONCIERGE_DISABLED === 'true',
    ordering_disabled: process.env.CONCIERGE_ORDERING_DISABLED === 'true',
    reservation_disabled: process.env.CONCIERGE_RESERVATION_DISABLED === 'true',
    recommendation_disabled: process.env.CONCIERGE_RECOMMENDATION_DISABLED === 'true',
  }

  // Apply environment or in-memory test overrides first
  if (testOverrides) {
    return {
      ...defaults,
      ...testOverrides,
    }
  }

  // If pool is available and system_settings exists, read dynamic flags
  if (pool) {
    try {
      const res = await pool.query(
        `SELECT key, value FROM public.system_settings
         WHERE key IN ('concierge_disabled', 'concierge_ordering_disabled', 'concierge_reservation_disabled', 'concierge_recommendation_disabled')`
      )
      for (const row of res.rows) {
        if (row.key === 'concierge_disabled') {
          defaults.concierge_disabled = row.value === 'true' || row.value === true
        } else if (row.key === 'concierge_ordering_disabled') {
          defaults.ordering_disabled = row.value === 'true' || row.value === true
        } else if (row.key === 'concierge_reservation_disabled') {
          defaults.reservation_disabled = row.value === 'true' || row.value === true
        } else if (row.key === 'concierge_recommendation_disabled') {
          defaults.recommendation_disabled = row.value === 'true' || row.value === true
        }
      }
    } catch {
      // Table may not exist in test/mock environment; fall back safely
    }
  }

  return defaults
}
