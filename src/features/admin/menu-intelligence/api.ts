// Tiger Admin — Menu Intelligence HTTP transport (web-only).
import { adminApi } from '@/shared/lib/api/client'
import type { AdminMenuItem } from '../types'
import type {
  AcceptDraftResult,
  AiDraft,
  AllergenStatus,
  AllergenType,
  CoverageReport,
  MealRole,
  ProfileDetail,
} from './types'

export async function fetchCoverage(): Promise<CoverageReport> {
  const response = await adminApi.get<CoverageReport>('/concierge/knowledge/profiles/coverage')
  return response.data
}

export async function fetchMenuItems(): Promise<AdminMenuItem[]> {
  const response = await adminApi.get<{ items: AdminMenuItem[] } | AdminMenuItem[]>('/menu-items')
  const raw = response.data
  if (Array.isArray(raw)) return raw
  return raw.items ?? []
}

export async function fetchProfile(itemId: string): Promise<ProfileDetail> {
  const response = await adminApi.get<ProfileDetail>(
    `/concierge/knowledge/profiles/${encodeURIComponent(itemId)}`
  )
  return response.data
}

export interface ServingInput {
  serving_unit?: string
  serving_description?: string
  people_min?: number
  people_max?: number
  meal_role?: MealRole
  meal_context?: 'single_main' | 'shared' | 'side_pairing'
  contributions?: { protein: number; carb: number; vegetable: number; soup: number }
}

export async function saveServing(itemId: string, input: ServingInput): Promise<unknown> {
  const response = await adminApi.put(
    `/concierge/knowledge/serving-profiles/${encodeURIComponent(itemId)}`,
    input
  )
  return response.data
}

export interface TasteInput {
  spice_level?: number | null
  richness_level?: number | null
  taste_tags?: string[]
  dietary_tags?: string[]
  pairing_item_ids?: string[]
}

export async function saveTaste(itemId: string, input: TasteInput): Promise<unknown> {
  const response = await adminApi.put(
    `/concierge/knowledge/profiles/${encodeURIComponent(itemId)}/taste`,
    input
  )
  return response.data
}

export async function saveAllergens(
  itemId: string,
  allergens: Partial<Record<AllergenType, AllergenStatus>>,
  kitchenNotes?: string
): Promise<unknown> {
  const response = await adminApi.put(
    `/concierge/knowledge/allergens/${encodeURIComponent(itemId)}`,
    kitchenNotes !== undefined ? { allergens, kitchen_notes: kitchenNotes } : { allergens }
  )
  return response.data
}

export async function verifyAllergens(itemId: string, kitchenNotes: string): Promise<unknown> {
  const response = await adminApi.post(
    `/concierge/knowledge/allergens/${encodeURIComponent(itemId)}/verify`,
    { kitchen_notes: kitchenNotes }
  )
  return response.data
}

export async function generateDraft(itemId: string): Promise<AiDraft> {
  const response = await adminApi.post<AiDraft>(
    `/concierge/knowledge/profiles/${encodeURIComponent(itemId)}/drafts/generate`
  )
  return response.data
}

export async function listDrafts(itemId: string): Promise<AiDraft[]> {
  const response = await adminApi.get<AiDraft[]>(
    `/concierge/knowledge/profiles/${encodeURIComponent(itemId)}/drafts`
  )
  return response.data
}

export async function acceptDraft(
  draftId: string,
  only?: ('serving' | 'taste')[]
): Promise<AcceptDraftResult> {
  const response = await adminApi.post<AcceptDraftResult>(
    `/concierge/knowledge/drafts/${encodeURIComponent(draftId)}/accept`,
    only ? { only } : {}
  )
  return response.data
}

export async function rejectDraft(draftId: string): Promise<void> {
  await adminApi.post(`/concierge/knowledge/drafts/${encodeURIComponent(draftId)}/reject`, {})
}

/** Sections to accept. Both checked = accept all (undefined). Neither = invalid. */
export function buildAcceptOnly(
  wantServing: boolean,
  wantTaste: boolean
): ('serving' | 'taste')[] | undefined | null {
  if (wantServing && wantTaste) return undefined
  if (!wantServing && !wantTaste) return null
  return [...(wantServing ? ['serving' as const] : []), ...(wantTaste ? ['taste' as const] : [])]
}
