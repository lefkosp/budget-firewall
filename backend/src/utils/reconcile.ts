export interface FuzzyMatchCandidate {
  id: string;
  providerTransactionId: string;
  bookedAt: Date;
  amount: number;
  currency: string;
  merchantNameNormalized: string;
}

export interface FuzzyMatchInput {
  bookedAt: Date;
  amount: number;
  currency: string;
  merchantNameNormalized: string;
}

// Bank booking dates vs. a CSV export's dates can legitimately drift around
// weekends/processing -- a few days' slack catches that without risking a
// false match against an unrelated transaction days apart. Exported so
// callers can narrow their DB query to the same window (see
// transaction.service.ts) rather than loading every CSV-origin transaction
// into memory to re-check here.
export const DATE_WINDOW_DAYS = 3;

/**
 * Finds a CSV-imported transaction that's really the same real-world charge
 * as an incoming bank transaction, so it isn't double-counted once the same
 * period is also covered by a live sync. Only matches against CSV-origin
 * rows (`providerTransactionId` starting with `csv_`) -- bank-vs-bank
 * duplicates are already handled by exact `providerTransactionId` matching,
 * this is specifically for the boundary between the two data sources.
 *
 * Amount must match exactly, deliberately unlike the tolerance bands used
 * elsewhere in this codebase (subscription detector, intent matcher):
 * amount is the strongest signal two rows are the *same* charge, and
 * loosening it risks merging two genuinely different transactions (two
 * similarly-priced coffees) instead of just catching a real duplicate.
 */
export function findFuzzyDuplicate(
  candidate: FuzzyMatchInput,
  existingTransactions: FuzzyMatchCandidate[]
): FuzzyMatchCandidate | null {
  const windowMs = DATE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const candidateMerchant = candidate.merchantNameNormalized.toLowerCase();

  for (const existing of existingTransactions) {
    if (!existing.providerTransactionId.startsWith("csv_")) continue;
    if (existing.currency !== candidate.currency) continue;
    if (existing.amount !== candidate.amount) continue;
    if (Math.abs(existing.bookedAt.getTime() - candidate.bookedAt.getTime()) > windowMs) continue;

    const existingMerchant = existing.merchantNameNormalized.toLowerCase();
    const merchantMatches =
      existingMerchant.includes(candidateMerchant) || candidateMerchant.includes(existingMerchant);
    if (!merchantMatches) continue;

    return existing;
  }

  return null;
}
