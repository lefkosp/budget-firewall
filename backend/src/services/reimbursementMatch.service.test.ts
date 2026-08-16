import { describe, it, expect } from "vitest";
import {
  suggestReimbursementMatches,
  ReimbursementCandidateInput,
  ReimbursementInflowInput,
  MATCH_WINDOW_DAYS,
} from "./reimbursementMatch.service";

function inflow(bookedAt: string, remainingAmount: number): ReimbursementInflowInput {
  return { bookedAt, remainingAmount };
}

function spend(
  id: string,
  bookedAt: string,
  amountCents: number,
  category = "Eating Out",
  remainingAmount = amountCents
): ReimbursementCandidateInput {
  return {
    id,
    bookedAt,
    amount: -Math.abs(amountCents),
    computedCategory: category,
    remainingAmount,
  };
}

describe("suggestReimbursementMatches", () => {
  it("suggests an exact-amount spend that happened before the inflow", () => {
    const results = suggestReimbursementMatches(inflow("2026-08-10", 5000), [
      spend("t1", "2026-08-05", 5000),
    ]);
    expect(results).toEqual([
      { transactionId: "t1", suggestedAmount: 5000, daysBefore: 5, exactAmountMatch: true },
    ]);
  });

  it("never suggests a spend that happened after the inflow", () => {
    // "fronted 50, got repaid 50, then spent that 50 on something else" --
    // the second spend must never be offered as a match for the reimbursement
    // that funded it.
    const results = suggestReimbursementMatches(inflow("2026-08-10", 5000), [
      spend("t1", "2026-08-15", 5000),
    ]);
    expect(results).toEqual([]);
  });

  it("rejects a spend outside the match window", () => {
    const results = suggestReimbursementMatches(inflow("2026-08-10", 5000), [
      spend("t1", "2026-06-01", 5000), // well over MATCH_WINDOW_DAYS earlier
    ]);
    expect(results).toEqual([]);
    expect(MATCH_WINDOW_DAYS).toBeLessThan(70);
  });

  it("ranks an exact amount match ahead of a closer-in-time partial match", () => {
    const results = suggestReimbursementMatches(inflow("2026-08-10", 5000), [
      spend("t1", "2026-08-09", 4000), // 1 day away, but only 80% of the amount
      spend("t2", "2026-08-01", 5000), // 9 days away, exact amount
    ]);
    expect(results[0].transactionId).toBe("t2");
    expect(results[0].exactAmountMatch).toBe(true);
  });

  it("suggests a partial amount when the spend is larger than the inflow", () => {
    const results = suggestReimbursementMatches(inflow("2026-08-10", 3000), [
      spend("t1", "2026-08-05", 5000),
    ]);
    expect(results).toEqual([
      { transactionId: "t1", suggestedAmount: 3000, daysBefore: 5, exactAmountMatch: false },
    ]);
  });

  it("skips a candidate with nothing left to link", () => {
    const results = suggestReimbursementMatches(inflow("2026-08-10", 5000), [
      spend("t1", "2026-08-05", 5000, "Eating Out", 0),
    ]);
    expect(results).toEqual([]);
  });

  it("returns nothing when the inflow itself is fully linked already", () => {
    const results = suggestReimbursementMatches(inflow("2026-08-10", 0), [
      spend("t1", "2026-08-05", 5000),
    ]);
    expect(results).toEqual([]);
  });

  it("excludes non-spend categories (income, transfers, fees)", () => {
    const results = suggestReimbursementMatches(inflow("2026-08-10", 5000), [
      spend("t1", "2026-08-05", 5000, "Transfers"),
      spend("t2", "2026-08-05", 5000, "Income"),
      spend("t3", "2026-08-05", 5000, "Fees"),
    ]);
    expect(results).toEqual([]);
  });

  it("excludes a positive-amount transaction even if mislabeled as spend", () => {
    const results = suggestReimbursementMatches(inflow("2026-08-10", 5000), [
      { id: "t1", bookedAt: "2026-08-05", amount: 5000, computedCategory: "Eating Out", remainingAmount: 5000 },
    ]);
    expect(results).toEqual([]);
  });

  it("caps suggestions and sorts best-first", () => {
    const candidates = Array.from({ length: 8 }, (_, i) =>
      spend(`t${i}`, "2026-08-09", 5000 - i * 100)
    );
    const results = suggestReimbursementMatches(inflow("2026-08-10", 5000), candidates);
    expect(results.length).toBeLessThanOrEqual(5);
    expect(results[0].transactionId).toBe("t0"); // t0 is the exact match
  });
});
