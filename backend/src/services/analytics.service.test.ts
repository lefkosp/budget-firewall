import { describe, it, expect, afterEach } from "vitest";
import {
  calculateTransactionTypeStats,
  calculateProductStats,
  calculateTimeStats,
  calculateFeeStats,
  calculateBalanceStats,
  calculateCurrencyStats,
  calculateCategoryStats,
  calculateMerchantStats,
  calculateStateStats,
  buildAnalyticsBundle,
  AnalyticsTransactionInput,
} from "./analytics.service";

const originalTZ = process.env.TZ;
afterEach(() => {
  process.env.TZ = originalTZ;
});

function tx(
  overrides: Partial<AnalyticsTransactionInput> = {}
): AnalyticsTransactionInput {
  return {
    bookedAt: "2026-03-10T00:00:00Z",
    amount: -1000,
    currency: "EUR",
    rawDescription: "Some Merchant",
    merchantNameNormalized: "some merchant",
    computedCategory: "Shopping",
    ...overrides,
  };
}

describe("calculateTransactionTypeStats", () => {
  it("groups by type, sums absolute amounts, and sorts by spend descending", () => {
    const result = calculateTransactionTypeStats([
      tx({ transactionType: "Card Payment", amount: -1000 }),
      tx({ transactionType: "Card Payment", amount: -3000 }),
      tx({ transactionType: "Transfer", amount: -500 }),
    ]);

    expect(result).toEqual([
      { type: "Card Payment", count: 2, totalSpend: 4000, averageAmount: 2000 },
      { type: "Transfer", count: 1, totalSpend: 500, averageAmount: 500 },
    ]);
  });

  it("buckets a missing type as UNKNOWN", () => {
    const result = calculateTransactionTypeStats([tx({ transactionType: undefined })]);
    expect(result[0].type).toBe("UNKNOWN");
  });
});

describe("calculateProductStats", () => {
  it("groups by product and buckets missing as UNKNOWN", () => {
    const result = calculateProductStats([
      tx({ product: "Current", amount: -1000 }),
      tx({ product: undefined, amount: -2000 }),
    ]);
    expect(result.map((r) => r.product)).toEqual(["UNKNOWN", "Current"]);
  });
});

describe("calculateTimeStats", () => {
  it("counts activity by day of week for every transaction, spend only for spending categories", () => {
    const result = calculateTimeStats([
      // 2026-03-09 is a Monday (UTC).
      tx({ bookedAt: "2026-03-09T00:00:00Z", amount: -1000, computedCategory: "Shopping" }),
      tx({ bookedAt: "2026-03-09T00:00:00Z", amount: 50000, computedCategory: "Income" }),
    ]);

    // Both transactions counted as activity...
    expect(result.transactionsByDayOfWeek).toEqual({ Monday: 2 });
    // ...but only the spending one contributes to the spend series.
    expect(result.dailySpending).toEqual([{ date: "2026-03-09", amount: 1000 }]);
    expect(result.monthlySpending).toEqual([{ month: "2026-03", amount: 1000 }]);
  });

  it("derives day-of-week and month from UTC, not server-local time", () => {
    // UTC midnight on the 1st is still the previous month/day in any
    // timezone behind UTC -- the buckets must not move with the server.
    const transactions = [tx({ bookedAt: "2026-03-01T00:00:00Z", amount: -1000 })];

    process.env.TZ = "America/New_York";
    const behind = calculateTimeStats(transactions);
    process.env.TZ = "Pacific/Kiritimati";
    const ahead = calculateTimeStats(transactions);

    expect(behind.monthlySpending).toEqual([{ month: "2026-03", amount: 1000 }]);
    expect(behind.transactionsByDayOfWeek).toEqual({ Sunday: 1 }); // 2026-03-01 UTC
    expect(ahead).toEqual(behind);
  });

  it("averages processing time only over plausible gaps", () => {
    const result = calculateTimeStats([
      // 24h gap -- counted.
      tx({ startedDate: "2026-03-09T00:00:00Z", bookedAt: "2026-03-10T00:00:00Z" }),
      // 30 days -- outside the 0-168h window, ignored.
      tx({ startedDate: "2026-02-08T00:00:00Z", bookedAt: "2026-03-10T00:00:00Z" }),
    ]);
    expect(result.averageProcessingTime).toBe(24);
  });

  it("reports Unknown as peak day when there are no transactions", () => {
    expect(calculateTimeStats([]).peakSpendingDay).toBe("Unknown");
  });
});

