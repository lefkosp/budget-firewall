import { describe, it, expect } from "vitest";
import { generateSecureToken, hashToken, isExpired } from "./tokenHash";

describe("generateSecureToken", () => {
  it("produces a high-entropy, unique token each call", () => {
    const a = generateSecureToken();
    const b = generateSecureToken();
    expect(a).not.toBe(b);
    expect(a).toHaveLength(64); // 32 random bytes, hex-encoded
  });
});

describe("hashToken", () => {
  it("is deterministic -- the same input always hashes the same way", () => {
    expect(hashToken("same-raw-token")).toBe(hashToken("same-raw-token"));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashToken("token-a")).not.toBe(hashToken("token-b"));
  });

  it("never stores the raw token as a substring of its hash", () => {
    const raw = "my-raw-token";
    expect(hashToken(raw)).not.toContain(raw);
  });
});

describe("isExpired", () => {
  it("is not expired when expiresAt is in the future", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const expiresAt = new Date("2026-01-02T00:00:00Z");
    expect(isExpired(expiresAt, now)).toBe(false);
  });

  it("is expired the instant expiresAt equals now", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(isExpired(now, now)).toBe(true);
  });

  it("is expired when expiresAt is in the past", () => {
    const now = new Date("2026-01-02T00:00:00Z");
    const expiresAt = new Date("2026-01-01T00:00:00Z");
    expect(isExpired(expiresAt, now)).toBe(true);
  });
});
