/**
 * The canonical category taxonomy.
 *
 * SPENDING_CATEGORIES is the list users see and budget against. The first
 * seven have dedicated colors in the frontend (src/lib/chartColors.ts) and
 * must stay in sync with it -- anything past those seven renders in the
 * neutral "Other" color, which is the intended fallback, not a bug.
 *
 * Gambling and crypto are deliberately NOT categories. They're flags set by
 * the rules engine, so a gambling charge can be Entertainment *and* flagged,
 * rather than losing its real category to a risk label.
 *
 * NON_SPEND_CATEGORIES cover money that isn't spending. Counting these as
 * spend is what made totals meaningless before: a salary credit and an
 * account top-up both inflated "spend" once amounts were passed through
 * Math.abs().
 */

export const SPENDING_CATEGORIES = [
  // These seven have fixed colors in the frontend -- keep in sync.
  "Groceries",
  "Eating Out",
  "Transport",
  "Bills & Utilities",
  "Subscriptions",
  "Shopping",
  "Entertainment",
  // Beyond the color palette; render neutral.
  "Health",
  "Travel",
  "Other",
] as const;

export const NON_SPEND_CATEGORIES = [
  "Income",
  "Transfers",
  "Fees",
] as const;

export type SpendingCategory = (typeof SPENDING_CATEGORIES)[number];
export type NonSpendCategory = (typeof NON_SPEND_CATEGORIES)[number];
export type Category = SpendingCategory | NonSpendCategory;

/** Fallback when nothing matches. Deliberately a real category, not "unknown". */
export const DEFAULT_CATEGORY: SpendingCategory = "Other";

const NON_SPEND_SET: ReadonlySet<string> = new Set(NON_SPEND_CATEGORIES);

/**
 * Whether a category counts toward spending totals and budget limits.
 * Fees are excluded: they're real money out, but they aren't discretionary
 * and lumping them into category budgets distorts them.
 */
export function isSpendingCategory(category: string): boolean {
  return !NON_SPEND_SET.has(category);
}
