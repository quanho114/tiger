/**
 * Tiger 345 - Meal Proposal & Recommendation Engine
 * Based on plans/tiger-345/09-concierge-agent-design.md (§8, §9, §11)
 *
 * Core Guarantees:
 * - Generates 2-3 distinct, structured meal proposals (balanced_harmony, signature_experience, budget_optimized)
 * - Proactively avoids dishes with known allergens matching customer constraints
 * - Automatically validates each candidate through deterministic validator
 * - Proposals are proposals: MUST NOT automatically add to cart or create orders
 */

import type {
  AllergenType,
  CandidateItem,
  CustomerConstraints,
  FeasibilityCheckResult,
  MealProposal,
} from './types.ts'
import {
  ALLERGEN_PROFILES,
  RECOMMENDATION_CONFIG,
  SERVING_PROFILES,
} from './knowledge.ts'
import {
  computeEquivalentAdults,
  validateMealCandidate,
  type MenuItemCatalogRecord,
} from './validator.ts'

export function parsePartyConstraints(
  text: string,
  existing?: Partial<CustomerConstraints>
): {
  constraints: CustomerConstraints
  needsClarification: boolean
  clarificationQuestion?: string
} {
  const defaults: CustomerConstraints = {
    adults: existing?.adults ?? 0,
    children: existing?.children ?? 0,
    appetite: existing?.appetite ?? 'normal',
    budget_vnd: existing?.budget_vnd ?? null,
    is_hard_budget: existing?.is_hard_budget ?? false,
    preferences: existing?.preferences ? [...existing.preferences] : [],
    dislikes: existing?.dislikes ? [...existing.dislikes] : [],
    allergies: existing?.allergies ? [...existing.allergies] : [],
    meal_purpose: existing?.meal_purpose,
    order_mode: existing?.order_mode,
  }

  const raw = text.toLowerCase().trim()

  // 1. Party Size Ambiguities
  // Case A: "7 người gồm 2 trẻ" / "7 người trong đó 2 bé" / "7 khách bao gồm 2 trẻ em"
  const comboIncludedMatch = raw.match(
    /(\d+)\s*(?:người|khách)\s*(?:gồm|trong\s*đó\s*(?:có)?|bao\s*gồm|kèm)\s*(\d+)\s*(?:trẻ|bé|em\s*bé|trẻ\s*em|con\s*nít)/i
  )
  // Case B: "7 người lớn và 2 trẻ" / "7 người lớn + 2 trẻ" / "7 lớn 2 bé" / "7 lớn, 2 bé"
  const comboPlusMatch = raw.match(
    /(\d+)\s*(?:người\s*lớn|lớn)\s*(?:và|\+|\,|\s*kèm\s*)?\s*(\d+)\s*(?:trẻ|bé|em\s*bé|trẻ\s*em|con\s*nít)/i
  )

  if (comboIncludedMatch) {
    const total = parseInt(comboIncludedMatch[1], 10)
    const children = parseInt(comboIncludedMatch[2], 10)
    defaults.children = children
    defaults.adults = Math.max(0, total - children)
  } else if (comboPlusMatch) {
    defaults.adults = parseInt(comboPlusMatch[1], 10)
    defaults.children = parseInt(comboPlusMatch[2], 10)
  } else {
    // Individual matches
    const adultsOnlyMatch = raw.match(/(\d+)\s*(?:người\s*lớn|lớn)/i)
    if (adultsOnlyMatch) {
      defaults.adults = parseInt(adultsOnlyMatch[1], 10)
    }

    const childrenOnlyMatch = raw.match(/(\d+)\s*(?:trẻ|bé|em\s*bé|trẻ\s*em|con\s*nít)/i)
    if (childrenOnlyMatch) {
      defaults.children = parseInt(childrenOnlyMatch[1], 10)
    }

    if (!adultsOnlyMatch && !childrenOnlyMatch) {
      const generalPeopleMatch = raw.match(/(?:bàn\s*)?(\d+)\s*(?:người|khách)/i)
      if (generalPeopleMatch) {
        defaults.adults = parseInt(generalPeopleMatch[1], 10)
        defaults.children = 0
      }
    }
  }

  // 2. Appetite
  if (/ăn\s*khỏe|ăn\s*nhiều|sức\s*ăn\s*tốt|ăn\s*mạnh|ăn\s*no\s*nê/i.test(raw)) {
    defaults.appetite = 'heavy'
  } else if (/ăn\s*ít|ăn\s*nhẹ|ăn\s*thanh\s*đạm|sức\s*ăn\s*ít/i.test(raw)) {
    defaults.appetite = 'light'
  } else if (/ăn\s*vừa|bình\s*thường/i.test(raw)) {
    defaults.appetite = 'normal'
  }

  // 3. Budget & Hard/Soft Bound
  if (/tối\s*đa|không\s*quá|dưới|cấm\s*vượt|chặt|chính\s*xác/i.test(raw)) {
    defaults.is_hard_budget = true
  } else if (/tầm|khoảng|quanh|dự\s*kiến|khoảng\s*chừng/i.test(raw)) {
    defaults.is_hard_budget = false
  }

  // Extract budget amount
  // "1.5tr", "1,5tr", "1.5 triệu", "1,5 triệu"
  const millionDecimalMatch = raw.match(/(\d+)[.,](\d+)\s*(?:tr|triệu)/i)
  if (millionDecimalMatch) {
    const whole = parseInt(millionDecimalMatch[1], 10)
    const fraction = parseInt(millionDecimalMatch[2], 10)
    defaults.budget_vnd = whole * 1000000 + fraction * 100000
  } else {
    // "1tr5"
    const trKMatch = raw.match(/(\d+)\s*tr\s*(\d+)/i)
    if (trKMatch) {
      const whole = parseInt(trKMatch[1], 10)
      const fraction = parseInt(trKMatch[2], 10)
      defaults.budget_vnd = whole * 1000000 + fraction * 100000
    } else {
      // "2tr", "2 triệu"
      const millionMatch = raw.match(/(\d+)\s*(?:tr|triệu)/i)
      if (millionMatch) {
        defaults.budget_vnd = parseInt(millionMatch[1], 10) * 1000000
      } else {
        // "500k", "500 ngàn", "500 nghìn"
        const thousandMatch = raw.match(/(\d+)\s*(?:k|nghìn|ngàn)/i)
        if (thousandMatch) {
          defaults.budget_vnd = parseInt(thousandMatch[1], 10) * 1000
        } else {
          // "2.000.000", "2,000,000", "2000000"
          const numberMatch = raw.match(
            /(?:ngân\s*sách|tầm|khoảng|tối\s*đa|chi\s*phí)?\s*(\d{1,3}(?:[.,]\d{3}){1,2}|\d{6,8})\s*(?:đ|vnd|đồng)?/i
          )
          if (numberMatch && numberMatch[1]) {
            const cleanNum = parseInt(numberMatch[1].replace(/[.,]/g, ''), 10)
            if (cleanNum >= 50000) {
              defaults.budget_vnd = cleanNum
            }
          }
        }
      }
    }
  }

  // 4. Allergies
  const allergyMap: Record<string, AllergenType> = {
    'hải sản': 'seafood',
    'tôm': 'seafood',
    'cua': 'seafood',
    'mực': 'seafood',
    'ghẹ': 'seafood',
    'đậu phộng': 'peanuts',
    'lạc': 'peanuts',
    'trứng': 'eggs',
    'sữa': 'dairy',
    'lactose': 'dairy',
    'gluten': 'gluten',
    'bột mì': 'gluten',
    'đậu nành': 'soy',
    'tương': 'soy',
    'mè': 'sesame',
    'vừng': 'sesame',
  }

  for (const [kw, allergyType] of Object.entries(allergyMap)) {
    const allergyRegex = new RegExp(
      `(?:dị\\s*ứng|không\\s*(?:ăn|uống)\\s*(?:được)?|kiêng)\\s*${kw}|${kw}\\s*(?:dị\\s*ứng)`,
      'i'
    )
    if (allergyRegex.test(raw)) {
      if (!defaults.allergies.includes(allergyType)) {
        defaults.allergies.push(allergyType)
      }
    }
  }

  // 5. Clarification
  let needsClarification = false
  let clarificationQuestion: string | undefined

  if (defaults.adults === 0 && defaults.children === 0) {
    needsClarification = true
    clarificationQuestion = 'Dạ bàn mình dự kiến đi bao nhiêu người lớn và có trẻ em đi cùng không ạ?'
  }

  return {
    constraints: defaults,
    needsClarification,
    clarificationQuestion,
  }
}

