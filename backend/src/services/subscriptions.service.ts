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

export type SubscriptionTier = "mature" | "early_detection";

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
  /**
   * "mature" (3+ occurrences) is industry-standard confirmed-recurring
   * (Plaid, Ramp). "early_detection" (exactly 2) fits a cadence band AND
   * agrees on amount, but hasn't been validated by a third charge yet --
   * Plaid's own two-tier model, not a lowered bar. See detectSubscriptions.
   */
  tier: SubscriptionTier;
}

export interface SubscriptionDetectionResult {
  mature: SubscriptionCandidate[];
  earlyDetection: SubscriptionCandidate[];
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

/**
 * The floor for the early-detection tier: one gap and two amounts is the
 * minimum needed to check both a cadence fit and amount agreement at all.
 * A single occurrence has neither a gap nor a second amount to compare.
 */
const EARLY_DETECTION_OCCURRENCES = 2;

/**
 * How many of the most recent historical charges must agree with each
 * other on price, when deciding whether a merchant's amount is "stable."
 * Deliberately not "all of history" -- see the comment where it's used.
 */
const RECENT_AMOUNT_WINDOW = 3;

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

function overdueStatus(
  lastCharged: Date,
  nextExpected: Date,
  now: Date,
  band: CadenceBand
): boolean {
  return now.getTime() > nextExpected.getTime() && daysBetween(nextExpected, now) > band.graceDays;
}

/**
 * The mature path: 3+ occurrences, full regularity-across-every-gap and
 * recent-amount-window consistency checks. Unchanged from the pre-tiering
 * logic other than being extracted into its own function.
 */
function detectMature(
  merchant: string,
  sorted: SubscriptionTransactionInput[],
  now: Date
): SubscriptionCandidate | null {
  const dates = sorted.map((t) => new Date(t.bookedAt));
  const amounts = sorted.map((t) => Math.abs(t.amount));

  const gaps: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    gaps.push(daysBetween(dates[i - 1], dates[i]));
  }
  const avgGap = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;

  const cadence = classifyCadence(avgGap);
  if (!cadence) return null;

  const band = CADENCE_BANDS[cadence];
  const regular = gaps.every(
    (g) => g >= band.minDays - band.slackDays && g <= band.maxDays + band.slackDays
  );
  if (!regular) return null;

  // The charges immediately before the latest one need to agree with each
  // other -- but only a *recent* window of them, not the entire history.
  // A subscription whose price changed once, permanently, deep in a long
  // history (8 months at one price, then several more at a higher one)
  // would otherwise get rejected outright: pooling every historical
  // amount into one median means the newer-price charges "disagree" with
  // the older ones, even though each price was perfectly stable within
  // its own era. Checking only the trailing window lets a real, one-time
  // price change happen without nuking detection of the subscription
  // altogether -- Plaid's own recurring-transactions API exists to
  // surface exactly this ("average and last amount... to determine
  // changes to bills or subscriptions") rather than discard the stream.
  const historicalAmounts = amounts.slice(0, -1);
  const latestAmount = amounts[amounts.length - 1];
  const recentHistorical = historicalAmounts.slice(-RECENT_AMOUNT_WINDOW);
  const historicalMedian =
    recentHistorical.length > 0 ? median(recentHistorical) : latestAmount;

  if (
    recentHistorical.length > 1 &&
    !recentHistorical.every((a) => withinTolerance(a, historicalMedian, AMOUNT_TOLERANCE))
  ) {
    return null;
  }

  const priceChanged =
    recentHistorical.length > 0 &&
    !withinTolerance(latestAmount, historicalMedian, AMOUNT_TOLERANCE);

  const lastCharged = dates[dates.length - 1];
  const nextExpected = new Date(lastCharged.getTime() + avgGap * 24 * 60 * 60 * 1000);

  let status: SubscriptionStatus;
  if (overdueStatus(lastCharged, nextExpected, now, band)) {
    status = "possibly-cancelled";
  } else if (priceChanged) {
    status = "price-changed";
  } else {
    status = "active";
  }

