/**
 * Tiger Agent V3 — Phase 5.5: Admin-only AI profile drafting.
 *
 * An LLM may SUGGEST serving/taste metadata for a live menu item.
 * Suggestions persist as pending drafts, never as authority. Allergen
 * safety data is NEVER auto-approved: possible allergens are flagged
 * for human review only, and draft acceptance cannot set verified state.
 *
 * This module is admin-only. Nothing here is reachable from the
 * customer-facing Tool Gateway (see isolation tests).
 */

import type pg from 'pg'
import { z } from 'zod'
import { AppError } from '../../errors.ts'
import { createTurnOrchestrator } from '../llm-config.ts'
import type { ConciergeLlmOrchestrator } from '../llm.ts'
import { normalizeTasteTags, TASTE_TAGS } from './taxonomy.ts'
import type { MealRole } from '../types.ts'
import { upsertServingProfile } from './profile-repository.ts'
import { upsertTasteProfile } from './taste-repository.ts'
import { getMenuSnapshot } from './domain.ts'
import { normalizeIntent } from '../draft-intent.ts'

const MEAL_ROLES: MealRole[] = ['main_protein', 'carb', 'vegetable', 'soup_hotpot', 'side', 'dessert', 'drink', 'alcohol', 'set']

export const AiProfileDraftSchema = z.object({
  meal_role: z.enum(MEAL_ROLES as [MealRole, ...MealRole[]]).nullable().optional(),
  serving_unit: z.string().max(20).nullable().optional(),
  people_min: z.number().int().min(1).max(30).nullable().optional(),
  people_max: z.number().int().min(1).max(30).nullable().optional(),
  spice_level: z.number().int().min(0).max(2).nullable().optional(),
  richness_level: z.number().int().min(0).max(2).nullable().optional(),
  taste_tags: z.array(z.string().max(40)).max(12).default([]),
  dietary_hints: z.array(z.string().max(40)).max(12).default([]),
  pairing_names: z.array(z.string().max(120)).max(8).default([]),
  contribution: z.object({
    protein: z.number().min(0).max(1.5).nullable().optional(),
    carb: z.number().min(0).max(1.5).nullable().optional(),
    vegetable: z.number().min(0).max(1.5).nullable().optional(),
    soup: z.number().min(0).max(1.5).nullable().optional(),
  }).default({}),
  /** Candidates for HUMAN review. Never authoritative, never verified. */
  possible_allergens_for_review: z.array(z.string().max(40)).max(12).default([]),
}).strict()

export type AiProfileDraft = z.infer<typeof AiProfileDraftSchema>

/** Stored payloads may carry review notes (e.g. rejected tags); strip on read. */
const StoredDraftSchema = AiProfileDraftSchema.extend({
  rejected_taste_tags: z.array(z.string()).optional(),
}).strip()

export interface DraftRecord {
  id: string
  menu_item_id: string
  payload: AiProfileDraft
  provider: string | null
  model: string | null
  created_by: string | null
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string
}

function extractJson(text: string): unknown {
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  const raw = (fence ? fence[1] : text).trim()
  return JSON.parse(raw)
}

