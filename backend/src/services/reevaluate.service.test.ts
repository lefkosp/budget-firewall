import { describe, it, expect } from "vitest";
import { reevaluateTransactions, ReevaluateTransactionInput } from "./reevaluate.service";
import { RuleType } from "../models/Rule";

function tx(
  id: string,
  merchant: string,
  category: string,
  amountCents: number,
  date: string,
  currency = "EUR"
): ReevaluateTransactionInput {
  return {
    id,
    merchantNameNormalized: merchant,
    computedCategory: category,
    amount: amountCents,
    currency,
    bookedAt: date,
  };
}

const THRESHOLD_RULE = { type: RuleType.APPROVAL_THRESHOLD, enabled: true, config: { amountCents: 5000 } };
const BLACKLIST_RULE = (merchants: string[]) => ({
  type: RuleType.MERCHANT_BLACKLIST,
  enabled: true,
  config: { merchants },
});
const GAMBLING_RULE = { type: RuleType.GAMBLING, enabled: true, config: {} };

describe("reevaluateTransactions", () => {
  it("flags a blacklisted merchant regardless of amount", () => {
    const results = reevaluateTransactions(
      [tx("1", "shady shop", "Shopping", -1000, "2026-06-01")],
      [BLACKLIST_RULE(["shady shop"])],
      []
    );
    expect(results[0].isBlacklisted).toBe(true);
    expect(results[0].approvalStatus).toBe("VIOLATION");
  });

  it("flags spend over the approval threshold as PENDING", () => {
    const results = reevaluateTransactions(
      [tx("1", "ikea", "Shopping", -6000, "2026-06-01")],
      [THRESHOLD_RULE],
      []
    );
    expect(results[0].approvalRequired).toBe(true);
    expect(results[0].approvalStatus).toBe("PENDING");
  });

  it("resets the over-budget accumulator at each new calendar month", () => {
    // Same category, two different months, €30 limit each. Two €20 charges
    // in the same month should trip over-budget; the same two charges
    // split across two different months should not.
    const sameMonth = reevaluateTransactions(
      [
        tx("1", "shop", "Shopping", -2000, "2026-06-05"),
        tx("2", "shop", "Shopping", -2000, "2026-06-20"),
      ],
      [],
      [{ category: "Shopping", limit: 3000 }]
    );
    expect(sameMonth[1].isOverBudget).toBe(true);

    const differentMonths = reevaluateTransactions(
      [
        tx("1", "shop", "Shopping", -2000, "2026-05-05"),
        tx("2", "shop", "Shopping", -2000, "2026-06-05"),
      ],
      [],
      [{ category: "Shopping", limit: 3000 }]
    );
    expect(differentMonths[0].isOverBudget).toBe(false);
    expect(differentMonths[1].isOverBudget).toBe(false);
  });

  it("evaluates transactions within a month in chronological order regardless of input order", () => {
    // Fed in reverse chronological order -- the accumulator must still
    // process the 5th before the 20th for the over-budget flag to land on
    // the right transaction.
    const results = reevaluateTransactions(
      [
        tx("2", "shop", "Shopping", -2000, "2026-06-20"),
        tx("1", "shop", "Shopping", -2000, "2026-06-05"),
      ],
      [],
      [{ category: "Shopping", limit: 3000 }]
    );
    const byId = Object.fromEntries(results.map((r) => [r.id, r]));
    expect(byId["1"].isOverBudget).toBe(false);
    expect(byId["2"].isOverBudget).toBe(true);
  });

  it("does not flag income or transfers against a budget limit", () => {
    const results = reevaluateTransactions(
      [tx("1", "salary", "Income", 500000, "2026-06-01")],
      [],
      [{ category: "Income", limit: 100 }]
    );
    expect(results[0].isOverBudget).toBe(false);
    expect(results[0].approvalStatus).toBe("NEUTRAL");
  });

  it("skips disabled rules", () => {
    const results = reevaluateTransactions(
      [tx("1", "bet365", "Entertainment", -1000, "2026-06-01")],
      [{ ...GAMBLING_RULE, enabled: false }],
      []
    );
    expect(results[0].isGambling).toBe(false);
    expect(results[0].approvalStatus).toBe("NEUTRAL");
  });

  it("does not flag a non-EUR transaction against a EUR budget, nor let it inflate later EUR charges' accumulator", () => {
    const results = reevaluateTransactions(
      [
        tx("1", "shop", "Shopping", -5000, "2026-06-05", "USD"),
        tx("2", "shop", "Shopping", -2000, "2026-06-10"),
      ],
      [],
      [{ category: "Shopping", limit: 3000 }]
    );
    expect(results[0].isOverBudget).toBe(false);
    expect(results[1].isOverBudget).toBe(false);
  });

  it("returns one result per input transaction, in the input's original order", () => {
    const results = reevaluateTransactions(
      [
        tx("b", "shop", "Shopping", -1000, "2026-06-20"),
        tx("a", "shop", "Shopping", -1000, "2026-06-05"),
      ],
      [],
      []
    );
    expect(results.map((r) => r.id)).toEqual(["b", "a"]);
  });
});
