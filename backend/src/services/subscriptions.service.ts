import { isSpendingCategory } from "../constants/categories";

/**
 * Subscription detection engine.
 *
 * Deterministic and pure, same style as the categorizer: group a user's
 * transactions by merchant, and flag a merchant as a subscription when it
 * charges a near-constant amount on a near-regular interval. Both checks
 * matter -- a merchant charged regularly but for wildly different amounts is
 * a grocery store, not a subscription; a merchant charged the same amount
 * but at random intervals is a coincidence, not a subscription.
 */

export type SubscriptionCadence = "weekly" | "monthly" | "yearly";
export type SubscriptionStatus = "active" | "price-changed" | "possibly-cancelled";

export interface SubscriptionTransactionInput {
  merchantNameNormalized: string;
  amount: number; // cents; negative = money out
  bookedAt: string | Date;
  computedCategory?: string;
}

export interface SubscriptionCandidate {
  merchant: string;
  /** Cents, positive magnitude -- the current (most recent) charge amount. */
  amount: number;
  cadence: SubscriptionCadence;
  firstSeen: string; // ISO date (yyyy-mm-dd)
  lastCharged: string; // ISO date
  nextExpected: string; // ISO date
  status: SubscriptionStatus;
  occurrences: number;
  /** The most recent charge's category, when the caller provided one. */
  computedCategory?: string;
}

interface CadenceBand {
  minDays: number;
  maxDays: number;
  /** Regularity tolerance beyond the band, so weekend/month-length drift doesn't reject a real subscription. */
  slackDays: number;
  /** How long past nextExpected before we call it possibly-cancelled. */
  graceDays: number;
}

const CADENCE_BANDS: Record<SubscriptionCadence, CadenceBand> = {
  weekly: { minDays: 5, maxDays: 9, slackDays: 5, graceDays: 3 },
  monthly: { minDays: 25, maxDays: 35, slackDays: 5, graceDays: 7 },
  yearly: { minDays: 350, maxDays: 380, slackDays: 15, graceDays: 14 },
};

/** Amounts within this fraction of each other count as "the same price". */
const AMOUNT_TOLERANCE = 0.08;

/**
 * Matches industry practice (Plaid's recurring-transactions API requires 3+
 * occurrences for a "mature" stream, flagging 1-2 as lower-confidence
 * "early detection" instead; Ramp's own recurring-detection spec uses the
 * same 3-occurrence floor). Below 3, there's no way to validate amount
 * consistency: 2 occurrences give exactly 1 historical amount, which is
 * trivially "consistent" with itself no matter how different the two
 * charges actually are -- a real false positive we hit in practice (two
 * unrelated charges at the same merchant, a week apart, for wildly
 * different amounts, detected as a "subscription" under the old minimum
 * of 2).
 */
const MIN_OCCURRENCES = 3;

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function withinTolerance(value: number, reference: number, tolerance: number): boolean {
  if (reference === 0) return value === 0;
  return Math.abs(value - reference) / Math.abs(reference) <= tolerance;
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24);
}

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function classifyCadence(avgGapDays: number): SubscriptionCadence | null {
  for (const cadence of Object.keys(CADENCE_BANDS) as SubscriptionCadence[]) {
    const band = CADENCE_BANDS[cadence];
    if (avgGapDays >= band.minDays && avgGapDays <= band.maxDays) {
      return cadence;
    }
  }
  return null;
}

/** Normalizes any cadence to a comparable monthly figure, for ranking and the headline total. */
export function monthlyCost(sub: Pick<SubscriptionCandidate, "amount" | "cadence">): number {
  switch (sub.cadence) {
    case "weekly":
      return sub.amount * (52 / 12);
    case "monthly":
      return sub.amount;
    case "yearly":
      return sub.amount / 12;
  }
}

export function detectSubscriptions(
  transactions: SubscriptionTransactionInput[],
  now: Date = new Date()
): SubscriptionCandidate[] {
  const groups = new Map<string, SubscriptionTransactionInput[]>();

  for (const tx of transactions) {
    if (tx.amount >= 0) continue; // only spend can be a subscription
    if (!tx.merchantNameNormalized) continue;
    if (tx.computedCategory && !isSpendingCategory(tx.computedCategory)) continue;

    const list = groups.get(tx.merchantNameNormalized) ?? [];
    list.push(tx);
    groups.set(tx.merchantNameNormalized, list);
  }

  const candidates: SubscriptionCandidate[] = [];

  for (const [merchant, txs] of groups) {
    if (txs.length < MIN_OCCURRENCES) continue;

    const sorted = [...txs].sort(
      (a, b) => new Date(a.bookedAt).getTime() - new Date(b.bookedAt).getTime()
    );
    const dates = sorted.map((t) => new Date(t.bookedAt));
    const amounts = sorted.map((t) => Math.abs(t.amount));

    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      gaps.push(daysBetween(dates[i - 1], dates[i]));
    }
    const avgGap = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;

    const cadence = classifyCadence(avgGap);
    if (!cadence) continue;

    const band = CADENCE_BANDS[cadence];
    const regular = gaps.every(
      (g) => g >= band.minDays - band.slackDays && g <= band.maxDays + band.slackDays
    );
    if (!regular) continue;

    // The charges before the latest one need to agree with each other. If
    // they don't, this merchant doesn't have a stable price and isn't a
    // subscription (e.g. groceries) -- the latest charge is allowed to
    // differ, since that's what "price changed" means.
    const historicalAmounts = amounts.slice(0, -1);
    const latestAmount = amounts[amounts.length - 1];
    const historicalMedian =
      historicalAmounts.length > 0 ? median(historicalAmounts) : latestAmount;

    if (
      historicalAmounts.length > 1 &&
      !historicalAmounts.every((a) => withinTolerance(a, historicalMedian, AMOUNT_TOLERANCE))
    ) {
      continue;
    }

    const priceChanged =
      historicalAmounts.length > 0 &&
      !withinTolerance(latestAmount, historicalMedian, AMOUNT_TOLERANCE);

    const lastCharged = dates[dates.length - 1];
    const nextExpected = new Date(lastCharged.getTime() + avgGap * 24 * 60 * 60 * 1000);
    const overdue =
      now.getTime() > nextExpected.getTime() && daysBetween(nextExpected, now) > band.graceDays;

    let status: SubscriptionStatus;
    if (overdue) {
      status = "possibly-cancelled";
    } else if (priceChanged) {
      status = "price-changed";
    } else {
      status = "active";
    }

    candidates.push({
      merchant,
      amount: latestAmount,
      cadence,
      firstSeen: isoDate(dates[0]),
      lastCharged: isoDate(lastCharged),
      nextExpected: isoDate(nextExpected),
      status,
      occurrences: sorted.length,
      computedCategory: sorted[sorted.length - 1].computedCategory,
    });
  }

  return candidates.sort((a, b) => monthlyCost(b) - monthlyCost(a));
}