  return {
    merchant,
    amount: latestAmount,
    cadence,
    firstSeen: isoDate(dates[0]),
    lastCharged: isoDate(lastCharged),
    nextExpected: isoDate(nextExpected),
    status,
    occurrences: sorted.length,
    computedCategory: sorted[sorted.length - 1].computedCategory,
    tier: "mature",
  };
}

/**
 * The early-detection path: exactly 2 occurrences. There's only one gap and
 * one pair of amounts to work with, so this can't check "regular across
 * every gap" or "consistent across a window" the way the mature path does
 * -- but it can still require the single gap to fit a cadence band AND the
 * two amounts to agree within tolerance. Both checks matter: cadence alone
 * is exactly what let Mercuryo (two unrelated charges, coincidentally a
 * cadence-fitting week apart, wildly different amounts) through as a false
 * positive before MIN_OCCURRENCES was raised to 3. Requiring amount
 * agreement too keeps that case out while still surfacing a genuinely new,
 * consistently-priced subscription after only its second charge.
 */
function detectEarly(
  merchant: string,
  sorted: SubscriptionTransactionInput[],
  now: Date
): SubscriptionCandidate | null {
  const dates = sorted.map((t) => new Date(t.bookedAt));
  const amounts = sorted.map((t) => Math.abs(t.amount));

  const gap = daysBetween(dates[0], dates[1]);
  const cadence = classifyCadence(gap);
  if (!cadence) return null;

  const [firstAmount, secondAmount] = amounts;
  if (!withinTolerance(secondAmount, firstAmount, AMOUNT_TOLERANCE)) return null;

  const band = CADENCE_BANDS[cadence];
  const lastCharged = dates[1];
  const nextExpected = new Date(lastCharged.getTime() + gap * 24 * 60 * 60 * 1000);
  const status: SubscriptionStatus = overdueStatus(lastCharged, nextExpected, now, band)
    ? "possibly-cancelled"
    : "active";

  return {
    merchant,
    amount: secondAmount,
    cadence,
    firstSeen: isoDate(dates[0]),
    lastCharged: isoDate(lastCharged),
    nextExpected: isoDate(nextExpected),
    status,
    occurrences: 2,
    computedCategory: sorted[1].computedCategory,
    tier: "early_detection",
  };
}

export function detectSubscriptions(
  transactions: SubscriptionTransactionInput[],
  now: Date = new Date()
): SubscriptionDetectionResult {
  const groups = new Map<string, SubscriptionTransactionInput[]>();

  for (const tx of transactions) {
    if (tx.amount >= 0) continue; // only spend can be a subscription
    if (!tx.merchantNameNormalized) continue;
    if (tx.computedCategory && !isSpendingCategory(tx.computedCategory)) continue;

    const list = groups.get(tx.merchantNameNormalized) ?? [];
    list.push(tx);
    groups.set(tx.merchantNameNormalized, list);
  }

  const mature: SubscriptionCandidate[] = [];
  const earlyDetection: SubscriptionCandidate[] = [];

  for (const [merchant, txs] of groups) {
    if (txs.length < EARLY_DETECTION_OCCURRENCES) continue;

    const sorted = [...txs].sort(
      (a, b) => new Date(a.bookedAt).getTime() - new Date(b.bookedAt).getTime()
    );

    if (txs.length >= MIN_OCCURRENCES) {
      const candidate = detectMature(merchant, sorted, now);
      if (candidate) mature.push(candidate);
    } else {
      const candidate = detectEarly(merchant, sorted, now);
      if (candidate) earlyDetection.push(candidate);
    }
  }

  return {
    mature: mature.sort((a, b) => monthlyCost(b) - monthlyCost(a)),
    earlyDetection: earlyDetection.sort((a, b) => monthlyCost(b) - monthlyCost(a)),
  };
}
