/**
 * Tiger 345 - Deterministic Concierge Validator
 * Based on plans/tiger-345/09-concierge-agent-design.md (§8, §9, §13)
 *
 * Core Guarantees:
 * 1. Independent validation: LLM cannot bypass or fabricate validation results.
 * 2. Live DB price recalculation: Totals are strictly computed from active menu catalog.
 * 3. Hard Budget Enforced: Hard budget violates return BLOCKED.
 * 4. Allergen Guardrail: Insufficient or unknown allergen data returns INSUFFICIENT_DATA or WARNING.
 * 5. Serving math calculates equivalent adults and macro coverage.
 */

import type {
  CandidateItem,
  CandidateValidation,
  CustomerConstraints,
  ServingCoverage,
  ValidationCheckItem,
  ValidationStatus,
} from './types.ts'
import {
  ALLERGEN_PROFILES,
  RECOMMENDATION_CONFIG,
  SERVING_PROFILES,
} from './knowledge.ts'
import { AppError } from '../errors.ts'

export interface MenuItemCatalogRecord {
  id: string
  name: string
  price_vnd: number
  is_available: boolean
}

export function computeEquivalentAdults(
  adults: number,
  children: number,
  appetite: 'light' | 'normal' | 'heavy' = 'normal'
): number {
  const safeAdults = Math.max(0, adults || 0)
  const safeChildren = Math.max(0, children || 0)
  if (safeAdults === 0 && safeChildren === 0) {
    return 1.0
  }
  const factor = RECOMMENDATION_CONFIG.appetite_factors[appetite] ?? 1.0

  const baseEquivalent =
    safeAdults * RECOMMENDATION_CONFIG.adult_factor +
    safeChildren * RECOMMENDATION_CONFIG.child_factor

  return Number((baseEquivalent * factor).toFixed(2))
}

export function calculateServingCoverage(
  items: CandidateItem[],
  constraints: CustomerConstraints
): ServingCoverage {
  const targetEquivalent = computeEquivalentAdults(
    constraints.adults,
    constraints.children,
    constraints.appetite
  )

  let proteinEquivalents = 0
  let carbEquivalents = 0
  let veggieEquivalents = 0
  let soupEquivalents = 0

  for (const item of items) {
    const profile = SERVING_PROFILES[item.menu_item_id]
    if (!profile) continue

    const avgPeople = (profile.people_min + profile.people_max) / 2
    const qty = item.quantity

    // Role-based scaling: side dishes contribute minimally to protein/carb, drinks/desserts contribute 0
    let roleProteinScale = 1.0
    let roleCarbScale = 1.0
    if (profile.meal_role === 'side') {
      roleProteinScale = 0.25 // Side dish cannot substitute main protein
      roleCarbScale = 0.3
    } else if (
      profile.meal_role === 'drink' ||
      profile.meal_role === 'dessert' ||
      profile.meal_role === 'alcohol'
    ) {
      roleProteinScale = 0.0
      roleCarbScale = 0.0
    }

    proteinEquivalents += qty * profile.contributions.protein * avgPeople * roleProteinScale
    carbEquivalents += qty * profile.contributions.carb * avgPeople * roleCarbScale
    veggieEquivalents += qty * profile.contributions.vegetable * avgPeople
    soupEquivalents += qty * profile.contributions.soup * avgPeople
  }

  const proteinRatio = Number(
    (proteinEquivalents / Math.max(targetEquivalent, 0.1)).toFixed(2)
  )
  const carbRatio = Number(
    (carbEquivalents / Math.max(targetEquivalent, 0.1)).toFixed(2)
  )
  const veggieRatio = Number(
    (veggieEquivalents / Math.max(targetEquivalent, 0.1)).toFixed(2)
  )
  const soupRatio = Number(
    (soupEquivalents / Math.max(targetEquivalent, 0.1)).toFixed(2)
  )

  // Overall fit score is weighted macro coverage capped at 1.2 contribution
  const clampedProtein = Math.min(proteinRatio, 1.2)
  const clampedCarb = Math.min(carbRatio, 1.2)
  const clampedVeggie = Math.min(veggieRatio, 1.2)
  const clampedSoup = Math.min(soupRatio, 1.2)

  const overallScore = Number(
    (
      clampedProtein * 0.4 +
      clampedCarb * 0.25 +
      clampedVeggie * 0.2 +
      clampedSoup * 0.15
    ).toFixed(2)
  )

  const gaps: string[] = []
  if (proteinRatio < 0.6) gaps.push('Thiếu món đạm chính (Protein)')
  if (carbRatio < 0.5 && targetEquivalent >= 2) gaps.push('Có thể thiếu tinh bột no lâu (Cơm/Mì/Bánh)')
  if (veggieRatio < 0.4) gaps.push('Ít rau xanh / món thanh vị')
  if (soupRatio < 0.3 && targetEquivalent >= 3) gaps.push('Chưa có món canh hoặc lẩu ấm bụng')

  const isSurplus =
    proteinRatio > 3.8 ||
    soupRatio > 3.0 ||
    carbRatio > 3.8 ||
    veggieRatio > 3.8 ||
    (proteinRatio + carbRatio + veggieRatio + soupRatio) / 4 > 2.8

  const isSufficient = proteinRatio >= 0.7 && overallScore >= 0.65

  return {
    target_equivalent_adults: targetEquivalent,
    protein_coverage_ratio: proteinRatio,
    carb_coverage_ratio: carbRatio,
    vegetable_coverage_ratio: veggieRatio,
    soup_coverage_ratio: soupRatio,
    overall_fit_score: overallScore,
    is_sufficient: isSufficient,
    surplus_detected: isSurplus,
    gaps,
  }
}