export async function generateProfileDraft(
  pool: pg.Pool,
  menuItemId: string,
  createdBy: string | null,
  injectedLlm?: ConciergeLlmOrchestrator,
): Promise<DraftRecord> {
  const { rows } = await pool.query(
    `SELECT m.id, m.name, m.description, c.name AS category_name, m.tags, m.price_vnd, m.spice_level
     FROM public.menu_items m LEFT JOIN public.categories c ON c.id = m.category_id
     WHERE m.id = $1`,
    [menuItemId]
  )
  const item = rows[0]
  if (!item) throw new AppError('NOT_FOUND', `Không tìm thấy món ${menuItemId} trong thực đơn`, 404)

  const orchestrator = injectedLlm ?? await createTurnOrchestrator(pool)
  const prompt = [
    'You draft structured menu metadata for a Vietnamese restaurant admin. Respond with JSON ONLY, no prose.',
    `Dish: ${item.name}`,
    `Description: ${item.description ?? '(none)'}`,
    `Category: ${item.category_name ?? '(none)'}`,
    `Menu tags: ${JSON.stringify(item.tags ?? [])}`,
    `Price (VND): ${item.price_vnd}`,
    `Known spice_level (0-2, may be null): ${item.spice_level ?? 'null'}`,
    `Allowed meal_role: ${MEAL_ROLES.join(', ')}`,
    `Allowed taste_tags: ${TASTE_TAGS.join(', ')} (use only these; unknown labels are rejected)`,
    'Rules: people_min<=people_max; scores 0..1.5; pairing_names are exact dish names from this restaurant menu;',
    'possible_allergens_for_review lists ingredient/allergen names a human must verify — never claim safety;',
    'never output verified_safe, never output allergen facts as certain. Null when unsure.',
  ].join('\n')
  let parsed: AiProfileDraft
  try {
    const response = await orchestrator.orchestrateTurn(prompt, [], {})
    parsed = AiProfileDraftSchema.parse(extractJson(response.reply_text))
  } catch (error) {
    if (error instanceof AppError) throw error
    throw new AppError('AI_DRAFT_INVALID', 'Mô hình không trả về gợi ý hợp lệ. Vui lòng thử lại.', 502)
  }
  const { tags, rejected } = normalizeTasteTags(parsed.taste_tags)
  const payload: AiProfileDraft = { ...parsed, taste_tags: tags }
  const config = await pool.query('SELECT provider, model FROM public.concierge_llm_config WHERE id = 1')
  const inserted = await pool.query(
    `INSERT INTO public.menu_item_ai_profile_drafts
       (menu_item_id, payload, provider, model, created_by, status)
     VALUES ($1, $2::jsonb, $3, $4, $5, 'pending') RETURNING id, created_at`,
    [menuItemId, JSON.stringify({ ...payload, rejected_taste_tags: rejected }), config.rows[0]?.provider ?? null,
      config.rows[0]?.model ?? null, createdBy]
  )
  return {
    id: String(inserted.rows[0].id),
    menu_item_id: menuItemId,
    payload,
    provider: config.rows[0]?.provider ?? null,
    model: config.rows[0]?.model ?? null,
    created_by: createdBy,
    status: 'pending',
    created_at: new Date(inserted.rows[0].created_at).toISOString(),
  }
}

