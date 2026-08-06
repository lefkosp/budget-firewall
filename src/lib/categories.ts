/**
 * Frontend mirror of the backend taxonomy in
 * backend/src/constants/categories.ts. Keep the two in sync.
 *
 * Only the non-spend list is duplicated here, because that's all the UI needs
 * to know: which categories to leave out of spending totals. Income and
 * transfers are real money movements but they aren't spending, and summing
 * them in was making Total Spend meaningless -- a salary credit counted the
 * same as a purchase once the amount went through Math.abs().
 */
const NON_SPEND_CATEGORIES: ReadonlySet<string> = new Set([
  "Income",
  "Transfers",
  "Fees",
]);

/**
 * The categories a user can manually assign. Must match
 * backend/src/constants/categories.ts's SPENDING_CATEGORIES -- income,
 * transfers, and fees are detected automatically and aren't offered here,
 * since hand-assigning them is rarely what a user editing a category badge
 * actually wants.
 */
export const EDITABLE_CATEGORIES = [
  "Groceries",
  "Eating Out",
  "Transport",
  "Bills & Utilities",
  "Subscriptions",
  "Shopping",
  "Entertainment",
  "Health",
  "Travel",
  "Other",
] as const;

export function isSpendingCategory(category: string | undefined): boolean {
  return !NON_SPEND_CATEGORIES.has(category ?? "");
}

/** Filters a transaction list down to actual spending. */
export function onlySpending<T extends { computedCategory?: string }>(
  transactions: T[]
): T[] {
  return transactions.filter((tx) => isSpendingCategory(tx.computedCategory));
}
