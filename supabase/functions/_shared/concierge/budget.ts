/** Both hard and currently conservative soft budgets cap food subtotal only. */
export function withinMenuBudget(subtotal: number, budget: number | null | undefined): boolean {
  return Number.isSafeInteger(subtotal) && subtotal >= 0 &&
    (budget == null || Number.isSafeInteger(budget) && budget >= 0 && subtotal <= budget)
}
export function remainingMenuBudget(budget: number | null | undefined, existingSubtotal: number): number | undefined {
  if (budget == null) return undefined
  if (!Number.isSafeInteger(budget) || budget < 0 || !Number.isSafeInteger(existingSubtotal) || existingSubtotal < 0) return 0
  return Math.max(0, budget - existingSubtotal)
}
