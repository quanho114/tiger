import type { MenuItemCatalogExtended } from '../../../supabase/functions/_shared/concierge/menu-retrieval.ts'
import type { MenuItemRow, MenuProfileRow } from '../../../supabase/functions/_shared/concierge/menu/mapper.ts'
import fixture from './a06-a08-evaluation.json'

export const evaluationCatalog: MenuItemCatalogExtended[] = fixture.menu.map((item, i) => ({
  id: `60000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  name: item.name, category_name: item.category,
  category_id: `61000000-0000-4000-8000-${String(['Cơm', 'Rau', 'Món phụ', 'Canh', 'Mì', 'Gà', 'Bò', 'Lẩu'].indexOf(item.category) + 1).padStart(12, '0')}`,
  price_vnd: item.price, tags: item.tags, is_signature: 'signature' in item && item.signature,
  is_available: true, published: true, pricing_mode: 'fixed',
}))
export const itemRow: MenuItemRow = {
  id: evaluationCatalog[0].id, category_id: null, category_name: 'Cơm', name: 'Cơm trắng', description: null,
  price_vnd: 20000, pricing_mode: 'fixed', price_min: null, price_max: null, is_available: true,
  allow_dine_in: true, allow_delivery: true, serving_size: null, pairing_note: null, spice_level: 0,
  tags: [], is_signature: false, is_bestseller: false,
}
export const profileRow: MenuProfileRow = {
  menu_item_id: itemRow.id, serving_unit: 'đĩa', serving_description: 'Một đĩa', people_min: 2, people_max: 4,
  meal_role: 'carb', meal_context: 'shared', protein_score: 0, carb_score: 1, vegetable_score: 0, soup_score: 0,
  spice_level: 0, richness_level: 0, taste_tags: ['nhẹ'], dietary_tags: [], pairing_item_ids: [],
  allergens: { seafood: 'absent', peanuts: 'absent' }, allergen_source: 'kitchen_audited', allergen_verified: true,
  allergen_verified_at: '2026-01-01T00:00:00.000Z', allergen_verified_by: 'synthetic-kitchen', kitchen_notes: 'Synthetic ingredient audit',
  confidence: 'restaurant_defined', provenance: 'synthetic-fixture', serving_source: 'restaurant_admin', taste_source: 'restaurant_admin',
}
export const databaseRow = () => ({ ...itemRow, ...profileRow, id: itemRow.id,
  profile_spice: 0, row_version: '2026-01-01T00:00:00.000Z', item_updated_at: '2026-01-01T00:00:00.000Z', profile_updated_at: '2026-01-01T00:00:00.000Z' })