export async function listProfileDrafts(pool: pg.Pool, menuItemId: string): Promise<DraftRecord[]> {
  const { rows } = await pool.query(
    `SELECT id, menu_item_id, payload, provider, model, created_by, status, created_at
     FROM public.menu_item_ai_profile_drafts WHERE menu_item_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [menuItemId]
  )
  return rows.map((row) => ({
    id: String(row.id),
    menu_item_id: String(row.menu_item_id),
    payload: StoredDraftSchema.parse(row.payload),
    provider: row.provider ?? null,
    model: row.model ?? null,
    created_by: row.created_by ?? null,
    status: row.status,
    created_at: new Date(row.created_at).toISOString(),
  }))
}

/** Resolve pairing names to live menu IDs (exact normalized match only). */
export function resolvePairingNames(names: string[], snapshot: { items: { id: string; name: string }[] }): { ids: string[]; dropped: string[] } {
  const ids: string[] = []
  const dropped: string[] = []
  for (const name of names) {
    const matches = snapshot.items.filter((item) => normalizeIntent(item.name) === normalizeIntent(name))
    if (matches.length === 1) ids.push(matches[0].id)
    else dropped.push(name)
  }
  return { ids, dropped }
}

export interface AcceptDraftResult {
  appliedServing: boolean
  appliedTaste: boolean
  droppedPairings: string[]
  rejectedTasteTags: string[]
  allergenCandidatesNoted: string[]
}

/**
 * Field-aware acceptance. Applies SAFE serving/taste fields with source
 * 'ai_draft'. Allergen candidates are recorded in audit metadata ONLY —
 * acceptance can never verify allergen safety.
 */
export async function acceptProfileDraft(
  pool: pg.Pool,
  draftId: string,
  decidedBy: string | null,
  only?: ('serving' | 'taste')[],
): Promise<AcceptDraftResult> {
  const { rows } = await pool.query(
    'SELECT id, menu_item_id, payload FROM public.menu_item_ai_profile_drafts WHERE id = $1',
    [draftId]
  )
  const draft = rows[0]
  if (!draft) throw new AppError('NOT_FOUND', 'Không tìm thấy bản nháp', 404)
  if (draft.status !== 'pending') throw new AppError('INVALID_DRAFT_STATE', 'Bản nháp đã được xử lý', 409)
  const payload = AiProfileDraftSchema.parse(draft.payload)
  const menuItemId = String(draft.menu_item_id)

  const wantServing = !only || only.includes('serving')
  const wantTaste = !only || only.includes('taste')
  let appliedServing = false
  const servingUpdates: Record<string, unknown> = {}
  if (payload.meal_role) servingUpdates.meal_role = payload.meal_role
  if (payload.serving_unit) servingUpdates.serving_unit = payload.serving_unit
  if (payload.people_min != null) servingUpdates.people_min = payload.people_min
  if (payload.people_max != null) servingUpdates.people_max = payload.people_max
  if (payload.contribution && Object.keys(payload.contribution).length) {
    servingUpdates.contributions = {
      protein: payload.contribution.protein ?? 0.5,
      carb: payload.contribution.carb ?? 0.5,
      vegetable: payload.contribution.vegetable ?? 0.2,
      soup: payload.contribution.soup ?? 0,
    }
  }
  if (Object.keys(servingUpdates).length && wantServing) {
    await upsertServingProfile(pool, menuItemId, servingUpdates as never, decidedBy, 'ai_draft')
    appliedServing = true
  }

  let appliedTaste = false
  let droppedPairings: string[] = []
  let rejectedTasteTags: string[] = []
  const tasteUpdates: Record<string, unknown> = {}
  if (payload.spice_level != null) tasteUpdates.spice_level = payload.spice_level
  if (payload.richness_level != null) tasteUpdates.richness_level = payload.richness_level
  if (payload.taste_tags.length || payload.dietary_hints.length || payload.pairing_names.length) {
    const normalized = normalizeTasteTags(payload.taste_tags)
    rejectedTasteTags = normalized.rejected
    tasteUpdates.taste_tags = normalized.tags
    tasteUpdates.dietary_tags = payload.dietary_hints.map((hint) => hint.trim()).filter(Boolean).slice(0, 12)
    if (payload.pairing_names.length) {
      const snapshot = await getMenuSnapshot(pool)
      const resolved = resolvePairingNames(payload.pairing_names, snapshot)
      tasteUpdates.pairing_item_ids = resolved.ids
      droppedPairings = resolved.dropped
    }
  }
  if (Object.keys(tasteUpdates).length && wantTaste) {
    await upsertTasteProfile(pool, menuItemId, tasteUpdates as never, decidedBy, 'ai_draft')
    appliedTaste = true
  }

  const allergenCandidatesNoted = payload.possible_allergens_for_review
  await pool.query(
    `INSERT INTO public.audit_logs (admin_id, actor_kind, action, entity_type, entity_id, metadata)
     VALUES ($1, 'admin', 'accept_ai_profile_draft', 'menu_profile_draft', $2, $3::jsonb)`,
    [decidedBy, draftId, JSON.stringify({
      menu_item_id: menuItemId, appliedServing, appliedTaste,
      only: only ?? ['serving', 'taste'],
      droppedPairings, rejectedTasteTags, allergenCandidatesNoted,
      note: 'Allergen candidates require separate kitchen verification; draft acceptance never verifies safety.',
    })]
  )
  await pool.query(
    `UPDATE public.menu_item_ai_profile_drafts SET status = 'accepted', decided_at = now(), decided_by = $2 WHERE id = $1`,
    [draftId, decidedBy]
  )
  return { appliedServing, appliedTaste, droppedPairings, rejectedTasteTags, allergenCandidatesNoted }
}

export async function rejectProfileDraft(
  pool: pg.Pool,
  draftId: string,
  decidedBy: string | null,
): Promise<void> {
  const { rows } = await pool.query(
    `UPDATE public.menu_item_ai_profile_drafts SET status = 'rejected', decided_at = now(), decided_by = $2
     WHERE id = $1 AND status = 'pending' RETURNING id`,
    [draftId, decidedBy]
  )
  if (!rows.length) throw new AppError('INVALID_DRAFT_STATE', 'Bản nháp không tồn tại hoặc đã được xử lý', 409)
  await pool.query(
    `INSERT INTO public.audit_logs (admin_id, actor_kind, action, entity_type, entity_id, metadata)
     VALUES ($1, 'admin', 'reject_ai_profile_draft', 'menu_profile_draft', $2, '{}'::jsonb)`,
    [decidedBy, draftId]
  )
}