export function checkFeasibility(
  constraints: CustomerConstraints,
  catalog: MenuItemCatalogRecord[]
): FeasibilityCheckResult {
  const availableItems = catalog.filter((item) => item.is_available)
  if (availableItems.length === 0) {
    return {
      feasible: false,
      reason: 'Thực đơn nhà hàng hiện chưa có món ăn nào khả dụng.',
    }
  }

  if (constraints.budget_vnd && constraints.budget_vnd > 0) {
    const minPrice = Math.min(...availableItems.map((i) => i.price_vnd))
    if (constraints.budget_vnd < minPrice) {
      return {
        feasible: false,
        reason: `Ngân sách ${constraints.budget_vnd.toLocaleString(
          'vi-VN'
        )} đ không đủ để chọn món tối thiểu (${minPrice.toLocaleString('vi-VN')} đ) trong thực đơn.`,
      }
    }
  }

  if (constraints.allergies && constraints.allergies.length > 0) {
    const safeItems = availableItems.filter((item) => {
      const allergenProfile = ALLERGEN_PROFILES[item.id]
      if (!allergenProfile) return true
      for (const allergy of constraints.allergies) {
        if (allergenProfile.allergens[allergy] === 'contains') {
          return false
        }
      }
      return true
    })

    if (safeItems.length === 0) {
      return {
        feasible: false,
        reason: 'Không có đủ món ăn khả dụng không chứa dị nguyên khai báo để cấu thành mâm tiệc.',
      }
    }
  }

  return { feasible: true }
}

