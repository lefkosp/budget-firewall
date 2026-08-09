// How far ahead of the actual expiry to start surfacing a renewal nudge --
// long enough that a user checking in periodically won't be caught by a
// consent that expired between visits.
const EXPIRING_SOON_THRESHOLD_DAYS = 14;

export type ConsentRenewalState = "ok" | "expiring_soon" | "expired";

export function getConsentRenewalState(
  consentExpiresAt: Date | undefined,
  now: Date
): ConsentRenewalState {
  if (!consentExpiresAt) {
    return "ok";
  }

  if (consentExpiresAt.getTime() <= now.getTime()) {
    return "expired";
  }

  const thresholdMs = EXPIRING_SOON_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
  if (consentExpiresAt.getTime() - now.getTime() <= thresholdMs) {
    return "expiring_soon";
  }

  return "ok";
}
