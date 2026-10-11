import { describe, expect, it } from 'vitest'
import { dishFilterOf } from '../../src/features/admin/menu-intelligence/useMenuIntelligence'
import { buildAcceptOnly } from '../../src/features/admin/menu-intelligence/api'
import { MEAL_ROLES, TASTE_TAGS } from '../../src/features/admin/menu-intelligence/types'

describe('menu intelligence curation (web-only)', () => {
  it('maps profile status to dish filters', () => {
    expect(dishFilterOf('EMPTY')).toBe('needs')
    expect(dishFilterOf('PARTIAL')).toBe('needs')
    expect(dishFilterOf('READY_FOR_RECOMMENDATION')).toBe('ready')
    expect(dishFilterOf('KITCHEN_VERIFIED')).toBe('verified')
    expect(dishFilterOf('UNKNOWN')).toBeNull()
  })

  it('builds accept-only sections without an allergen option', () => {
    expect(buildAcceptOnly(true, true)).toBeUndefined()
    expect(buildAcceptOnly(true, false)).toEqual(['serving'])
    expect(buildAcceptOnly(false, true)).toEqual(['taste'])
    expect(buildAcceptOnly(false, false)).toBeNull()
  })

  it('keeps admin vocabularies in sync with backend taxonomy', () => {
    // Mirror of supabase/functions/_shared/concierge/menu/taxonomy.ts
    // and the MealRole contract. Update both sides together.
    expect(TASTE_TAGS).toEqual([
      'spicy', 'smoky', 'savory', 'rich', 'light', 'fresh',
      'sour', 'sweet', 'herbal', 'crispy', 'bitter', 'fragrant',
      'hearty', 'tangy', 'creamy', 'nutty',
    ])
    expect(MEAL_ROLES.map((r) => r.value)).toEqual([
      'main_protein', 'carb', 'vegetable', 'soup_hotpot', 'side',
      'dessert', 'drink', 'alcohol', 'set',
    ])
  })
})
