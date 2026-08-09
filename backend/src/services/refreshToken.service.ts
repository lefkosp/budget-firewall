import { Types } from "mongoose";
import { config } from "../config/env";
import { RefreshToken } from "../models/RefreshToken";
import { generateSecureToken, hashToken, isExpired } from "../utils/tokenHash";

function refreshExpiryDate(now: Date): Date {
  return new Date(now.getTime() + config.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
}

/** Issues a new refresh token for a user and persists its hash. Returns the raw token to hand to the client. */
export async function createRefreshToken(userId: string): Promise<string> {
  const raw = generateSecureToken();
  await RefreshToken.create({
    userId: new Types.ObjectId(userId),
    tokenHash: hashToken(raw),
    expiresAt: refreshExpiryDate(new Date()),
  });
  return raw;
}

/**
 * Validates a presented refresh token and rotates it: the old token is
 * revoked and a new one issued. Returns null if the token is missing,
 * expired, or already revoked (Tier 2 scope -- a revoked-token replay just
 * fails closed here; walking the token family to revoke every descendant
 * session on reuse is deferred to Tier 3).
 */
export async function rotateRefreshToken(
  rawToken: string
): Promise<{ userId: string; newRawToken: string } | null> {
  const existing = await RefreshToken.findOne({ tokenHash: hashToken(rawToken) });

  if (!existing || existing.revokedAt || isExpired(existing.expiresAt, new Date())) {
    return null;
  }

  existing.revokedAt = new Date();
  await existing.save();

  const newRawToken = await createRefreshToken(existing.userId.toString());
  return { userId: existing.userId.toString(), newRawToken };
}

export async function revokeRefreshToken(rawToken: string): Promise<void> {
  await RefreshToken.updateOne(
    { tokenHash: hashToken(rawToken), revokedAt: { $exists: false } },
    { revokedAt: new Date() }
  );
}

/** Logs a user out of every session -- used on password reset. */
export async function revokeAllRefreshTokensForUser(userId: string): Promise<void> {
  await RefreshToken.updateMany(
    { userId: new Types.ObjectId(userId), revokedAt: { $exists: false } },
    { revokedAt: new Date() }
  );
}