export function modifyProposalItems(
  originalProposal: MealProposal,
  itemUpdates: { menu_item_id: string; quantity: number }[],
  constraints: CustomerConstraints,
  catalog: MenuItemCatalogRecord[]
): MealProposal {
  const itemMap = new Map<string, CandidateItem>()
  for (const it of originalProposal.items) {
    itemMap.set(it.menu_item_id, { ...it })
  }

  for (const upd of itemUpdates) {
    if (upd.quantity <= 0) {
      itemMap.delete(upd.menu_item_id)
    } else {
      const existing = itemMap.get(upd.menu_item_id)
      const catItem = catalog.find((c) => c.id === upd.menu_item_id)
      if (existing) {
        existing.quantity = upd.quantity
      } else if (catItem) {
        itemMap.set(upd.menu_item_id, {
          menu_item_id: catItem.id,
          item_name: catItem.name,
          unit_price_vnd: catItem.price_vnd,
          quantity: upd.quantity,
          serving_size: SERVING_PROFILES[catItem.id]?.pieces_or_weight,
          meal_role: SERVING_PROFILES[catItem.id]?.meal_role,
        })
      }
    }
  }

  const newItems = Array.from(itemMap.values())
  const validation = validateMealCandidate(newItems, constraints, catalog)

  return {
    ...originalProposal,
    version: originalProposal.version + 1,
    items: newItems,
    subtotal_vnd: validation.subtotal_vnd,
    validation,
    action_eligible: validation.action_eligible,
  }
}

function generateProposalId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 7)
  return `prop-${timestamp}-${random}`
}

function isVegetableDish(item: MenuItemCatalogRecord): boolean {
  const profile = SERVING_PROFILES[item.id]
  const n = item.name.toLowerCase()
  return (
    profile?.meal_role === 'vegetable' ||
    profile?.meal_role === 'side' ||
    (profile?.contributions.vegetable || 0) >= 0.35 ||
    n.includes('gỏi') ||
    n.includes('rau') ||
    n.includes('nấm') ||
    n.includes('salad') ||
    n.includes('cuốn')
  )
}

