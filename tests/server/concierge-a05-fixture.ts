import type pg from 'pg'
import type { ConciergeV2MemoryFact, ConciergeV2SessionRecord } from '../../supabase/functions/_shared/contracts/concierge-v2.ts'
import { fixturePool } from './concierge-a03-a05-fixture.ts'

export const userId = '11111111-1111-4111-8111-111111111111'
export function memoryFact(overrides: Partial<ConciergeV2MemoryFact> = {}): ConciergeV2MemoryFact {
  return { id: crypto.randomUUID(), memory_type: 'preference', memory_key: 'bi-do', value: { food: 'Bí đỏ' },
    source: 'explicit', confidence: 90, schema_version: 1, observed_at: new Date(Date.now() - 1000).toISOString(),
    expires_at: null, updated_at: new Date().toISOString(), ...overrides }
}

/** Synthetic SQL boundary with a controllable cross-client advisory-lock queue.
 * Exercises the real repositories/runtime/adapters; does not replace PG integration.
 */
export function memoryFixture(initial = [memoryFact()]) {
  const settings = { enabled: true, consent_version: 1, memory_epoch: 1, updated_at: new Date().toISOString() }
  let facts = [...initial]
  const records = new Map<string, ConciergeV2SessionRecord>()
  const suppressed = new Set<string>()
  const events: string[] = []
  const locks = new Map<unknown, { queue: Promise<void>; occupied: boolean; waiting: number }>()
  const fixture = fixturePool((sql, values = []) => {
    if (sql.includes('concierge_v2_memory_settings_dto')) return { rows: [{ result: { ...settings } }] }
    if (sql.includes('FROM public.user_ai_memories')) return { rows: facts.map(fact => ({ fact: structuredClone(fact) })) }
    if (sql.includes('concierge_v2_set_memory_enabled')) {
      settings.enabled = Boolean(values[1]); if (!settings.enabled) settings.memory_epoch++
      events.push('settings'); return { rows: [{ result: { ok: true, settings: { ...settings } } }] }
    }
    if (sql.includes('concierge_v2_forget_all_memory')) {
      facts = []; suppressed.clear(); settings.enabled = false; settings.memory_epoch++
      events.push('forget'); return { rows: [{ result: { ok: true, settings: { ...settings } } }] }
    }
    if (sql.includes('concierge_v2_delete_memory_fact_fenced')) {
      if (values[4] != null && values[4] !== settings.memory_epoch) return { rows: [{ result: { ok: false, reason: 'MEMORY_EPOCH_MISMATCH' } }] }
      const old = facts.length
      facts = facts.filter(fact => fact.memory_type !== values[1] || fact.memory_key !== values[2] || fact.source !== values[3])
      if (values[3] === 'order_history') suppressed.add(String(values[2]))
      settings.memory_epoch++; events.push('delete')
      return { rows: [{ result: { ok: true, deleted: old !== facts.length } }] }
    }
    if (sql.includes('concierge_v2_restore_behavioral_memory_fact')) {
      const restored = suppressed.delete(String(values[2]))
      return { rows: [{ result: { ok: true, restored } }] }
    }
    if (sql.includes('concierge_v2_write_memory_fact')) {
      if (!settings.enabled) return { rows: [{ result: { ok: false, reason: 'MEMORY_DISABLED' } }] }
      if (settings.memory_epoch !== values[1]) return { rows: [{ result: { ok: false, reason: 'MEMORY_EPOCH_MISMATCH' } }] }
      if (values[5] === 'order_history' && suppressed.has(String(values[3]))) return { rows: [{ result: { ok: false, reason: 'MEMORY_SUPPRESSED' } }] }
      const fact = memoryFact({ memory_type: values[2] as ConciergeV2MemoryFact['memory_type'], memory_key: String(values[3]),
        value: JSON.parse(String(values[4])), source: values[5] as ConciergeV2MemoryFact['source'], confidence: Number(values[6]),
        observed_at: String(values[7]), expires_at: values[8] == null ? null : String(values[8]) })
      facts = facts.filter(old => old.memory_type !== fact.memory_type || old.memory_key !== fact.memory_key || old.source !== fact.source)
      facts.push(fact); events.push('write')
      return { rows: [{ result: { ok: true, fact } }] }
    }
    if (sql.includes('AS total_orders')) return { rows: [{ total_orders: 0 }] }
    if (sql.includes('pg_try_advisory_xact_lock')) return { rows: [{ acquired: true }] }
    if (sql.includes('INSERT INTO public.concierge_v2_sessions')) {
      const record = JSON.parse(String(values[2])); records.set(String(values[0]), record)
      return { rows: [], rowCount: 1 }
    }
    if (sql.includes('FROM public.concierge_v2_sessions WHERE user_id')) return { rows: [...records.values()]
      .filter(record => record.actor.authenticated_user_id === values[0]).map(record => ({ session_id: record.session_id, record: JSON.stringify(record) })) }
    if (sql.includes('SELECT record FROM public.concierge_v2_sessions')) {
      const record = records.get(String(values[0])); return { rows: record ? [{ record: JSON.stringify(record) }] : [] }
    }
    if (sql.includes('UPDATE public.concierge_v2_sessions SET record')) {
      records.set(String(values[0]), JSON.parse(String(values[1]))); return { rows: [], rowCount: 1 }
    }
    if (sql.includes('DELETE FROM public.concierge_v2_sessions')) { records.delete(String(values[0])); return { rows: [], rowCount: 1 } }
    return undefined
  })
  const pool = { query: fixture.query, connect: async () => {
    let release: (() => void) | undefined
    return { release: () => release?.(), query: async (sql: string, values?: unknown[]) => {
      if (sql.includes('pg_advisory_xact_lock(') || sql.includes('pg_try_advisory_xact_lock(')) {
        const key = values?.[0]
        const lock = locks.get(key) ?? { queue: Promise.resolve(), occupied: false, waiting: 0 }
        locks.set(key, lock)
        const tryOnly = sql.includes('pg_try_')
        if (tryOnly && (lock.occupied || lock.waiting)) return { rows: [{ acquired: false }] }
        const previous = lock.queue
        lock.waiting++
        lock.queue = new Promise<void>(resolve => { release = () => { lock.occupied = false; resolve() } })
        await previous; lock.waiting--; lock.occupied = true; events.push('lock')
        return { rows: [{ acquired: true }] }
      }
      if (sql === 'COMMIT' || sql === 'ROLLBACK') { events.push(sql); release?.(); release = undefined }
      return fixture.query(sql, values)
    } }
  } } as unknown as pg.Pool
  return { pool, query: fixture.query, settings, records, suppressed, events, facts: () => facts }
}
