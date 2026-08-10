import crypto from "crypto";
import { Response } from "express";
import { config } from "../config/env";
import { getCookieOptions } from "./cookieOptions";
import { CSRF_COOKIE_NAME } from "../middleware/csrf";

export const ACCESS_COOKIE_NAME = "bf_access";
export const REFRESH_COOKIE_NAME = "bf_refresh";
export const ACTING_AS_COOKIE_NAME = "bf_acting_as";

const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = () => config.refreshTokenTtlDays * 24 * 60 * 60 * 1000;

/**
 * Sets the access, refresh, and CSRF cookies for an authenticated session.
 * Generates a fresh CSRF token every time -- login, register, and refresh
 * all start (or continue) a session, so each gets its own CSRF pairing.
 */
export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  const base = getCookieOptions(config.nodeEnv);

  res.cookie(ACCESS_COOKIE_NAME, accessToken, {
    ...base,
    path: "/",
    maxAge: ACCESS_TOKEN_TTL_MS,
  });

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    ...base,
    path: "/api/auth",
    maxAge: REFRESH_TOKEN_TTL_MS(),
  });

  res.cookie(CSRF_COOKIE_NAME, crypto.randomBytes(32).toString("hex"), {
    ...base,
    httpOnly: false,
    path: "/",
    maxAge: REFRESH_TOKEN_TTL_MS(),
  });
}

export function clearAuthCookies(res: Response): void {
  const base = getCookieOptions(config.nodeEnv);
  res.clearCookie(ACCESS_COOKIE_NAME, { ...base, path: "/" });
  res.clearCookie(REFRESH_COOKIE_NAME, { ...base, path: "/api/auth" });
  res.clearCookie(CSRF_COOKIE_NAME, { ...base, httpOnly: false, path: "/" });
  clearActingAsCookie(res);
}

/**
 * Holds the owner ID a collaborator is currently "viewing as" -- a lookup
 * key, not an authority (mirrors how RefreshToken/PasswordResetToken work):
 * resolveOwner.ts re-validates the underlying relationship against the DB
 * on every request, so a forged or stale value just falls back to self.
 * Long-lived like the refresh cookie, not the 15-minute access cookie --
 * otherwise a collaborator would get silently bounced back to their own
 * data on every token refresh.
 */
export function setActingAsCookie(res: Response, ownerUserId: string): void {
  res.cookie(ACTING_AS_COOKIE_NAME, ownerUserId, {
    ...getCookieOptions(config.nodeEnv),
    path: "/",
    maxAge: REFRESH_TOKEN_TTL_MS(),
  });
}

export function clearActingAsCookie(res: Response): void {
  res.clearCookie(ACTING_AS_COOKIE_NAME, { ...getCookieOptions(config.nodeEnv), path: "/" });
}