function isMainProteinDish(item: MenuItemCatalogRecord): boolean {
  const profile = SERVING_PROFILES[item.id]
  const n = item.name.toLowerCase()
  return (
    profile?.meal_role === 'main_protein' ||
    (profile?.contributions.protein || 0) >= 0.4 ||
    n.includes('sườn') ||
    n.includes('bò') ||
    n.includes('cá') ||
    n.includes('gà') ||
    n.includes('heo') ||
    n.includes('thịt')
  )
}

function isSoupHotpotDish(item: MenuItemCatalogRecord): boolean {
  const profile = SERVING_PROFILES[item.id]
  const n = item.name.toLowerCase()
  return (
    profile?.meal_role === 'soup_hotpot' ||
    (profile?.contributions.soup || 0) >= 0.4 ||
    n.includes('lẩu') ||
    n.includes('canh') ||
    n.includes('súp')
  )
}

function isCarbDish(item: MenuItemCatalogRecord): boolean {
  const profile = SERVING_PROFILES[item.id]
  const n = item.name.toLowerCase()
  return (
    profile?.meal_role === 'carb' ||
    (profile?.contributions.carb || 0) >= 0.4 ||
    n.includes('cơm') ||
    n.includes('phở') ||
    n.includes('mì') ||
    n.includes('bánh') ||
    n.includes('xôi')
  )
}

function isSetMeal(item: MenuItemCatalogRecord): boolean {
  const profile = SERVING_PROFILES[item.id]
  const n = item.name.toLowerCase()
  return profile?.meal_role === 'set' || n.includes('mâm') || n.includes('set') || n.includes('combo')
}

function isDrink(item: MenuItemCatalogRecord): boolean {
  const profile = SERVING_PROFILES[item.id]
  const n = item.name.toLowerCase()
  return (
    profile?.meal_role === 'drink' ||
    n.includes('trà') ||
    n.includes('nước') ||
    n.includes('ép') ||
    n.includes('sinh tố') ||
    n.includes('bia')
  )
}

function isDessert(item: MenuItemCatalogRecord): boolean {
  const profile = SERVING_PROFILES[item.id]
  const n = item.name.toLowerCase()
  return (
    profile?.meal_role === 'dessert' ||
    n.includes('chè') ||
    n.includes('flan') ||
    n.includes('tráng miệng') ||
    n.includes('kem')
  )
}

