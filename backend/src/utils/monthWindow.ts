/**
 * Calendar-month helpers anchored to UTC, not server-local time.
 *
 * Transaction dates are parsed and stored at UTC midnight (see
 * utils/csvParser.ts -- a CSV row for "1 March" becomes
 * 2025-03-01T00:00:00Z regardless of where the server runs). Bucketing
 * those dates into months with local date getters (getFullYear/getMonth)
 * would read that same instant as still-February in any timezone behind
 * UTC, silently shifting boundary transactions into the wrong month for
 * budget suggestions, rule re-evaluation, and "this month" spend
 * calculations. Every month-bucketing calculation in the app should go
 * through these instead, so "now" and a transaction's "bookedAt" are
 * always compared in the same reference frame.
 */

/** "YYYY-MM" for the date's UTC calendar month. */
export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The date's own UTC month, shifted by `delta` months, anchored to day 1 UTC midnight. */
export function addUTCMonths(date: Date, delta: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1));
}

/** UTC midnight of the 1st of the given date's UTC month. */
export function startOfUTCMonth(date: Date): Date {
  return addUTCMonths(date, 0);
}

/** The last instant (23:59:59.999 UTC) of the given date's UTC month. */
export function endOfUTCMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}
