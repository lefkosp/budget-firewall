import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import { config } from "../config/env";
import { User } from "../models/User";
import { PasswordResetToken } from "../models/PasswordResetToken";
import { generateSecureToken, hashToken, isExpired } from "../utils/tokenHash";
import { revokeAllRefreshTokensForUser } from "./refreshToken.service";

function resetExpiryDate(now: Date): Date {
  return new Date(now.getTime() + config.resetTokenTtlMinutes * 60 * 1000);
}

/** Issues a reset token for a user and persists its hash. Returns the raw token to deliver to the user. */
export async function createResetToken(userId: string): Promise<string> {
  const raw = generateSecureToken();
  await PasswordResetToken.create({
    userId: new Types.ObjectId(userId),
    tokenHash: hashToken(raw),
    expiresAt: resetExpiryDate(new Date()),
  });
  return raw;
}

/**
 * Redeems a reset token: sets the new password and marks the token used.
 * Also revokes every refresh token the user holds -- a password reset logs
 * out every existing session, not just the one that requested the reset.
 */
export async function redeemResetToken(rawToken: string, newPassword: string): Promise<void> {
  const record = await PasswordResetToken.findOne({ tokenHash: hashToken(rawToken) });

  if (!record || record.usedAt || isExpired(record.expiresAt, new Date())) {
    throw new Error("Invalid or expired reset token");
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await User.findByIdAndUpdate(record.userId, { passwordHash });

  record.usedAt = new Date();
  await record.save();

  await revokeAllRefreshTokensForUser(record.userId.toString());
}
