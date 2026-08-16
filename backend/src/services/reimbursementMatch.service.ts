import { isSpendingCategory } from "../constants/categories";

/**
 * Suggests which of a user's own spend transactions a P2P inflow ("Transfer
 * from Family Member A") might be reimbursing -- e.g. money fronted for a
 * friend that they paid back. Pure function over plain arrays, no database,
 * so it's directly unit-testable (mirrors intentMatch.service.ts). Never
 * auto-links -- reimbursement.service.ts presents this as suggestions for
 * the user to confirm.
 */

export interface ReimbursementCandidateInput {
  id: string;
  amount: number; // cents; negative = money out
  bookedAt: string | Date;
  computedCategory: string;
  /** cents not yet claimed by an existing reimbursement link */
  remainingAmount: number;
}

export interface ReimbursementInflowInput {
  bookedAt: string | Date;
  /** cents not yet claimed by an existing reimbursement link */
  remainingAmount: number;
}

export interface ReimbursementSuggestion {
  transactionId: string;
  suggestedAmount: number; // cents -- min(candidate's remaining, inflow's remaining)
  daysBefore: number; // how long before the inflow the spend happened
  exactAmountMatch: boolean;
}

/**
 * How far back a spend can sit and still be suggested as reimbursed by a
 * later inflow. Money that arrives weeks or months after a purchase is more
 * likely unrelated income than a delayed payback -- and a spend *after* the
 * inflow is never a candidate at all: the "spend 50 for a friend, get repaid
 * 50, then spend the same 50 on something else" case only wants the first
 * expense linked, never the second.
 */
export const MATCH_WINDOW_DAYS = 30;
const MAX_SUGGESTIONS = 5;
const DAY_MS = 1000 * 60 * 60 * 24;

export function suggestReimbursementMatches(
  inflow: ReimbursementInflowInput,
  candidates: ReimbursementCandidateInput[]
): ReimbursementSuggestion[] {
  if (inflow.remainingAmount <= 0) return [];

  const inflowTime = new Date(inflow.bookedAt).getTime();

  const scored = candidates
    .filter((tx) => tx.amount < 0 && tx.remainingAmount > 0)
    .filter((tx) => isSpendingCategory(tx.computedCategory))
    .map((tx) => ({
      tx,
      daysBefore: (inflowTime - new Date(tx.bookedAt).getTime()) / DAY_MS,
    }))
    .filter((s) => s.daysBefore >= 0 && s.daysBefore <= MATCH_WINDOW_DAYS)
    .map(({ tx, daysBefore }) => {
      const suggestedAmount = Math.min(tx.remainingAmount, inflow.remainingAmount);
      const exactAmountMatch = tx.remainingAmount === inflow.remainingAmount;
      const amountDiffRatio =
        Math.abs(tx.remainingAmount - inflow.remainingAmount) /
        Math.max(tx.remainingAmount, inflow.remainingAmount);
      return { tx, daysBefore, suggestedAmount, exactAmountMatch, amountDiffRatio };
    })
    .sort((a, b) => {
      if (a.exactAmountMatch !== b.exactAmountMatch) return a.exactAmountMatch ? -1 : 1;
      const scoreA = a.amountDiffRatio + a.daysBefore / MATCH_WINDOW_DAYS;
      const scoreB = b.amountDiffRatio + b.daysBefore / MATCH_WINDOW_DAYS;
      return scoreA - scoreB;
    });

  return scored.slice(0, MAX_SUGGESTIONS).map((s) => ({
    transactionId: s.tx.id,
    suggestedAmount: s.suggestedAmount,
    daysBefore: Math.round(s.daysBefore * 10) / 10,
    exactAmountMatch: s.exactAmountMatch,
  }));
}
