import { describe, it, expect } from "vitest";
import {
  suggestBudgets,
  applySubscriptionsOverride,
  BudgetSuggestionInput,
} from "./budgetSuggest.service";

const NOW = new Date("2026-08-08T00:00:00Z"); // last full month = Jul 2026

function tx(category: string, amountCents: number, date: string): BudgetSuggestionInput {
  return { computedCategory: category, amount: -Math.abs(amountCents), bookedAt: date };
}

describe("suggestBudgets", () => {
  it("suggests the median monthly spend for a steady category", () => {
    const transactions = [
      tx("Groceries", 40000, "2026-05-10"),
      tx("Groceries", 42000, "2026-06-10"),
      tx("Groceries", 41000, "2026-07-10"),
    ];

    const suggestions = suggestBudgets(transactions, NOW);
    const groceries = suggestions.find((s) => s.category === "Groceries")!;

    expect(groceries.monthsAnalyzed).toBe(3);
    expect(groceries.median).toBe(41000);
    expect(groceries.suggested).toBe(41000);
  });

  it("suppresses a one-off spike via the median rather than averaging it in", () => {
    // Five quiet months and one €800 spike -- a mean would drag the
    // suggestion way up; the median should stay near the quiet baseline.
    const transactions = [
      tx("Travel", 5000, "2026-02-05"),
      tx("Travel", 4000, "2026-03-05"),
      tx("Travel", 80000, "2026-04-05"), // spike
      tx("Travel", 6000, "2026-05-05"),
      tx("Travel", 5000, "2026-06-05"),
      tx("Travel", 4000, "2026-07-05"),
    ];

    const suggestions = suggestBudgets(transactions, NOW);
    const travel = suggestions.find((s) => s.category === "Travel")!;

    expect(travel.monthsAnalyzed).toBe(6);
    expect(travel.median).toBe(5000);
    expect(travel.suggested).toBe(5000);
    expect(travel.p75).toBeGreaterThan(travel.median);
  });

  it("zero-fills months with no spend in a category, not just the months with data", () => {
    // A single €400 trip in an account with 4 full months of history
    // (April through July) should not suggest €400/month -- the other
    // 3 months genuinely spent €0 on Travel.
    const transactions = [tx("Travel", 40000, "2026-04-05")];

    const suggestions = suggestBudgets(transactions, NOW);
    const travel = suggestions.find((s) => s.category === "Travel")!;

    expect(travel.monthsAnalyzed).toBe(4);
    expect(travel.median).toBe(0);
    expect(travel.suggested).toBe(0);
  });

  it("caps the analysis window at 6 full months even with older history", () => {
    const transactions = [
      tx("Groceries", 10000, "2025-01-10"), // way outside the window
      tx("Groceries", 40000, "2026-02-10"),
      tx("Groceries", 40000, "2026-03-10"),
      tx("Groceries", 40000, "2026-04-10"),
      tx("Groceries", 40000, "2026-05-10"),
      tx("Groceries", 40000, "2026-06-10"),
      tx("Groceries", 40000, "2026-07-10"),
    ];

    const suggestions = suggestBudgets(transactions, NOW);
    const groceries = suggestions.find((s) => s.category === "Groceries")!;

    expect(groceries.monthsAnalyzed).toBe(6);
  });

  it("only counts full completed months, never the current partial month", () => {
    const transactions = [
      tx("Groceries", 40000, "2026-07-10"),
      tx("Groceries", 999999, "2026-08-05"), // current month -- must be excluded
    ];

    const suggestions = suggestBudgets(transactions, NOW);
    const groceries = suggestions.find((s) => s.category === "Groceries")!;

    expect(groceries.monthsAnalyzed).toBe(1);
    expect(groceries.median).toBe(40000);
  });

  it("shrinks the analysis window to the account's actual history", () => {
    // Account only has 2 full months of history -- must not zero-fill
    // months before the account existed.
    const transactions = [
      tx("Groceries", 40000, "2026-06-10"),
      tx("Groceries", 60000, "2026-07-10"),
    ];

    const suggestions = suggestBudgets(transactions, NOW);
    const groceries = suggestions.find((s) => s.category === "Groceries")!;

    expect(groceries.monthsAnalyzed).toBe(2);
    expect(groceries.median).toBe(50000);
  });

  it("returns no suggestions when there is no completed month of history", () => {
    const transactions = [tx("Groceries", 40000, "2026-08-05")]; // current month only

    const suggestions = suggestBudgets(transactions, NOW);
    expect(suggestions).toEqual([]);
  });

  it("excludes non-spending categories from output", () => {
    const transactions = [
      tx("Income", 300000, "2026-07-01"),
      tx("Transfers", 20000, "2026-07-02"),
      tx("Fees", 500, "2026-07-03"),
      tx("Groceries", 40000, "2026-07-10"),
    ];

    const suggestions = suggestBudgets(transactions, NOW);
    const categories = suggestions.map((s) => s.category);

    expect(categories).not.toContain("Income");
    expect(categories).not.toContain("Transfers");
    expect(categories).not.toContain("Fees");
    expect(categories).toContain("Groceries");
  });

  it("flags high variance when p75 diverges sharply from the median", () => {
    const transactions = [
      tx("Shopping", 8000, "2026-02-10"),
      tx("Shopping", 60000, "2026-03-10"),
      tx("Shopping", 8000, "2026-04-10"),
      tx("Shopping", 60000, "2026-05-10"),
      tx("Shopping", 8000, "2026-06-10"),
      tx("Shopping", 60000, "2026-07-10"),
    ];

    const suggestions = suggestBudgets(transactions, NOW);
    const shopping = suggestions.find((s) => s.category === "Shopping")!;

    expect(shopping.highVariance).toBe(true);
    expect(shopping.rationale).toMatch(/swings/i);
  });

  it("covers every spending category even with zero history", () => {
    const suggestions = suggestBudgets(
      [tx("Groceries", 40000, "2026-07-10")],
      NOW
    );
    const categories = suggestions.map((s) => s.category);

    expect(categories).toContain("Entertainment");
    expect(categories).toContain("Health");
    const entertainment = suggestions.find((s) => s.category === "Entertainment")!;
    expect(entertainment.median).toBe(0);
    expect(entertainment.suggested).toBe(0);
  });
});

describe("applySubscriptionsOverride", () => {
  it("replaces the Subscriptions suggestion with the detected recurring total", () => {
    const suggestions = suggestBudgets(
      [
        tx("Subscriptions", 1000, "2026-06-10"),
        tx("Subscriptions", 1000, "2026-07-10"),
      ],
      NOW
    );

    const overridden = applySubscriptionsOverride(suggestions, 3298);
    const subs = overridden.find((s) => s.category === "Subscriptions")!;

    expect(subs.suggested).toBe(3298);
    expect(subs.rationale).toMatch(/recurring/i);
  });

  it("is a no-op on an empty suggestion list", () => {
    const overridden = applySubscriptionsOverride([], 3298);
    expect(overridden).toEqual([]);
  });
});
