const NEVER_SYNCED_LOOKBACK_DAYS = 90;

// Re-fetch a small buffer before the last sync rather than resuming exactly
// where it left off -- tolerates transactions that book with a delay
// (appearing in the feed later than their bookedAt date) without missing
// them. Matches the ~6h sync cadence; any overlap this creates is harmless
// since dedupe is idempotent on providerTransactionId.
const RESYNC_BUFFER_HOURS = 6;

/**
 * The `date_from` cursor for the next sync of an account. Replaces a fixed
 * lookback window so every sync after the first only re-fetches what's
 * actually new, instead of the account's full history every time.
 */
export function computeSyncFromDate(lastSyncedAt: Date | undefined, now: Date): Date {
  if (!lastSyncedAt) {
    return new Date(now.getTime() - NEVER_SYNCED_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  }
  return new Date(lastSyncedAt.getTime() - RESYNC_BUFFER_HOURS * 60 * 60 * 1000);
}
