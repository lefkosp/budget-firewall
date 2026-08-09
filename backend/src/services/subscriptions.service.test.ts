import { describe, it, expect } from "vitest";
import { detectSubscriptions, SubscriptionTransactionInput } from "./subscriptions.service";

const NOW = new Date("2026-04-15T00:00:00Z");

function tx(
  merchant: string,
  amountCents: number,
  date: string
): SubscriptionTransactionInput {
  return { merchantNameNormalized: merchant, amount: amountCents, bookedAt: date };
}

describe("detectSubscriptions", () => {
  it("detects a clean monthly subscription as active", () => {
    const result = detectSubscriptions(
      [
        tx("netflix", -1599, "2026-01-15"),
        tx("netflix", -1599, "2026-02-15"),
        tx("netflix", -1599, "2026-03-15"),
        tx("netflix", -1599, "2026-04-14"),
      ],
      NOW
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      merchant: "netflix",
      amount: 1599,
      cadence: "monthly",
      status: "active",
      occurrences: 4,
    });
  });

  it("detects a weekly subscription", () => {
    const result = detectSubscriptions(
      [
        tx("meal kit co", -3500, "2026-03-18"),
        tx("meal kit co", -3500, "2026-03-25"),
        tx("meal kit co", -3500, "2026-04-01"),
        tx("meal kit co", -3500, "2026-04-08"),
      ],
      NOW
    );

    expect(result).toHaveLength(1);
    expect(result[0].cadence).toBe("weekly");
    expect(result[0].status).toBe("active");
  });

  it("detects a yearly subscription", () => {
    const result = detectSubscriptions(
      [
        tx("domain registrar", -1200, "2024-04-10"),
        tx("domain registrar", -1200, "2025-04-12"),
        tx("domain registrar", -1200, "2026-04-09"),
      ],
      NOW
    );

    expect(result).toHaveLength(1);
    expect(result[0].cadence).toBe("yearly");
  });

  it("flags a price increase as price-changed", () => {
    const result = detectSubscriptions(
      [
        tx("spotify", -999, "2026-01-20"),
        tx("spotify", -999, "2026-02-20"),
        tx("spotify", -999, "2026-03-20"),
        tx("spotify", -1199, "2026-04-14"), // price bump on the latest charge
      ],
      NOW
    );

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("price-changed");
    expect(result[0].amount).toBe(1199); // reflects the current price
  });

  it("flags a subscription that stopped charging as possibly-cancelled", () => {
    const result = detectSubscriptions(
      [
        tx("gym membership", -4000, "2025-12-01"),
        tx("gym membership", -4000, "2026-01-01"),
        tx("gym membership", -4000, "2026-02-01"),
        // no March or April charge -- well past the monthly grace window by NOW (Apr 15)
      ],
      NOW
    );

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("possibly-cancelled");
  });

  it("does not flag irregular one-off purchases at the same merchant", () => {
    // Same supermarket, wildly different amounts and no regular interval --
    // this is grocery shopping, not a subscription.
    const result = detectSubscriptions(
      [
        tx("supermarket", -1230, "2026-01-03"),
        tx("supermarket", -4500, "2026-01-19"),
        tx("supermarket", -800, "2026-02-02"),
        tx("supermarket", -6200, "2026-03-28"),
      ],
      NOW
    );

    expect(result).toHaveLength(0);
  });

  it("requires at least one occurrence to even consider a merchant", () => {
    const result = detectSubscriptions([tx("netflix", -1599, "2026-03-15")], NOW);
    expect(result).toHaveLength(0);
  });

  it("ignores incoming money", () => {
    const result = detectSubscriptions(
      [
        tx("acme corp", 320000, "2026-02-01"),
        tx("acme corp", 320000, "2026-03-01"),
        tx("acme corp", 320000, "2026-04-01"),
      ],
      NOW
    );
    expect(result).toHaveLength(0);
  });

  it("rejects two occurrences even with a matching cadence gap and identical amounts", () => {
    // Two same-amount, cadence-matching charges are exactly what you'd see
    // from either a genuine new subscription OR two unrelated one-off
    // purchases that happened to land ~30 days apart -- with only one gap
    // and no second historical amount to check consistency against, there's
    // no way to tell them apart. Industry practice (Plaid, Ramp) requires
    // 3+ occurrences before treating a merchant as a confirmed recurring
    // series; 1-2 occurrences is "early detection" at best, not confirmed.
    const result = detectSubscriptions(
      [tx("netflix", -1599, "2026-02-14"), tx("netflix", -1599, "2026-03-16")],
      NOW
    );
    expect(result).toHaveLength(0);
  });

  it("rejects two occurrences with wildly different amounts (the false-positive this minimum exists to prevent)", () => {
    // A merchant charged once, then again a week later for a totally
    // different amount -- two unrelated one-off charges, not a weekly
    // subscription. With MIN_OCCURRENCES lowered to 2 this used to slip
    // through: a single historical amount has nothing to check consistency
    // against, so any two same-merchant charges with a cadence-matching gap
    // would "detect" regardless of whether the amounts had anything in
    // common.
    const result = detectSubscriptions(
      [tx("mercuryo", -40000, "2026-03-07"), tx("mercuryo", -5000, "2026-03-14")],
      NOW
    );
    expect(result).toHaveLength(0);
  });

  it("detects at exactly the new minimum of three occurrences", () => {
    const result = detectSubscriptions(
      [
        tx("netflix", -1599, "2026-02-15"),
        tx("netflix", -1599, "2026-03-15"),
        tx("netflix", -1599, "2026-04-14"),
      ],
      NOW
    );
    expect(result).toHaveLength(1);
    expect(result[0].cadence).toBe("monthly");
    expect(result[0].occurrences).toBe(3);
  });

  it("rejects gaps that don't fit any cadence band", () => {
    // ~17 day gaps -- not weekly, not monthly, not yearly.
    const result = detectSubscriptions(
      [
        tx("odd cadence", -1000, "2026-01-01"),
        tx("odd cadence", -1000, "2026-01-18"),
        tx("odd cadence", -1000, "2026-02-04"),
      ],
      NOW
    );
    expect(result).toHaveLength(0);
  });

  it("sorts results by normalized monthly cost, most expensive first", () => {
    const result = detectSubscriptions(
      [
        tx("netflix", -1599, "2026-02-15"),
        tx("netflix", -1599, "2026-03-15"),
        tx("netflix", -1599, "2026-04-14"),
        tx("domain registrar", -1200, "2024-04-10"),
        tx("domain registrar", -1200, "2025-04-12"),
        tx("domain registrar", -1200, "2026-04-09"),
        tx("meal kit co", -3500, "2026-03-18"),
        tx("meal kit co", -3500, "2026-03-25"),
        tx("meal kit co", -3500, "2026-04-01"),
      ],
      NOW
    );

    // Weekly meal kit (~€151.7/mo) > monthly netflix (€15.99/mo) > yearly domain (€1/mo)
    expect(result.map((r) => r.merchant)).toEqual([
      "meal kit co",
      "netflix",
      "domain registrar",
    ]);
  });
});
