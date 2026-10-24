import type { MenuDomainItem, MenuSnapshot } from './types.ts'

/** Coverage of stored assertions, not proof of a complete recipe or safe kitchen. */
export function menuReadinessReport(snapshot: MenuSnapshot, source = 'unverified_export', now = Date.now()) {
  const fresh = snapshot.freshness !== 'stale' && Boolean(snapshot.expiresAt && Date.parse(snapshot.expiresAt) > now)
  const knownIds = new Set(snapshot.items.map(item => item.id))
  const hasServing = (item: MenuDomainItem) => Boolean(item.serving.unit && item.serving.peopleMin != null &&
    item.serving.peopleMax != null && item.serving.peopleMin > 0 && item.serving.peopleMax >= item.serving.peopleMin)
  const checks = {
    allergenAssertions: (item: MenuDomainItem) => ['seafood', 'peanuts'].every(key =>
      ['contains', 'absent'].includes(item.allergens.states[key as 'seafood' | 'peanuts'] ?? 'unknown')),
    currentKitchenVerification: (item: MenuDomainItem) => fresh && item.allergens.verified &&
      item.allergens.source === 'kitchen_audited' && Boolean(item.allergens.verifiedAt &&
        Number.isFinite(Date.parse(item.allergens.verifiedAt)) && Date.parse(item.allergens.verifiedAt) <= now),
    servingRange: hasServing,
    restaurantServing: (item: MenuDomainItem) => hasServing(item) && item.confidence === 'restaurant_defined',
    mealRole: (item: MenuDomainItem) => Boolean(item.serving.mealRole),
    taste: (item: MenuDomainItem) => item.sources.taste !== 'ai_draft' && item.sources.taste !== 'system_default' &&
      Boolean(item.taste.tags.length || item.taste.spiceLevel != null || item.taste.richnessLevel != null),
    pairing: (item: MenuDomainItem) => Boolean(item.pairingNote?.trim() || item.pairingItemIds.some(id => knownIds.has(id))),
  }
  const summarize = (items: MenuDomainItem[]) => Object.fromEntries(Object.entries(checks).map(([key, check]) => {
    const missing = items.filter(item => !check(item)).map(item => item.id)
    return [key, { denominator: items.length, present: items.length - missing.length, missing: missing.length,
      percentage: items.length ? Math.round((items.length - missing.length) / items.length * 1000) / 10 : null,
      missingIds: missing }]
  }))
  return {
    source, measuredAt: new Date(now).toISOString(), snapshotVersion: snapshot.version, loadedAt: snapshot.loadedAt,
    expiresAt: snapshot.expiresAt ?? null, freshness: fresh ? 'fresh' : 'stale_or_unproven',
    scope: 'Published items in supplied snapshot; allergen assertions are not a full ingredient inventory',
    possiblyTruncated: snapshot.items.length >= 2000,
    published: snapshot.items.length, available: snapshot.items.filter(item => item.isAvailable).length,
    unavailableIds: snapshot.items.filter(item => !item.isAvailable).map(item => item.id),
    missingProfileIds: snapshot.items.filter(item => item.provenance === 'menu:live_unprofiled').map(item => item.id),
    allPublished: summarize(snapshot.items), availableOnly: summarize(snapshot.items.filter(item => item.isAvailable)),
    merchandising: { source: 'menu_items', signatureIds: snapshot.items.filter(item => item.isSignature).map(item => item.id),
      bestsellerIds: snapshot.items.filter(item => item.isBestseller).map(item => item.id) },
    curation: snapshot.items.map(item => ({ itemId: item.id, available: item.isAvailable,
      missing: Object.entries(checks).filter(([, check]) => !check(item)).map(([key]) => key),
      invalidPairingIds: item.pairingItemIds.filter(id => !knownIds.has(id)), confidence: item.confidence,
      sources: item.sources, sourceUpdatedAt: item.sourceUpdatedAt ?? null, profileUpdatedAt: item.profileUpdatedAt ?? null,
      verifiedAt: item.allergens.verifiedAt })),
  }
}
