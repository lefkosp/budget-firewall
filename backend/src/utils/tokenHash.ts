import crypto from "crypto";

/** Shared by refresh tokens and password-reset tokens: both are high-entropy random values, hashed before storage so a DB read alone can't be replayed as the token. */
export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function isExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}
