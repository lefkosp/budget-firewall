export interface IntentInput {
  id: string;
  merchantText: string;
  amount: number; // cents, positive magnitude -- the user's expected charge amount
  expiresAt: string | Date;
}

export interface TransactionForMatching {
  id: string;
  merchantNameNormalized: string;
  amount: number; // cents; negative = money out
  bookedAt: string | Date;
}

export interface IntentMatchResult {
  transactionId: string;
  intentId: string;
}

/** A predicted amount doesn't need to land exactly -- give it some slack. */
const AMOUNT_TOLERANCE = 0.1;

/**
 * Matches newly-imported transactions against a user's pending pre-approval
 * intents ("I'm about to spend ~€150 at Ikea, don't flag it"). A merchant
 * substring match plus an amount within tolerance counts as a match; each
 * intent is consumed the first time it matches so one "I'm buying a €150
 * desk" intent can't silently pre-approve two separate €150 charges.
 * Transactions are processed in input order, so when a batch could satisfy
 * more than one transaction, earlier transactions get first claim.
 */
export function matchIntents(
  transactions: TransactionForMatching[],
  intents: IntentInput[],
  now: Date = new Date()
): IntentMatchResult[] {
  const available = intents.filter((intent) => new Date(intent.expiresAt) >= now);
  const results: IntentMatchResult[] = [];

  for (const tx of transactions) {
    if (tx.amount >= 0) continue; // only spend can be pre-approved

    const merchantLower = tx.merchantNameNormalized.toLowerCase();
    const absAmount = Math.abs(tx.amount);

    const idx = available.findIndex((intent) => {
      const merchantMatches = merchantLower.includes(intent.merchantText.toLowerCase());
      const amountMatches =
        intent.amount > 0 &&
        Math.abs(absAmount - intent.amount) / intent.amount <= AMOUNT_TOLERANCE;
      return merchantMatches && amountMatches;
    });

    if (idx !== -1) {
      results.push({ transactionId: tx.id, intentId: available[idx].id });
      available.splice(idx, 1);
    }
  }

  return results;
}
