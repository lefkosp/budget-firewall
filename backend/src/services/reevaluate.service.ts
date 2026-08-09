import { evaluateTransaction, BudgetSnapshot, RuleInput } from "../utils/evaluateRules";
import { DEFAULT_CATEGORY, isSpendingCategory } from "../constants/categories";
import { monthKey } from "../utils/monthWindow";

export interface ReevaluateTransactionInput {
  id: string;
  merchantNameNormalized: string;
  providerCategory?: string | null;
  computedCategory: string;
  amount: number; // cents
  currency: string;
  bookedAt: string | Date;
}

export interface ReevaluateResult {
  id: string;
  isGambling: boolean;
  isCrypto: boolean;
  isBlacklisted: boolean;
  isOverBudget: boolean;
  approvalRequired: boolean;
  approvalStatus: "NEUTRAL" | "PENDING" | "APPROVED" | "DENIED" | "VIOLATION";
}

/**
 * Re-runs rule + budget evaluation across a batch of transactions spanning
 * any date range -- unlike the import-time evaluator (which only ever sees
 * "now"'s month), this has to reconstruct each transaction's own month
 * context so a €2,000 January charge isn't checked against August's budget
 * spend. Budget accumulators reset at each calendar-month boundary and
 * transactions are processed in chronological order within their month,
 * mirroring how spend actually accrues over time -- regardless of what
 * order they're passed in.
 */
export function reevaluateTransactions(
  transactions: ReevaluateTransactionInput[],
  rules: RuleInput[],
  budgetLimits: { category: string; limit: number }[]
): ReevaluateResult[] {
  const byMonth = new Map<string, ReevaluateTransactionInput[]>();
  for (const tx of transactions) {
    const key = monthKey(new Date(tx.bookedAt));
    const list = byMonth.get(key) ?? [];
    list.push(tx);
    byMonth.set(key, list);
  }

  const resultsById = new Map<string, ReevaluateResult>();

  for (const monthTxs of byMonth.values()) {
    const budgetSnapshot: BudgetSnapshot[] = budgetLimits.map((b) => ({
      category: b.category,
      spent: 0,
      limit: b.limit,
    }));

    const chronological = [...monthTxs].sort(
      (a, b) => new Date(a.bookedAt).getTime() - new Date(b.bookedAt).getTime()
    );

    for (const tx of chronological) {
      const evaluation = evaluateTransaction(
        {
          merchantNameNormalized: tx.merchantNameNormalized,
          providerCategory: tx.providerCategory ?? null,
          computedCategory: tx.computedCategory,
          amount: tx.amount,
          currency: tx.currency,
        },
        rules,
        budgetSnapshot
      );

      resultsById.set(tx.id, { id: tx.id, ...evaluation });

      // Budgets are EUR-denominated -- a non-EUR charge doesn't accrue
      // against them (see evaluateTransaction's budget check).
      const category = tx.computedCategory || DEFAULT_CATEGORY;
      if (tx.currency === "EUR" && isSpendingCategory(category)) {
        const budget = budgetSnapshot.find((b) => b.category === category);
        if (budget) budget.spent += Math.abs(tx.amount);
      }
    }
  }

  // Return in the caller's original order.
  return transactions.map((tx) => resultsById.get(tx.id)!);
}
