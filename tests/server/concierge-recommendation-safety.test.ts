/**
 * Tiger 345 - Concierge Recommendation & Safety Validator Test Suite (C04)
 * Covers:
 * - AT09: Party ambiguities, appetite scaling, role-based portion coverage, surplus detection, hard/soft budget integrity, infeasible plan detection
 * - AT10: Allergen guardrails (contains, may_contain, unknown, missing/unprofiled), server-side action eligibility, candidate modification
 */

import { describe, it, expect } from 'vitest'
import {
  computeEquivalentAdults,
  calculateServingCoverage,
  validateMealCandidate,
  type MenuItemCatalogRecord,
} from '../../supabase/functions/_shared/concierge/validator.js'
import {
  parsePartyConstraints,
  checkFeasibility,
  modifyProposalItems,
  buildMealProposals,
} from '../../supabase/functions/_shared/concierge/recommendation.js'
import {
  ALLERGEN_PROFILES,
  SERVING_PROFILES,
  RECOMMENDATION_CONFIG,
} from '../../supabase/functions/_shared/concierge/knowledge.js'
import type {
  CandidateItem,
  CustomerConstraints,
  MealProposal,
} from '../../supabase/functions/_shared/concierge/types.js'

describe('C04: Recommendation and Safety Validator (AT09 & AT10)', () => {
  const mockCatalog: MenuItemCatalogRecord[] = [
    {
      id: '10000000-0000-0000-0000-000000000001',
      name: 'Sườn heo nướng mật ong Tây Bắc',
      price_vnd: 185000,
      is_available: true,
    },
    {
      id: '10000000-0000-0000-0000-000000000002',
      name: 'Gỏi cuốn tôm thịt hữu cơ',
      price_vnd: 85000,
      is_available: true,
    },
    {
      id: '10000000-0000-0000-0000-000000000003',
      name: 'Cá hồi áp chảo sốt chanh leo',
      price_vnd: 220000,
      is_available: true,
    },
    {
      id: '10000000-0000-0000-0000-000000000004',
      name: 'Lẩu nấm hoàng cung chim câu',
      price_vnd: 380000,
      is_available: true,
    },
    {
      id: '10000000-0000-0000-0000-000000000005',
      name: 'Phở bò Wagyu thố đá',
      price_vnd: 145000,
      is_available: true,
    },
    {
      id: '10000000-0000-0000-0000-000000000006',
      name: 'Bò nướng lá lốt than hoa',
      price_vnd: 165000,
      is_available: true,
    },
    {
      id: '10000000-0000-0000-0000-000000000007',
      name: 'Bánh xèo tép nhảy miền Tây',
      price_vnd: 110000,
      is_available: true,
    },
    {
      id: '10000000-0000-0000-0000-000000000008',
      name: 'Cơm niêu cháy giòn kho quẹt tóp mỡ',
      price_vnd: 95000,
      is_available: true,
    },
    {
      id: '10000000-0000-0000-0000-000000000009',
      name: 'Mâm tiệc sum vầy 5 món',
      price_vnd: 680000,
      is_available: true,
    },
    {
      id: '10000000-0000-0000-0000-000000000010',
      name: 'Trà đào cam sả hạt chia',
      price_vnd: 42000,
      is_available: true,
    },
  ]

  describe('AT09: Portion Math, Party Size Ambiguities & Appetite Scaling', () => {
    it('disambiguates "7 người gồm 2 trẻ" as 5 adults + 2 children', () => {
      const parsed = parsePartyConstraints('Bàn mình 7 người gồm 2 trẻ em')
      expect(parsed.constraints.adults).toBe(5)
      expect(parsed.constraints.children).toBe(2)
      expect(parsed.needsClarification).toBe(false)
    })

    it('disambiguates "7 người lớn và 2 trẻ" as 7 adults + 2 children', () => {
      const parsed = parsePartyConstraints('Bàn mình 7 người lớn và 2 trẻ em')
      expect(parsed.constraints.adults).toBe(7)
      expect(parsed.constraints.children).toBe(2)
      expect(parsed.needsClarification).toBe(false)
    })

    it('flags clarification when guest count is missing', () => {
      const parsed = parsePartyConstraints('Cho tôi xem thực đơn tối nay')
      expect(parsed.constraints.adults).toBe(0)
      expect(parsed.constraints.children).toBe(0)
      expect(parsed.needsClarification).toBe(true)
      expect(parsed.clarificationQuestion).toBeDefined()
    })

    it('calculates equivalent adults correctly based on appetite factors and config', () => {
      // adults: 2, children: 1. Base = 2*1.0 + 1*0.6 = 2.6
      const lightEq = computeEquivalentAdults(2, 1, 'light')
      expect(lightEq).toBe(Number((2.6 * 0.85).toFixed(2))) // 2.21

      const normalEq = computeEquivalentAdults(2, 1, 'normal')
      expect(normalEq).toBe(2.6)

      const heavyEq = computeEquivalentAdults(2, 1, 'heavy')
      expect(heavyEq).toBe(Number((2.6 * 1.2).toFixed(2))) // 3.12
    })

    it('role-based scaling: side dishes and drinks do not falsely count as full main protein servings', () => {
      const constraints: CustomerConstraints = {
        adults: 4,
        children: 0,
        appetite: 'normal',
        is_hard_budget: false,
        preferences: [],
        dislikes: [],
        allergies: [],
      }

      // Customer only orders side dishes (gỏi cuốn) and drinks (trà đào)
      const nonMainItems: CandidateItem[] = [
        {
          menu_item_id: '10000000-0000-0000-0000-000000000002', // Gỏi cuốn (side)
          quantity: 2,
        },
        {
          menu_item_id: '10000000-0000-0000-0000-000000000010', // Trà đào (drink)
          quantity: 4,
        },
      ]

      const coverage = calculateServingCoverage(nonMainItems, constraints)
      expect(coverage.is_sufficient).toBe(false)
      expect(coverage.protein_coverage_ratio).toBeLessThan(0.6)
      expect(coverage.gaps).toContain('Thiếu món đạm chính (Protein)')
    })

    it('detects extreme surplus: flags 100 hotpots for 2 people with WARNING and explanation', () => {
      const constraints: CustomerConstraints = {
        adults: 2,
        children: 0,
        appetite: 'normal',
        is_hard_budget: false,
        preferences: [],
        dislikes: [],
        allergies: [],
      }

      const excessiveItems: CandidateItem[] = [
        {
          menu_item_id: '10000000-0000-0000-0000-000000000004', // Lẩu nấm (soup_hotpot)
          quantity: 100,
        },
      ]

      const coverage = calculateServingCoverage(excessiveItems, constraints)
      expect(coverage.surplus_detected).toBe(true)

      const validation = validateMealCandidate(excessiveItems, constraints, mockCatalog)
      expect(validation.status).toBe('WARNING')
      expect(validation.warnings.some((w) => w.includes('quá nhiều') || w.includes('lãng phí'))).toBe(true)
      const servingCheck = validation.checks.find((c) => c.name === 'check_serving_coverage')
      expect(servingCheck?.status).toBe('WARNING')
    })
  })

  describe('AT09: Hard & Soft Budget Integrity', () => {
    it('hard budget: strictly returns BLOCKED when subtotal exceeds budget by even 1 VND', () => {
      const constraints: CustomerConstraints = {
        adults: 2,
        children: 0,
        appetite: 'normal',
        budget_vnd: 200000,
        is_hard_budget: true,
        preferences: [],
        dislikes: [],
        allergies: [],
      }

      // Total: 220,000 VND > 200,000 VND
      const candidate: CandidateItem[] = [
        {
          menu_item_id: '10000000-0000-0000-0000-000000000003', // Cá hồi: 220k
          quantity: 1,
        },
      ]

      const validation = validateMealCandidate(candidate, constraints, mockCatalog)
      expect(validation.status).toBe('BLOCKED')
      expect(validation.action_eligible).toBe(false)
      const budgetCheck = validation.checks.find((c) => c.name === 'check_budget')
      expect(budgetCheck?.status).toBe('BLOCKED')
      expect(budgetCheck?.message).toContain('vượt quá ngân sách cố định')
    })

    it('soft budget: allows up to +5% tolerance with WARNING, but BLOCKS beyond 5%', () => {
      const constraints: CustomerConstraints = {
        adults: 2,
        children: 0,
        appetite: 'normal',
        budget_vnd: 215000,
        is_hard_budget: false, // Soft budget: max allowed = 215000 * 1.05 = 225,750
        preferences: [],
        dislikes: [],
        allergies: [],
      }

      // Case A: 220,000 VND (within 225,750 VND tolerance) -> WARNING
      const candidateA: CandidateItem[] = [
        {
          menu_item_id: '10000000-0000-0000-0000-000000000003', // Cá hồi: 220k
          quantity: 1,
        },
      ]
      const validationA = validateMealCandidate(candidateA, constraints, mockCatalog)
      const budgetCheckA = validationA.checks.find((c) => c.name === 'check_budget')
      expect(budgetCheckA?.status).toBe('WARNING')
      expect(budgetCheckA?.message).toContain('vượt nhẹ ngân sách dự kiến')

      // Case B: 230,000 VND (> 225,750 VND tolerance) -> BLOCKED
      const constraintsTight: CustomerConstraints = {
        ...constraints,
        budget_vnd: 200000, // max allowed = 210,000 VND
      }
      const validationB = validateMealCandidate(candidateA, constraintsTight, mockCatalog)
      expect(validationB.status).toBe('BLOCKED')
      expect(validationB.action_eligible).toBe(false)
      const budgetCheckB = validationB.checks.find((c) => c.name === 'check_budget')
      expect(budgetCheckB?.status).toBe('BLOCKED')
      expect(budgetCheckB?.message).toContain('vượt quá biên độ ngân sách cho phép')
    })

    it('infeasible plan: detects budget lower than cheapest item and reports honestly without fabricating', () => {
      const constraints: CustomerConstraints = {
        adults: 2,
        children: 0,
        appetite: 'normal',
        budget_vnd: 30000, // Cheapest dish is Trà đào (42k)
        is_hard_budget: true,
        preferences: [],
        dislikes: [],
        allergies: [],
      }

      const feasibility = checkFeasibility(constraints, mockCatalog)
      expect(feasibility.feasible).toBe(false)
      expect(feasibility.reason).toContain('không đủ để chọn món tối thiểu')

      const proposals = buildMealProposals(constraints, mockCatalog)
      expect(proposals).toHaveLength(0) // No fabricated items
    })

    it('infeasible plan: returns empty proposals when catalog has no available items', () => {
      const emptyCatalog: MenuItemCatalogRecord[] = []
      const constraints: CustomerConstraints = {
        adults: 2,
        children: 0,
        appetite: 'normal',
        is_hard_budget: false,
        preferences: [],
        dislikes: [],
        allergies: [],
      }

      const feasibility = checkFeasibility(constraints, emptyCatalog)
      expect(feasibility.feasible).toBe(false)
      expect(feasibility.reason).toContain('chưa có món ăn nào khả dụng')

      const proposals = buildMealProposals(constraints, emptyCatalog)
      expect(proposals).toHaveLength(0)
    })
  })

  describe('AT10: Allergen Guardrails & Action Eligibility', () => {
    it('allergen contains: returns BLOCKED and action_eligible = false', () => {
      const constraints: CustomerConstraints = {
        adults: 2,
        children: 0,
        appetite: 'normal',
        is_hard_budget: false,
        preferences: [],
        dislikes: [],
        allergies: ['peanuts'],
      }

      // Gỏi cuốn contains peanuts
      const candidate: CandidateItem[] = [
        {
          menu_item_id: '10000000-0000-0000-0000-000000000002',
          quantity: 1,
        },
      ]

      const validation = validateMealCandidate(candidate, constraints, mockCatalog)
      expect(validation.status).toBe('BLOCKED')
      expect(validation.action_eligible).toBe(false)
      const allergenCheck = validation.checks.find((c) => c.name.startsWith('allergen_peanuts'))
      expect(allergenCheck?.status).toBe('BLOCKED')
      expect(allergenCheck?.message).toContain('có chứa dị nguyên')
    })

    it('allergen may_contain: returns WARNING, explains cross-contact, and blocks automatic action (action_eligible = false)', () => {
      const constraints: CustomerConstraints = {
        adults: 2,
        children: 0,
        appetite: 'normal',
        is_hard_budget: false,
        preferences: [],
        dislikes: [],
        allergies: ['peanuts'],
      }

      // Sườn heo nướng mật ong: peanuts is 'may_contain'
      const candidate: CandidateItem[] = [
        {
          menu_item_id: '10000000-0000-0000-0000-000000000001',
          quantity: 1,
        },
      ]

      const validation = validateMealCandidate(candidate, constraints, mockCatalog)
      expect(validation.status).toBe('WARNING')
      expect(validation.action_eligible).toBe(false) // Server-side blocks automatic action!
      const allergenCheck = validation.checks.find((c) => c.name.startsWith('allergen_peanuts'))
      expect(allergenCheck?.status).toBe('WARNING')
      expect(allergenCheck?.message).toContain('nguy cơ nhiễm chéo')
    })

    it('allergen unknown/unprofiled: returns INSUFFICIENT_DATA and action_eligible = false', () => {
      const constraints: CustomerConstraints = {
        adults: 2,
        children: 0,
        appetite: 'normal',
        is_hard_budget: false,
        preferences: [],
        dislikes: [],
        allergies: ['gluten'],
      }

      // Item without allergen profile
      const unprofiledCatalog: MenuItemCatalogRecord[] = [
        {
          id: '99999999-9999-9999-9999-999999999999',
          name: 'Món mới chưa thử nghiệm',
          price_vnd: 120000,
          is_available: true,
        },
      ]

      const candidate: CandidateItem[] = [
        {
          menu_item_id: '99999999-9999-9999-9999-999999999999',
          quantity: 1,
        },
      ]

      const validation = validateMealCandidate(candidate, constraints, unprofiledCatalog)
      expect(validation.status).toBe('INSUFFICIENT_DATA')
      expect(validation.action_eligible).toBe(false)
      const allergenCheck = validation.checks.find((c) => c.name.startsWith('allergen_gluten'))
      expect(allergenCheck?.status).toBe('INSUFFICIENT_DATA')
      expect(allergenCheck?.message).toContain('chưa có hồ sơ kiểm nghiệm')
    })

    it('proposal item modification: updates items from live catalog, increments version, and recalculates action_eligible', () => {
      const constraints: CustomerConstraints = {
        adults: 2,
        children: 0,
        appetite: 'normal',
        is_hard_budget: false,
        preferences: [],
        dislikes: [],
        allergies: [],
      }

      const initialValidation = validateMealCandidate(
        [
          {
            menu_item_id: '10000000-0000-0000-0000-000000000001', // Sườn heo: 185k
            quantity: 1,
          },
        ],
        constraints,
        mockCatalog
      )

      const initialProposal: MealProposal = {
        id: 'prop-test-01',
        version: 1,
        title: 'Thực đơn thử nghiệm',
        description: 'Mô tả',
        concept_tag: 'balanced_harmony',
        items: [
          {
            menu_item_id: '10000000-0000-0000-0000-000000000001',
            quantity: 1,
          },
        ],
        subtotal_vnd: 185000,
        serving_summary: 'Đủ no cho 2 người',
        validation: initialValidation,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 1800000).toISOString(),
        action_eligible: true,
      }

      // Modify proposal: change quantity of Sườn heo to 2, and add Trà đào
      const updatedProposal = modifyProposalItems(
        initialProposal,
        [
          { menu_item_id: '10000000-0000-0000-0000-000000000001', quantity: 2 }, // 185k * 2 = 370k
          { menu_item_id: '10000000-0000-0000-0000-000000000010', quantity: 2 }, // 42k * 2 = 84k
        ],
        constraints,
        mockCatalog
      )

      expect(updatedProposal.version).toBe(2)
      expect(updatedProposal.subtotal_vnd).toBe(370000 + 84000)
      expect(updatedProposal.validation.version).toBe(1)
      expect(updatedProposal.action_eligible).toBe(true)

      // Modify proposal by adding an allergen-containing dish: should flip action_eligible to false
      const allergicConstraints: CustomerConstraints = {
        ...constraints,
        allergies: ['peanuts'],
      }
      const allergicProposal = modifyProposalItems(
        updatedProposal,
        [
          { menu_item_id: '10000000-0000-0000-0000-000000000002', quantity: 1 }, // Gỏi cuốn contains peanuts!
        ],
        allergicConstraints,
        mockCatalog
      )

      expect(allergicProposal.version).toBe(3)
      expect(allergicProposal.validation.status).toBe('BLOCKED')
      expect(allergicProposal.action_eligible).toBe(false)
    })
  })
})
