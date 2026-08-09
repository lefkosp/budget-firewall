import { Request, Response, NextFunction } from "express";

export const CSRF_COOKIE_NAME = "bf_csrf";
export const CSRF_HEADER_NAME = "x-csrf-token";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Routes that never rely on the cookie session CSRF exists to protect:
 * login/register/reset are pre-auth (no session to hijack yet, guarded by
 * rate limiting instead), and the cron sweep authenticates via a shared
 * secret header rather than cookies at all, so a browser's cookie jar has
 * no bearing on it either way.
 */
const CSRF_EXEMPT_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/cron/sync-all",
]);

/**
 * Double-submit cookie check: the client must echo the CSRF cookie's value
 * back as a header, which a cross-site attacker can trigger a request from
 * but cannot read (the cookie isn't httpOnly, but it also isn't sent to
 * other origins, and same-origin JS is the only reader that can see both
 * the cookie and mirror it into a header).
 */
export function csrfTokenValid(cookieToken: string | undefined, headerToken: string | undefined): boolean {
  return Boolean(cookieToken) && Boolean(headerToken) && cookieToken === headerToken;
}

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (!MUTATING_METHODS.has(req.method) || CSRF_EXEMPT_PATHS.has(req.path)) {
    next();
    return;
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.headers[CSRF_HEADER_NAME] as string | undefined;

  if (!csrfTokenValid(cookieToken, headerToken)) {
    res.status(403).json({ error: "Invalid or missing CSRF token" });
    return;
  }

  next();
}