export function buildMealProposals(
  constraints: CustomerConstraints,
  catalog: MenuItemCatalogRecord[]
): MealProposal[] {
  const targetEquivalent = computeEquivalentAdults(
    constraints.adults,
    constraints.children,
    constraints.appetite
  )

  const feasibility = checkFeasibility(constraints, catalog)
  if (!feasibility.feasible) {
    return []
  }

  const availableItems = catalog.filter((item) => item.is_available)
  if (availableItems.length === 0) {
    return []
  }

  // Pre-filter items that explicitly contain customer allergens
  const safeItems = availableItems.filter((item) => {
    if (!constraints.allergies || constraints.allergies.length === 0) return true
    const allergenProfile = ALLERGEN_PROFILES[item.id]
    if (!allergenProfile) return false
    for (const allergy of constraints.allergies) {
      if (allergenProfile.allergens[allergy] === 'contains') {
        return false // Exclude completely from generation
      }
    }
    return true
  })

  // Filter out disliked items if any
  const filteredItems = safeItems.filter((item) => {
    if (!constraints.dislikes || constraints.dislikes.length === 0) return true
    const n = item.name.toLowerCase()
    for (const d of constraints.dislikes) {
      if (n.includes(d.toLowerCase())) {
        return false
      }
    }
    return true
  })

  const candidatePool = filteredItems.length > 0 ? filteredItems : safeItems
  if (candidatePool.length === 0) {
    return []
  }

  const wantsMoreVeg = (constraints.preferences || []).some((p) =>
    /rau|chay|thanh mát|thanh vị|nhiều rau|thêm rau/i.test(p)
  )

  const proposals: MealProposal[] = []

  // Concept 1: Balanced Harmony (Cân bằng & Tươi mát)
  const balancedItems = buildBalancedCandidate(targetEquivalent, candidatePool, wantsMoreVeg)
  if (balancedItems.length > 0) {
    const validation = validateMealCandidate(balancedItems, constraints, catalog)
    if (validation.status !== 'BLOCKED') {
      const now = new Date()
      const expiresAt = new Date(
        now.getTime() + RECOMMENDATION_CONFIG.proposal_ttl_seconds * 1000
      ).toISOString()

      proposals.push({
        id: generateProposalId(),
        version: 1,
        title: 'Mâm cơm Hài Hòa & Thanh Vị',
        description:
          'Thực đơn kết hợp cân bằng giữa món đạm nướng thơm lừng, khai vị thanh mát và canh giải ngấy.',
        concept_tag: 'balanced_harmony',
        items: balancedItems,
        subtotal_vnd: validation.subtotal_vnd,
        serving_summary: `Khẩu phần vừa vặn cho ${targetEquivalent} người ăn tiêu chuẩn`,
        validation,
        created_at: now.toISOString(),
        expires_at: expiresAt,
        action_eligible: validation.action_eligible,
      })
    }
  }

  // Concept 2: Signature Experience (Tinh hoa Đặc sản Tiger 345)
  const signatureItems = buildSignatureCandidate(targetEquivalent, candidatePool, wantsMoreVeg)
  if (signatureItems.length > 0) {
    const validation = validateMealCandidate(signatureItems, constraints, catalog)
    if (validation.status !== 'BLOCKED') {
      const now = new Date()
      const expiresAt = new Date(
        now.getTime() + RECOMMENDATION_CONFIG.proposal_ttl_seconds * 1000
      ).toISOString()

      proposals.push({
        id: generateProposalId(),
        version: 1,
        title: 'Trải Nghiệm Tinh Hoa Tây Bắc',
        description:
          'Tập trung vào những món đặc sản nướng than hoa và lẩu chim câu đại bổ mang đậm phong vị bản địa.',
        concept_tag: 'signature_experience',
        items: signatureItems,
        subtotal_vnd: validation.subtotal_vnd,
        serving_summary: `Thịnh soạn và trọn vẹn cho ${targetEquivalent} thực khách`,
        validation,
        created_at: now.toISOString(),
        expires_at: expiresAt,
        action_eligible: validation.action_eligible,
      })
    }
  }

  // Concept 3: Budget Optimized (Tiết Kiệm & No Lâu)
  const budgetItems = buildBudgetCandidate(
    targetEquivalent,
    candidatePool,
    constraints.budget_vnd,
    wantsMoreVeg
  )
  if (budgetItems.length > 0) {
    const validation = validateMealCandidate(budgetItems, constraints, catalog)
    if (validation.status !== 'BLOCKED') {
      const now = new Date()
      const expiresAt = new Date(
        now.getTime() + RECOMMENDATION_CONFIG.proposal_ttl_seconds * 1000
      ).toISOString()

      proposals.push({
        id: generateProposalId(),
        version: 1,
        title: 'Mâm Ngon Trọn Vị Tối Ưu Chi Phí',
        description:
          'Lựa chọn thông minh với các combo cơm niêu và món dùng kèm vừa no nê vừa giữ chi phí hợp lý nhất.',
        concept_tag: 'budget_optimized',
        items: budgetItems,
        subtotal_vnd: validation.subtotal_vnd,
        serving_summary: `Tiết kiệm chi phí, đủ no cho ${targetEquivalent} người`,
        validation,
        created_at: now.toISOString(),
        expires_at: expiresAt,
        action_eligible: validation.action_eligible,
      })
    }
  }

  // Budget ranking: if budget is set, sort proposals closest to budget first
  if (constraints.budget_vnd) {
    proposals.sort((a, b) => {
      const aDiff = Math.abs(a.subtotal_vnd - constraints.budget_vnd!)
      const bDiff = Math.abs(b.subtotal_vnd - constraints.budget_vnd!)
      return aDiff - bDiff
    })
  }

  return proposals
}

