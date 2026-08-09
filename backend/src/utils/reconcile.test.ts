import { describe, it, expect } from "vitest";
import { findFuzzyDuplicate, FuzzyMatchCandidate } from "./reconcile";

function csvTransaction(overrides: Partial<FuzzyMatchCandidate> = {}): FuzzyMatchCandidate {
  return {
    id: "csv-1",
    providerTransactionId: "csv_abc123",
    bookedAt: new Date("2026-06-10T00:00:00Z"),
    amount: -2500,
    currency: "EUR",
    merchantNameNormalized: "tesco",
    ...overrides,
  };
}

describe("findFuzzyDuplicate", () => {
  it("finds an exact date+amount+merchant match", () => {
    const candidate = {
      bookedAt: new Date("2026-06-10T00:00:00Z"),
      amount: -2500,
      currency: "EUR",
      merchantNameNormalized: "tesco",
    };
    const result = findFuzzyDuplicate(candidate, [csvTransaction()]);
    expect(result?.id).toBe("csv-1");
  });

  it("still matches when the date is 3 days off", () => {
    const candidate = {
      bookedAt: new Date("2026-06-13T00:00:00Z"),
      amount: -2500,
      currency: "EUR",
      merchantNameNormalized: "tesco",
    };
    const result = findFuzzyDuplicate(candidate, [csvTransaction()]);
    expect(result?.id).toBe("csv-1");
  });

  it("does not match when the date is 4 days off", () => {
    const candidate = {
      bookedAt: new Date("2026-06-14T00:00:01Z"),
      amount: -2500,
      currency: "EUR",
      merchantNameNormalized: "tesco",
    };
    const result = findFuzzyDuplicate(candidate, [csvTransaction()]);
    expect(result).toBeNull();
  });

  it("does not match a 1-cent amount difference -- no tolerance by design", () => {
    const candidate = {
      bookedAt: new Date("2026-06-10T00:00:00Z"),
      amount: -2501,
      currency: "EUR",
      merchantNameNormalized: "tesco",
    };
    const result = findFuzzyDuplicate(candidate, [csvTransaction()]);
    expect(result).toBeNull();
  });

  it("matches merchant containment when the candidate is the longer string", () => {
    const candidate = {
      bookedAt: new Date("2026-06-10T00:00:00Z"),
      amount: -2500,
      currency: "EUR",
      merchantNameNormalized: "tesco stores dublin",
    };
    const result = findFuzzyDuplicate(candidate, [csvTransaction({ merchantNameNormalized: "tesco" })]);
    expect(result?.id).toBe("csv-1");
  });

  it("matches merchant containment when the existing row is the longer string", () => {
    const candidate = {
      bookedAt: new Date("2026-06-10T00:00:00Z"),
      amount: -2500,
      currency: "EUR",
      merchantNameNormalized: "tesco",
    };
    const result = findFuzzyDuplicate(
      candidate,
      [csvTransaction({ merchantNameNormalized: "tesco stores dublin" })]
    );
    expect(result?.id).toBe("csv-1");
  });

  it("excludes a currency mismatch despite an identical amount", () => {
    const candidate = {
      bookedAt: new Date("2026-06-10T00:00:00Z"),
      amount: -2500,
      currency: "USD",
      merchantNameNormalized: "tesco",
    };
    const result = findFuzzyDuplicate(candidate, [csvTransaction({ currency: "EUR" })]);
    expect(result).toBeNull();
  });

  it("excludes candidates that aren't CSV-origin, even with a perfect match otherwise", () => {
    const candidate = {
      bookedAt: new Date("2026-06-10T00:00:00Z"),
      amount: -2500,
      currency: "EUR",
      merchantNameNormalized: "tesco",
    };
    const result = findFuzzyDuplicate(
      candidate,
      [csvTransaction({ providerTransactionId: "nordigen_xyz789" })]
    );
    expect(result).toBeNull();
  });
});
