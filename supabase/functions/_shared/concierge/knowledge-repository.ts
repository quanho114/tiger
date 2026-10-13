import type pg from 'pg'
import {
  seedKnowledgeSnapshot,
  type KnowledgeSnapshot,
} from './knowledge.ts'

type KnowledgeKind = 'config' | 'serving' | 'allergen' | 'document'
const MEAL_ROLES = new Set(['main_protein', 'carb', 'vegetable', 'soup_hotpot', 'side', 'dessert', 'drink', 'alcohol', 'set'])
const ALLERGEN_STATUSES = new Set(['contains', 'may_contain', 'absent', 'unknown'])
const positive = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export async function loadKnowledgeSnapshot(db: pg.Pool | pg.PoolClient): Promise<KnowledgeSnapshot> {
  const snapshot = seedKnowledgeSnapshot()
  const { rows } = await db.query('SELECT kind, key, payload FROM public.concierge_knowledge')
  for (const row of rows) {
    const payload: unknown = row.payload
    if (!object(payload)) throw new Error('INVALID_KNOWLEDGE')
    if (row.kind === 'config' && row.key === 'global') {
      if (!positive(payload.version) || !positive(payload.adult_factor) || !positive(payload.child_factor) ||
          !object(payload.appetite_factors) || !['light', 'normal', 'heavy'].every(key => positive((payload.appetite_factors as Record<string, unknown>)[key])))
        throw new Error('INVALID_KNOWLEDGE')
      snapshot.config = payload as unknown as KnowledgeSnapshot['config']
    } else if (row.kind === 'serving') {
      if (payload.item_id !== row.key || !positive(payload.people_min) || !positive(payload.people_max) ||
          (payload.people_min as number) > (payload.people_max as number) || !MEAL_ROLES.has(String(payload.meal_role)) ||
          !['restaurant_defined', 'estimated', 'unknown'].includes(String(payload.confidence)))
        throw new Error('INVALID_KNOWLEDGE')
      snapshot.servingProfiles[row.key] = payload as unknown as KnowledgeSnapshot['servingProfiles'][string]
    } else if (row.kind === 'allergen') {
      if (payload.item_id !== row.key || typeof payload.verified_by_kitchen !== 'boolean' || !object(payload.allergens) ||
          !Object.values(payload.allergens).every(status => ALLERGEN_STATUSES.has(String(status))) ||
          (payload.verified_by_kitchen && (payload.source !== 'kitchen_audited' ||
            typeof payload.kitchen_notes !== 'string' || !payload.kitchen_notes.trim())))
        throw new Error('INVALID_KNOWLEDGE')
      snapshot.allergenProfiles[row.key] = payload as unknown as KnowledgeSnapshot['allergenProfiles'][string]
    } else if (row.kind === 'document') {
      if (payload.id !== row.key || typeof payload.content !== 'string' || typeof payload.title !== 'string' ||
          !['draft', 'published', 'retired'].includes(String(payload.status))) throw new Error('INVALID_KNOWLEDGE')
      const index = snapshot.documents.findIndex(doc => doc.id === row.key)
      if (index < 0) snapshot.documents.push(payload as unknown as KnowledgeSnapshot['documents'][number])
      else snapshot.documents[index] = payload as unknown as KnowledgeSnapshot['documents'][number]
    } else {
      throw new Error('INVALID_KNOWLEDGE')
    }
  }
  return snapshot
}

export async function persistKnowledgeMutation<T extends object>(pool: pg.Pool, input: {
  kind: KnowledgeKind
  key?: string
  action: string
  entityType: string
  actorId: string | null
  mutate: (snapshot: KnowledgeSnapshot) => T
  metadata: (value: T) => Record<string, unknown>
}): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`concierge_knowledge:${input.kind}:${input.key ?? '*'}`])
    const snapshot = await loadKnowledgeSnapshot(client)
    const value = input.mutate(snapshot)
    const key = input.key ?? String((value as { id?: unknown }).id)
    if (!key || key === 'undefined') throw new Error('INVALID_KNOWLEDGE_KEY')
    await client.query(`INSERT INTO public.concierge_knowledge (kind, key, payload) VALUES ($1, $2, $3::jsonb)
      ON CONFLICT (kind, key) DO UPDATE SET payload = EXCLUDED.payload,
      version = concierge_knowledge.version + 1, updated_at = now()`, [input.kind, key, JSON.stringify(value)])
    await client.query(`INSERT INTO public.audit_logs (admin_id, actor_kind, action, entity_type, entity_id, metadata)
      VALUES ($1, 'admin', $2, $3, $4, $5::jsonb)`, [input.actorId, input.action, input.entityType, key, JSON.stringify(input.metadata(value))])
    await client.query('COMMIT')
    return value
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}