function buildBalancedCandidate(
  targetEquivalent: number,
  safeItems: MenuItemCatalogRecord[],
  wantsMoreVeg: boolean
): CandidateItem[] {
  const sets = safeItems.filter(isSetMeal)
  const mainProteins = safeItems.filter((i) => isMainProteinDish(i) && !isSetMeal(i))
  const vegDishes = safeItems.filter(isVegetableDish)
  const drinks = safeItems.filter(isDrink)
  const desserts = safeItems.filter(isDessert)

  const items: CandidateItem[] = []

  // If 4+ people and set meal is available
  if (targetEquivalent >= 3.8 && sets.length > 0) {
    const s = sets[0]
    items.push({
      menu_item_id: s.id,
      item_name: s.name,
      unit_price_vnd: s.price_vnd,
      quantity: 1,
      meal_role: 'main_protein',
      serving_size: SERVING_PROFILES[s.id]?.pieces_or_weight || 'Set mâm tiệc lớn',
    })

    if (wantsMoreVeg && vegDishes.length > 0) {
      items.push({
        menu_item_id: vegDishes[0].id,
        item_name: vegDishes[0].name,
        unit_price_vnd: vegDishes[0].price_vnd,
        quantity: 2,
        meal_role: 'side',
        serving_size: SERVING_PROFILES[vegDishes[0].id]?.pieces_or_weight,
      })
    }

    if (drinks.length > 0) {
      items.push({
        menu_item_id: drinks[0].id,
        item_name: drinks[0].name,
        unit_price_vnd: drinks[0].price_vnd,
        quantity: Math.round(targetEquivalent),
        meal_role: 'drink',
        serving_size: SERVING_PROFILES[drinks[0].id]?.pieces_or_weight,
      })
    }
    return items
  }

  // 1-3 people
  if (mainProteins.length > 0) {
    const main = mainProteins[0]
    items.push({
      menu_item_id: main.id,
      item_name: main.name,
      unit_price_vnd: main.price_vnd,
      quantity: targetEquivalent > 2.5 ? 2 : 1,
      meal_role: 'main_protein',
      serving_size: SERVING_PROFILES[main.id]?.pieces_or_weight,
    })
  }

  if (vegDishes.length > 0) {
    const veg1 = vegDishes[0]
    const vegQty = wantsMoreVeg ? (targetEquivalent >= 3 ? 3 : 2) : 1
    items.push({
      menu_item_id: veg1.id,
      item_name: veg1.name,
      unit_price_vnd: veg1.price_vnd,
      quantity: vegQty,
      meal_role: 'side',
      serving_size: SERVING_PROFILES[veg1.id]?.pieces_or_weight,
    })

    if (wantsMoreVeg && vegDishes.length > 1) {
      const veg2 = vegDishes[1]
      items.push({
        menu_item_id: veg2.id,
        item_name: veg2.name,
        unit_price_vnd: veg2.price_vnd,
        quantity: 1,
        meal_role: 'side',
        serving_size: SERVING_PROFILES[veg2.id]?.pieces_or_weight,
      })
    }
  }

  if (desserts.length > 0) {
    const des = desserts[0]
    items.push({
      menu_item_id: des.id,
      item_name: des.name,
      unit_price_vnd: des.price_vnd,
      quantity: Math.max(1, Math.floor(targetEquivalent)),
      meal_role: 'dessert',
      serving_size: SERVING_PROFILES[des.id]?.pieces_or_weight,
    })
  }

  return items
}

