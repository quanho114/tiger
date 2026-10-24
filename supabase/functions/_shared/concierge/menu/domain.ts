/**
 * Tiger Agent V3 — Phase 5: Menu domain facade.
 *
 * Single entry point for authoritative menu data. In-process snapshot
 * cache (45s TTL, in-flight dedup, bounded). No Redis: Edge isolates
 * hold a local copy and short TTL is the consistency fallback when
 * cross-isolate invalidation cannot be guaranteed (documented below).
 *
 * Admin/profile writes must call invalidateMenuSnapshot() in the same
 * isolate; other isolates converge within TTL.
 */

import type pg from 'pg'
import { loadMenuSnapshot } from './repository.ts'
import { toLegacyAllergenProfile, toLegacyServingProfile } from './mapper.ts'
import type { ItemAllergenProfile, ServingProfile } from '../types.ts'
import type { MenuDomainItem, MenuSnapshot } from './types.ts'

export type { MenuDomainItem, MenuSnapshot }

export const SNAPSHOT_TTL_MS = 45_000

interface CacheEntry {
  snapshot: MenuSnapshot
  expiresAt: number
  inflight: Promise<MenuSnapshot> | null
  epoch: number
}

// Keyed by pool instance: isolates test doubles from each other while the
// production pool keeps a single shared entry per isolate.
const caches = new WeakMap<object, CacheEntry>()
let epoch = 0

export async function getMenuSnapshot(db: pg.Pool | pg.PoolClient, forceRefresh = false): Promise<MenuSnapshot> {
  const now = Date.now()
  let entry = caches.get(db)
  if (!forceRefresh && entry && entry.epoch === epoch && entry.expiresAt > now && entry.snapshot.freshness !== 'stale') return entry.snapshot
  if (entry && entry.epoch === epoch && entry.inflight) return entry.inflight
  if (!entry || entry.epoch !== epoch) {
    entry = { snapshot: { version: '', loadedAt: '', items: [] }, expiresAt: 0, inflight: null, epoch }
    caches.set(db, entry)
  }
  const current = entry
  current.inflight = loadMenuSnapshot(db).then(
    (snapshot) => {
      // An admin invalidation during a read must not republish the older read.
      if (current.epoch !== epoch) return getMenuSnapshot(db)
      current.expiresAt = Date.now() + SNAPSHOT_TTL_MS
      current.snapshot = { ...snapshot, freshness: 'fresh', expiresAt: new Date(current.expiresAt).toISOString() }
      current.inflight = null
      return current.snapshot
    },
    (error) => {
      current.inflight = null
      // Serve stale rather than fail when a previous snapshot exists;
      // fail closed when there is nothing safe to serve.
      if (current.epoch !== epoch) return getMenuSnapshot(db)
      if (current.expiresAt > 0) {
        current.snapshot = { ...current.snapshot, freshness: 'stale' }
        return current.snapshot
      }
      throw error
    },
  )
  return current.inflight
}

export function invalidateMenuSnapshot(): void {
  epoch++
}

export function snapshotById(snapshot: MenuSnapshot, id: string): MenuDomainItem | undefined {
  return snapshot.items.find((item) => item.id === id)
}

/**
 * Legacy profile maps for retrieval/planner/safety consumers.
 * Only profiled items appear (unprofiled behave exactly as before:
 * missing key → safe fallback paths).
 */
export function snapshotServingProfiles(snapshot: MenuSnapshot): Record<string, ServingProfile> {
  const out: Record<string, ServingProfile> = {}
  for (const item of snapshot.items) {
    const profile = toLegacyServingProfile(item)
    if (profile) out[item.id] = profile
  }
  return out
}

export function snapshotAllergenProfiles(snapshot: MenuSnapshot): Record<string, ItemAllergenProfile> {
  const out: Record<string, ItemAllergenProfile> = {}
  for (const item of snapshot.items) {
    if (item.provenance === 'menu:live_unprofiled') continue
    const profile = toLegacyAllergenProfile(item)
    out[item.id] = { ...profile,
      ...(snapshot.expiresAt ? { snapshot_expires_at: snapshot.expiresAt } : {}),
      verified_by_kitchen: profile.verified_by_kitchen && snapshot.freshness !== 'stale' &&
        (!snapshot.expiresAt || Date.parse(snapshot.expiresAt) > Date.now()) }
  }
  return out
}