describe("calculateCategoryStats", () => {
  it("excludes non-spend categories so a salary doesn't dominate the breakdown", () => {
    const result = calculateCategoryStats([
      tx({ computedCategory: "Groceries", amount: -2000 }),
      tx({ computedCategory: "Income", amount: 500000 }),
      tx({ computedCategory: "Transfers", amount: -100000 }),
      tx({ computedCategory: "Fees", amount: -500 }),
    ]);

    expect(result).toEqual([{ category: "Groceries", count: 1, totalSpend: 2000 }]);
  });
});

describe("calculateMerchantStats", () => {
  it("ranks merchants by spend and excludes non-spend categories", () => {
    const result = calculateMerchantStats([
      tx({ merchantNameNormalized: "lidl", amount: -2000, computedCategory: "Groceries" }),
      tx({ merchantNameNormalized: "lidl", amount: -1000, computedCategory: "Groceries" }),
      tx({ merchantNameNormalized: "employer", amount: 500000, computedCategory: "Income" }),
    ]);

    expect(result).toEqual([
      { merchant: "lidl", count: 2, totalSpend: 3000, averageAmount: 1500 },
    ]);
  });

  it("falls back to the raw description when there is no normalized name", () => {
    const result = calculateMerchantStats([
      tx({ merchantNameNormalized: "", rawDescription: "ODD RAW THING" }),
    ]);
    expect(result[0].merchant).toBe("ODD RAW THING");
  });
});

describe("calculateCurrencyStats", () => {
  it("groups by currency", () => {
    const result = calculateCurrencyStats([
      tx({ currency: "EUR", amount: -1000 }),
      tx({ currency: "USD", amount: -3000 }),
    ]);
    expect(result.map((r) => r.currency)).toEqual(["USD", "EUR"]);
  });
});

describe("calculateBalanceStats", () => {
  it("tracks balance in date order regardless of input order", () => {
    const result = calculateBalanceStats([
      tx({ bookedAt: "2026-03-10T00:00:00Z", balance: 5000, product: "Current" }),
      tx({ bookedAt: "2026-03-08T00:00:00Z", balance: 3000, product: "Current" }),
      tx({ bookedAt: "2026-03-09T00:00:00Z", balance: 9000, product: "Current" }),
    ]);

    expect(result.currentBalance).toBe(5000); // latest by date
    expect(result.balanceChange).toBe(2000); // 5000 - 3000
    expect(result.lowestBalance).toBe(3000);
    expect(result.highestBalance).toBe(9000);
    expect(result.balanceOverTime.map((b) => b.date)).toEqual([
      "2026-03-08",
      "2026-03-09",
      "2026-03-10",
    ]);
    expect(result.balanceByProduct).toEqual({ Current: 3000 }); // first seen in date order
  });

  it("returns zeros when no transaction carries a balance", () => {
    const result = calculateBalanceStats([tx({ balance: undefined })]);
    expect(result).toMatchObject({
      currentBalance: 0,
      balanceChange: 0,
      lowestBalance: 0,
      highestBalance: 0,
      balanceOverTime: [],
    });
  });
});

describe("stubs (documented as such -- behavior preserved from the frontend original)", () => {
  it("calculateFeeStats returns zeros regardless of input, since fees are folded into amount at import", () => {
    const result = calculateFeeStats([
      tx({ computedCategory: "Fees", amount: -699 }),
      tx({ computedCategory: "Fees", amount: -599 }),
    ]);
    expect(result).toEqual({
      totalFees: 0,
      averageFee: 0,
      highestFee: 0,
      feesByType: {},
      feeTrends: [],
    });
  });

  it("calculateStateStats buckets everything as completed", () => {
    expect(calculateStateStats([tx(), tx(), tx()])).toEqual([
      { state: "completed", count: 3, percentage: 100 },
    ]);
    expect(calculateStateStats([])).toEqual([]);
  });
});

describe("buildAnalyticsBundle", () => {
  it("returns every dataset plus the transaction count", () => {
    const bundle = buildAnalyticsBundle([tx(), tx({ computedCategory: "Income", amount: 5000 })]);

    expect(Object.keys(bundle).sort()).toEqual(
      [
        "balanceStats",
        "categoryStats",
        "currencyStats",
        "feeStats",
        "merchantStats",
        "productStats",
        "stateStats",
        "timeStats",
        "totalTransactions",
        "transactionTypeStats",
      ].sort()
    );
    expect(bundle.totalTransactions).toBe(2);
  });

  it("handles an empty transaction set without throwing", () => {
    const bundle = buildAnalyticsBundle([]);
    expect(bundle.totalTransactions).toBe(0);
    expect(bundle.categoryStats).toEqual([]);
    expect(bundle.timeStats.peakSpendingDay).toBe("Unknown");
  });
});