function buildSignatureCandidate(
  targetEquivalent: number,
  safeItems: MenuItemCatalogRecord[],
  wantsMoreVeg: boolean
): CandidateItem[] {
  const hotpots = safeItems.filter(isSoupHotpotDish)
  const mainProteins = safeItems.filter((i) => isMainProteinDish(i) && !isSetMeal(i))
  const vegDishes = safeItems.filter(isVegetableDish)
  const drinks = safeItems.filter(isDrink)

  const items: CandidateItem[] = []

  if (targetEquivalent >= 2.5 && hotpots.length > 0) {
    const hp = hotpots[0]
    items.push({
      menu_item_id: hp.id,
      item_name: hp.name,
      unit_price_vnd: hp.price_vnd,
      quantity: 1,
      meal_role: 'soup_hotpot',
      serving_size: SERVING_PROFILES[hp.id]?.pieces_or_weight || 'Nồi lẩu lớn',
    })

    if (mainProteins.length > 0) {
      const sp = mainProteins[mainProteins.length > 1 ? 1 : 0]
      items.push({
        menu_item_id: sp.id,
        item_name: sp.name,
        unit_price_vnd: sp.price_vnd,
        quantity: 1,
        meal_role: 'main_protein',
        serving_size: SERVING_PROFILES[sp.id]?.pieces_or_weight,
      })
    }
  } else {
    if (mainProteins.length > 0) {
      const p1 = mainProteins[0]
      items.push({
        menu_item_id: p1.id,
        item_name: p1.name,
        unit_price_vnd: p1.price_vnd,
        quantity: Math.max(1, Math.round(targetEquivalent / 1.5)),
        meal_role: 'main_protein',
        serving_size: SERVING_PROFILES[p1.id]?.pieces_or_weight,
      })
    }
    if (mainProteins.length > 1) {
      const p2 = mainProteins[1]
      items.push({
        menu_item_id: p2.id,
        item_name: p2.name,
        unit_price_vnd: p2.price_vnd,
        quantity: 1,
        meal_role: 'main_protein',
        serving_size: SERVING_PROFILES[p2.id]?.pieces_or_weight,
      })
    }
  }

  if (wantsMoreVeg && vegDishes.length > 0) {
    const veg = vegDishes[0]
    items.push({
      menu_item_id: veg.id,
      item_name: veg.name,
      unit_price_vnd: veg.price_vnd,
      quantity: Math.max(1, Math.round(targetEquivalent / 2)),
      meal_role: 'side',
      serving_size: SERVING_PROFILES[veg.id]?.pieces_or_weight,
    })
  }

  if (drinks.length > 0) {
    const dr = drinks[0]
    items.push({
      menu_item_id: dr.id,
      item_name: dr.name,
      unit_price_vnd: dr.price_vnd,
      quantity: Math.max(1, Math.round(targetEquivalent)),
      meal_role: 'drink',
      serving_size: SERVING_PROFILES[dr.id]?.pieces_or_weight,
    })
  }

  return items
}

function buildBudgetCandidate(
  targetEquivalent: number,
  safeItems: MenuItemCatalogRecord[],
  budgetLimit: number | null | undefined,
  wantsMoreVeg: boolean
): CandidateItem[] {
  const sorted = [...safeItems].sort((a, b) => a.price_vnd - b.price_vnd)
  const carbs = sorted.filter(isCarbDish)
  const mainProteins = sorted.filter((i) => isMainProteinDish(i) && !isSetMeal(i))
  const vegDishes = sorted.filter(isVegetableDish)

  const items: CandidateItem[] = []

  if (carbs.length > 0) {
    const c = carbs[0]
    items.push({
      menu_item_id: c.id,
      item_name: c.name,
      unit_price_vnd: c.price_vnd,
      quantity: Math.max(1, Math.ceil(targetEquivalent / 1.5)),
      meal_role: 'main_protein',
      serving_size: SERVING_PROFILES[c.id]?.pieces_or_weight,
    })
  } else if (mainProteins.length > 0) {
    const p = mainProteins[0]
    items.push({
      menu_item_id: p.id,
      item_name: p.name,
      unit_price_vnd: p.price_vnd,
      quantity: 1,
      meal_role: 'main_protein',
      serving_size: SERVING_PROFILES[p.id]?.pieces_or_weight,
    })
  }

  if (vegDishes.length > 0) {
    const veg = vegDishes[0]
    items.push({
      menu_item_id: veg.id,
      item_name: veg.name,
      unit_price_vnd: veg.price_vnd,
      quantity: wantsMoreVeg ? 2 : 1,
      meal_role: 'side',
      serving_size: SERVING_PROFILES[veg.id]?.pieces_or_weight,
    })
  } else if (carbs.length > 1) {
    const c2 = carbs[1]
    items.push({
      menu_item_id: c2.id,
      item_name: c2.name,
      unit_price_vnd: c2.price_vnd,
      quantity: 1,
      meal_role: 'main_protein',
      serving_size: SERVING_PROFILES[c2.id]?.pieces_or_weight,
    })
  }

  return items
}
