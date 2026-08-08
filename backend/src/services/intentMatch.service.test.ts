import { describe, it, expect } from "vitest";
import { matchIntents, IntentInput, TransactionForMatching } from "./intentMatch.service";

const NOW = new Date("2026-06-15T00:00:00Z");

function intent(
  id: string,
  merchantText: string,
  amountCents: number,
  expiresAt: string
): IntentInput {
  return { id, merchantText, amount: amountCents, expiresAt };
}

function tx(id: string, merchant: string, amountCents: number): TransactionForMatching {
  return { id, merchantNameNormalized: merchant, amount: -Math.abs(amountCents), bookedAt: NOW };
}

describe("matchIntents", () => {
  it("matches a transaction whose merchant contains the intent's merchant text", () => {
    const results = matchIntents(
      [tx("t1", "ikea dublin", 15000)],
      [intent("i1", "ikea", 15000, "2026-07-01")],
      NOW
    );
    expect(results).toEqual([{ transactionId: "t1", intentId: "i1" }]);
  });

  it("matches case-insensitively", () => {
    const results = matchIntents(
      [tx("t1", "IKEA DUBLIN", 15000)],
      [intent("i1", "ikea", 15000, "2026-07-01")],
      NOW
    );
    expect(results).toHaveLength(1);
  });

  it("allows a small amount tolerance either direction", () => {
    const results = matchIntents(
      [tx("t1", "ikea", 15900)], // 6% over
      [intent("i1", "ikea", 15000, "2026-07-01")],
      NOW
    );
    expect(results).toHaveLength(1);
  });

  it("rejects an amount too far outside tolerance", () => {
    const results = matchIntents(
      [tx("t1", "ikea", 30000)], // 2x
      [intent("i1", "ikea", 15000, "2026-07-01")],
      NOW
    );
    expect(results).toEqual([]);
  });

  it("does not match an expired intent", () => {
    const results = matchIntents(
      [tx("t1", "ikea", 15000)],
      [intent("i1", "ikea", 15000, "2026-06-01")], // expired before NOW
      NOW
    );
    expect(results).toEqual([]);
  });

  it("does not match a merchant that isn't a substring", () => {
    const results = matchIntents(
      [tx("t1", "tesco stores", 15000)],
      [intent("i1", "ikea", 15000, "2026-07-01")],
      NOW
    );
    expect(results).toEqual([]);
  });

  it("never matches a positive amount (income/refund)", () => {
    const results = matchIntents(
      [{ id: "t1", merchantNameNormalized: "ikea", amount: 15000, bookedAt: NOW }],
      [intent("i1", "ikea", 15000, "2026-07-01")],
      NOW
    );
    expect(results).toEqual([]);
  });

  it("consumes an intent so it can't match a second transaction", () => {
    const results = matchIntents(
      [tx("t1", "ikea", 15000), tx("t2", "ikea", 15000)],
      [intent("i1", "ikea", 15000, "2026-07-01")],
      NOW
    );
    expect(results).toEqual([{ transactionId: "t1", intentId: "i1" }]);
  });

  it("picks the intent whose merchant text actually matches when several are pending", () => {
    const results = matchIntents(
      [tx("t1", "spotify", 1199)],
      [
        intent("i1", "ikea", 15000, "2026-07-01"),
        intent("i2", "spotify", 1199, "2026-07-01"),
      ],
      NOW
    );
    expect(results).toEqual([{ transactionId: "t1", intentId: "i2" }]);
  });
});
