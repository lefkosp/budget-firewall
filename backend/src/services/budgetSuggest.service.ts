import { SPENDING_CATEGORIES, isSpendingCategory } from "../constants/categories";

export interface BudgetSuggestionInput {
  computedCategory: string;
  amount: number; // cents; negative = money out
  bookedAt: string | Date;
}

export interface CategorySuggestion {
  category: string;
  median: number; // cents, over the analyzed months (zero-filled)
  p75: number; // cents
  monthsAnalyzed: number;
  suggested: number; // cents, rounded to a round-number cap
  highVariance: boolean;
  rationale: string;
}

/** Rounds a suggested cap to a number a human would actually pick. */
function roundToNiceAmount(cents: number): number {
  const step = cents < 10000 ? 500 : 1000; // under €100 -> nearest €5, else nearest €10
  return Math.round(cents / step) * step;
}

function median(sorted: number[]): number {
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Linear-interpolation percentile (matches Excel's PERCENTILE.INC / "R-7"). */
function percentile(sorted: number[], p: number): number {
  const n = sorted.length;
  if (n === 1) return sorted[0];
  const rank = p * (n - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  const weight = rank - lower;
  return sorted[lower] + weight * (sorted[upper] - sorted[lower]);
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Builds the list of full, completed calendar months to analyze: up to the
 * 6 most recent completed months, clipped to not extend before the
 * account's earliest transaction (there's no such thing as a legitimate
 * "€0 month" before the account had any data at all).
 */
function buildAnalysisWindow(earliestTx: Date, now: Date): Date[] {
  const lastFullMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const earliestTxMonth = new Date(earliestTx.getFullYear(), earliestTx.getMonth(), 1);

  const months: Date[] = [];
  for (let i = 0; i < 6; i++) {
    const month = new Date(lastFullMonth.getFullYear(), lastFullMonth.getMonth() - i, 1);
    if (month < earliestTxMonth) break;
    months.push(month);
  }
  return months.reverse();
}

/**
 * Suggests a monthly budget per spending category from historical spend.
 * Uses the median across the analyzed months (zero-filled for months with
 * no spend in that category) so a single one-off purchase doesn't inflate
 * the suggestion -- p75 is surfaced alongside it as the "swings up to"
 * upper band.
 */
export function suggestBudgets(
  transactions: BudgetSuggestionInput[],
  now: Date = new Date()
): CategorySuggestion[] {
  if (transactions.length === 0) return [];

  const earliestTx = transactions.reduce(
    (min, tx) => {
      const d = new Date(tx.bookedAt);
      return d < min ? d : min;
    },
    new Date(transactions[0].bookedAt)
  );

  const months = buildAnalysisWindow(earliestTx, now);
  if (months.length === 0) return [];

  const monthKeys = months.map(monthKey);
  const monthIndex = new Map(monthKeys.map((key, i) => [key, i]));

  // category -> per-month totals (cents, positive magnitude), zero-filled
  const categoryMonthlyTotals = new Map<string, number[]>();
  for (const category of SPENDING_CATEGORIES) {
    categoryMonthlyTotals.set(category, new Array(months.length).fill(0));
  }

  for (const tx of transactions) {
    if (tx.amount >= 0) continue; // only money out
    if (!isSpendingCategory(tx.computedCategory)) continue;

    const key = monthKey(new Date(tx.bookedAt));
    const idx = monthIndex.get(key);
    if (idx === undefined) continue; // outside the analysis window

    const totals =
      categoryMonthlyTotals.get(tx.computedCategory) ??
      // A category outside the known taxonomy (shouldn't normally happen,
      // but transactions are user data) -- track it too rather than drop it.
      (() => {
        const fresh = new Array(months.length).fill(0);
        categoryMonthlyTotals.set(tx.computedCategory, fresh);
        return fresh;
      })();
    totals[idx] += Math.abs(tx.amount);
  }

  const suggestions: CategorySuggestion[] = [];
  for (const [category, totals] of categoryMonthlyTotals) {
    const sorted = [...totals].sort((a, b) => a - b);
    // Percentile interpolation can land between whole cents; round before
    // this ever reaches currency formatting or a comparison.
    const med = Math.round(median(sorted));
    const p75 = Math.round(percentile(sorted, 0.75));
    const suggested = roundToNiceAmount(med);
    const highVariance = med > 0 ? p75 >= med * 1.5 : p75 > 0;

    suggestions.push({
      category,
      median: med,
      p75,
      monthsAnalyzed: months.length,
      suggested,
      highVariance,
      rationale: highVariance
        ? `Your ${category} spend swings from around €${(med / 100).toFixed(0)} to €${(p75 / 100).toFixed(0)} a month -- consider a cap around €${(suggested / 100).toFixed(0)}.`
        : `Based on your last ${months.length} month${months.length === 1 ? "" : "s"}, you typically spend around €${(med / 100).toFixed(0)}/month on ${category}.`,
    });
  }

  return suggestions;
}

/**
 * Overrides the Subscriptions category's suggestion with the detected
 * recurring monthly total. Subscriptions are contractual, not discretionary
 * -- the right budget for them is "what you're actually committed to pay",
 * not a historical median that lags behind a new sign-up or a cancellation.
 */
export function applySubscriptionsOverride(
  suggestions: CategorySuggestion[],
  recurringMonthlyTotal: number
): CategorySuggestion[] {
  return suggestions.map((s) => {
    if (s.category !== "Subscriptions") return s;
    // Not rounded -- this is what you're actually contractually paying,
    // not a stats-derived estimate that should look like a round number.
    const suggested = recurringMonthlyTotal;
    return {
      ...s,
      suggested,
      highVariance: false,
      rationale: `Based on your detected recurring charges, you're paying about €${(suggested / 100).toFixed(0)}/month in subscriptions.`,
    };
  });
}
