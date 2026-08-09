import { describe, it, expect } from "vitest";
import { getConsentRenewalState } from "./consentExpiry";

describe("getConsentRenewalState", () => {
  const now = new Date("2026-06-01T00:00:00Z");

  it("is ok when there's no expiry set at all", () => {
    expect(getConsentRenewalState(undefined, now)).toBe("ok");
  });

  it("is ok when expiry is well in the future", () => {
    const consentExpiresAt = new Date("2026-08-01T00:00:00Z");
    expect(getConsentRenewalState(consentExpiresAt, now)).toBe("ok");
  });

  it("is expiring_soon inside the 14-day window", () => {
    const consentExpiresAt = new Date("2026-06-10T00:00:00Z"); // 9 days out
    expect(getConsentRenewalState(consentExpiresAt, now)).toBe("expiring_soon");
  });

  it("is expiring_soon exactly at the 14-day boundary", () => {
    const consentExpiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    expect(getConsentRenewalState(consentExpiresAt, now)).toBe("expiring_soon");
  });

  it("is ok just outside the 14-day boundary", () => {
    const consentExpiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000 + 1);
    expect(getConsentRenewalState(consentExpiresAt, now)).toBe("ok");
  });

  it("is expired once the expiry instant has passed", () => {
    const consentExpiresAt = new Date("2026-05-01T00:00:00Z");
    expect(getConsentRenewalState(consentExpiresAt, now)).toBe("expired");
  });

  it("is expired at the exact expiry instant", () => {
    expect(getConsentRenewalState(now, now)).toBe("expired");
  });
});