export function validateMealCandidate(
  candidateItems: CandidateItem[],
  constraints: CustomerConstraints,
  catalog: MenuItemCatalogRecord[]
): CandidateValidation {
  // Validate candidate item bounds and quantities
  for (const item of candidateItems) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Số lượng món ăn phải là số nguyên dương hợp lệ (nhận được: ${item.quantity})`
      )
    }
  }

  const catalogMap = new Map<string, MenuItemCatalogRecord>()
  for (const item of catalog) {
    catalogMap.set(item.id, item)
  }

  const checks: ValidationCheckItem[] = []
  const warnings: string[] = []
  const assumptions: string[] = []

  // Check 1: Menu Availability & Price Recalculation
  let recalculatedSubtotal = 0
  let availabilityFailed = false

  for (const item of candidateItems) {
    const catalogItem = catalogMap.get(item.menu_item_id)

    if (!catalogItem) {
      availabilityFailed = true
      checks.push({
        name: 'check_item_existence',
        status: 'BLOCKED',
        message: `Món [${item.item_name || item.menu_item_id}] không tồn tại trong thực đơn hiện hành`,
        details: { menu_item_id: item.menu_item_id },
      })
      continue
    }

    if (!catalogItem.is_available) {
      availabilityFailed = true
      checks.push({
        name: 'check_item_availability',
        status: 'BLOCKED',
        message: `Món [${catalogItem.name}] hiện đang tạm ngưng phục vụ tại bếp`,
        details: { menu_item_id: item.menu_item_id, item_name: catalogItem.name },
      })
      continue
    }

    // Always use true catalog unit price
    recalculatedSubtotal += catalogItem.price_vnd * item.quantity
  }

  if (!availabilityFailed) {
    checks.push({
      name: 'check_menu_availability',
      status: 'PASS',
      message: 'Tất cả các món đề xuất đều có sẵn tại bếp',
    })
  }

  // Check 2: Hard & Soft Budget Integrity
  if (constraints.budget_vnd && constraints.budget_vnd > 0) {
    const budget = constraints.budget_vnd
    if (constraints.is_hard_budget) {
      if (recalculatedSubtotal > budget) {
        checks.push({
          name: 'check_budget',
          status: 'BLOCKED',
          message: `Tổng giá (${recalculatedSubtotal.toLocaleString(
            'vi-VN'
          )} đ) vượt quá ngân sách cố định tối đa (${budget.toLocaleString(
            'vi-VN'
          )} đ)`,
          details: { subtotal_vnd: recalculatedSubtotal, budget_vnd: budget },
        })
      } else {
        checks.push({
          name: 'check_budget',
          status: 'PASS',
          message: `Thỏa mãn ngân sách cố định (${recalculatedSubtotal.toLocaleString(
            'vi-VN'
          )} đ <= ${budget.toLocaleString('vi-VN')} đ)`,
        })
      }
    } else {
      // Soft budget: up to +5% tolerance with warning, beyond that is strictly BLOCKED
      const maxAllowed = budget * (1 + RECOMMENDATION_CONFIG.soft_budget_tolerance_percentage / 100)
      if (recalculatedSubtotal > maxAllowed) {
        const blockMsg = `Tổng giá (${recalculatedSubtotal.toLocaleString(
          'vi-VN'
        )} đ) vượt quá biên độ ngân sách cho phép (${maxAllowed.toLocaleString(
          'vi-VN'
        )} đ, dung sai +${RECOMMENDATION_CONFIG.soft_budget_tolerance_percentage}%)`
        warnings.push(blockMsg)
        checks.push({
          name: 'check_budget',
          status: 'BLOCKED',
          message: blockMsg,
          details: { subtotal_vnd: recalculatedSubtotal, budget_vnd: budget, max_allowed_vnd: maxAllowed },
        })
      } else if (recalculatedSubtotal > budget) {
        const warnMsg = `Tổng giá (${recalculatedSubtotal.toLocaleString(
          'vi-VN'
        )} đ) vượt nhẹ ngân sách dự kiến (${budget.toLocaleString('vi-VN')} đ)`
        warnings.push(warnMsg)
        checks.push({
          name: 'check_budget',
          status: 'WARNING',
          message: warnMsg,
          details: { subtotal_vnd: recalculatedSubtotal, budget_vnd: budget, max_allowed_vnd: maxAllowed },
        })
      } else {
        checks.push({
          name: 'check_budget',
          status: 'PASS',
          message: `Nằm trong biên độ ngân sách dự kiến (${recalculatedSubtotal.toLocaleString(
            'vi-VN'
          )} đ <= ${budget.toLocaleString('vi-VN')} đ)`,
        })
      }
    }
  }

  // Check 3: Allergen Guardrails (§13)
  if (constraints.allergies && constraints.allergies.length > 0) {
    for (const allergy of constraints.allergies) {
      for (const item of candidateItems) {
        const allergenProfile = ALLERGEN_PROFILES[item.menu_item_id]
        const itemName = catalogMap.get(item.menu_item_id)?.name || item.item_name || item.menu_item_id

        if (!allergenProfile) {
          // Unprofiled item
          const warnMsg = `Món [${itemName}] chưa có hồ sơ kiểm nghiệm dị ứng (${allergy}). Cần xác nhận trực tiếp với bếp trưởng.`
          warnings.push(warnMsg)
          checks.push({
            name: `allergen_${allergy}_${item.menu_item_id}`,
            status: 'INSUFFICIENT_DATA',
            message: warnMsg,
            details: { menu_item_id: item.menu_item_id, allergy },
          })
          continue
        }

        const allergenStatus = allergenProfile.allergens ? allergenProfile.allergens[allergy] : undefined

        if (allergenStatus === 'contains') {
          checks.push({
            name: `allergen_${allergy}_${item.menu_item_id}`,
            status: 'BLOCKED',
            message: `Món [${itemName}] có chứa dị nguyên (${allergy}). Đề xuất vi phạm an toàn thực khách.`,
            details: { menu_item_id: item.menu_item_id, allergy, status: 'contains' },
          })
        } else if (allergenStatus === 'may_contain') {
          const warnMsg = `Món [${itemName}] có nguy cơ nhiễm chéo dị nguyên (${allergy}) (may_contain). Nhà hàng không cam kết an toàn tuyệt đối cho thực khách có tiền sử dị ứng.`
          warnings.push(warnMsg)
          checks.push({
            name: `allergen_${allergy}_${item.menu_item_id}`,
            status: 'WARNING',
            message: warnMsg,
            details: { menu_item_id: item.menu_item_id, allergy, status: 'may_contain' },
          })
        } else if (!allergenStatus || allergenStatus === 'unknown') {
          // Missing allergen field OR explicitly unknown -> INSUFFICIENT_DATA
          const warnMsg = `Món [${itemName}] chưa có dữ liệu kiểm nghiệm đầy đủ đối với dị nguyên (${allergy}). Không tự ý khẳng định an toàn.`
          warnings.push(warnMsg)
          checks.push({
            name: `allergen_${allergy}_${item.menu_item_id}`,
            status: 'INSUFFICIENT_DATA',
            message: warnMsg,
            details: { menu_item_id: item.menu_item_id, allergy, status: allergenStatus || 'missing_field' },
          })
        }
      }
    }
  }

  // Check 4: Serving Coverage & Portion Math
  const coverage = calculateServingCoverage(candidateItems, constraints)
  if (coverage.surplus_detected) {
    const warnMsg = `Lượng món quá nhiều so với ${coverage.target_equivalent_adults} người ăn (phát hiện dư thừa lẩu/canh hoặc đạm gấp nhiều lần nhu cầu), có thể gây lãng phí lớn.`
    warnings.push(warnMsg)
    checks.push({
      name: 'check_serving_coverage',
      status: 'WARNING',
      message: warnMsg,
      details: { coverage },
    })
  } else if (!coverage.is_sufficient) {
    const warnMsg = `Khẩu phần có thể chưa đủ no cho ${coverage.target_equivalent_adults} người ăn (Độ phủ đạm: ${(
      coverage.protein_coverage_ratio * 100
    ).toFixed(0)}%)`
    warnings.push(warnMsg)
    checks.push({
      name: 'check_serving_coverage',
      status: 'WARNING',
      message: warnMsg,
      details: { coverage },
    })
  } else {
    checks.push({
      name: 'check_serving_coverage',
      status: 'PASS',
      message: `Khẩu phần cân đối hài hòa cho ${coverage.target_equivalent_adults} người ăn`,
      details: { coverage },
    })
  }

  // Assumptions documentation
  assumptions.push(
    `Quy đổi khẩu phần: ${constraints.adults} người lớn + ${
      constraints.children
    } trẻ em, sức ăn [${constraints.appetite}] tương đương ${
      coverage.target_equivalent_adults
    } người lớn tiêu chuẩn.`
  )
  if (!constraints.budget_vnd) {
    assumptions.push('Không áp dụng giới hạn ngân sách tối đa.')
  }

  // Overall status resolution
  let overallStatus: ValidationStatus = 'PASS'
  if (checks.some((c) => c.status === 'BLOCKED')) {
    overallStatus = 'BLOCKED'
  } else if (checks.some((c) => c.status === 'INSUFFICIENT_DATA')) {
    overallStatus = 'INSUFFICIENT_DATA'
  } else if (checks.some((c) => c.status === 'WARNING')) {
    overallStatus = 'WARNING'
  }

  // Action eligibility determination (§13, AT10)
  let actionEligible = true
  if (overallStatus === 'BLOCKED' || overallStatus === 'INSUFFICIENT_DATA') {
    actionEligible = false
  }
  // Any allergen warning (may_contain) or blocked check blocks automatic action eligibility
  if (
    checks.some(
      (c) =>
        c.status === 'BLOCKED' ||
        c.status === 'INSUFFICIENT_DATA' ||
        (c.name.startsWith('allergen_') && c.status === 'WARNING')
    )
  ) {
    actionEligible = false
  }

  return {
    status: overallStatus,
    checks,
    subtotal_vnd: recalculatedSubtotal,
    coverage,
    assumptions,
    warnings,
    validated_at: new Date().toISOString(),
    version: 1,
    action_eligible: actionEligible,
  }
}
