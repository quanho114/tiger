/**
 * Tiger Agent V3 — Phase 5.5: Taste/pairing profile writes.
 *
 * Taste tags are validated against the bounded taxonomy (unknown tags
 * rejected, never stored). Pairing IDs must be well-formed UUIDs;
 * nonexistent IDs are dropped gracefully at write. Writes audit +
 * invalidate the menu snapshot.
 */

import type pg from 'pg'
import { AppError } from '../../errors.ts'
import { normalizeTasteTags } from './taxonomy.ts'
import { invalidateMenuSnapshot } from './domain.ts'
import type { ProfileSource } from './types.ts'

export interface TasteUpdates {
  spice_level?: number | null
  richness_level?: number | null
  taste_tags?: unknown
  dietary_tags?: unknown
  pairing_item_ids?: unknown
}

export async function upsertTasteProfile(
  pool: pg.Pool,
  itemId: string,
  updates: TasteUpdates,
  actorId: string | null,
  source: ProfileSource = 'restaurant_admin',
): Promise<Record<string, unknown>> {
  if (!itemId || !/^[0-9a-fA-F-]{36}$/.test(itemId)) {
    throw new AppError('VALIDATION_ERROR', 'Mã món ăn không hợp lệ (yêu cầu UUID)', 422)
  }
  const menu = await pool.query('SELECT 1 FROM public.menu_items WHERE id = $1', [itemId])
  if (!menu.rows.length) throw new AppError('NOT_FOUND', `Không tìm thấy món ${itemId} trong thực đơn`, 404)

  const columns: Record<string, unknown> = {}
  let tasteTagsApplied: string[] = []
  let dietaryTagsApplied: string[] = []
  let pairingIdsApplied: string[] = []
  if (updates.spice_level !== undefined) {
    if (updates.spice_level !== null && (!Number.isInteger(updates.spice_level) || updates.spice_level < 0 || updates.spice_level > 2)) {
      throw new AppError('VALIDATION_ERROR', 'Mức cay phải từ 0 đến 2', 422)
    }
    columns.spice_level = updates.spice_level
  }
  if (updates.richness_level !== undefined) {
    if (updates.richness_level !== null && (!Number.isInteger(updates.richness_level) || updates.richness_level < 0 || updates.richness_level > 2)) {
      throw new AppError('VALIDATION_ERROR', 'Độ béo phải từ 0 đến 2', 422)
    }
    columns.richness_level = updates.richness_level
  }
  if (updates.taste_tags !== undefined) {
    const { tags, rejected } = normalizeTasteTags(updates.taste_tags)
    if (rejected.length) {
      throw new AppError('VALIDATION_ERROR', `Thẻ vị không hợp lệ: ${rejected.join(', ')}`, 422)
    }
    columns.taste_tags = JSON.stringify(tags)
    tasteTagsApplied = tags
  }
  if (updates.dietary_tags !== undefined) {
    if (!Array.isArray(updates.dietary_tags)) {
      throw new AppError('VALIDATION_ERROR', 'dietary_tags phải là mảng chuỗi', 422)
    }
    const cleaned = updates.dietary_tags
      .filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean).slice(0, 12)
    columns.dietary_tags = JSON.stringify(cleaned)
    dietaryTagsApplied = cleaned
  }
  if (updates.pairing_item_ids !== undefined) {
    if (!Array.isArray(updates.pairing_item_ids)) {
      throw new AppError('VALIDATION_ERROR', 'pairing_item_ids phải là mảng UUID', 422)
    }
    const wellFormed = updates.pairing_item_ids.filter(
      (v): v is string => typeof v === 'string' && /^[0-9a-fA-F-]{36}$/.test(v))
    if (wellFormed.length !== (updates.pairing_item_ids as unknown[]).length) {
      throw new AppError('VALIDATION_ERROR', 'pairing_item_ids chứa giá trị không phải UUID', 422)
    }
    // Graceful: drop IDs of unavailable items, keep the rest.
    const live = wellFormed.length
      ? (await pool.query('SELECT id FROM public.menu_items WHERE id = ANY($1)', [wellFormed])).rows.map((r) => String(r.id))
      : []
    columns.pairing_item_ids = JSON.stringify(live)
    pairingIdsApplied = live
  }
  if (!Object.keys(columns).length) {
    throw new AppError('VALIDATION_ERROR', 'Không có trường taste nào để cập nhật', 422)
  }

  const keys = Object.keys(columns)
  const jsonbKeys = new Set(['taste_tags', 'dietary_tags', 'pairing_item_ids'])
  const values = keys.map((k) => columns[k])
  const placeholders = keys.map((k, i) => (jsonbKeys.has(k) ? `$${i + 2}::jsonb` : `$${i + 2}`))
  await pool.query(
    `INSERT INTO public.menu_item_ai_profiles (menu_item_id, ${keys.join(', ')}, taste_source, updated_at)
     VALUES ($1, ${placeholders.join(', ')}, $${keys.length + 2}, now())
     ON CONFLICT (menu_item_id) DO UPDATE SET
       ${keys.map((k, i) => `${k} = $${i + 2}${jsonbKeys.has(k) ? '::jsonb' : ''}`).join(', ')},
       taste_source = $${keys.length + 2}, updated_at = now()`,
    [itemId, ...values, source]
  )
  await pool.query(
    `INSERT INTO public.audit_logs (admin_id, actor_kind, action, entity_type, entity_id, metadata)
     VALUES ($1, 'admin', 'update_taste_profile', 'taste_profile', $2, $3::jsonb)`,
    [actorId, itemId, JSON.stringify({ source, fields: keys })]
  )
  invalidateMenuSnapshot()
  const applied: Record<string, unknown> = { menu_item_id: itemId, taste_source: source }
  if ('spice_level' in columns) applied.spice_level = columns.spice_level
  if ('richness_level' in columns) applied.richness_level = columns.richness_level
  if ('taste_tags' in columns) applied.taste_tags = tasteTagsApplied
  if ('dietary_tags' in columns) applied.dietary_tags = dietaryTagsApplied
  if ('pairing_item_ids' in columns) applied.pairing_item_ids = pairingIdsApplied
  return applied
}
