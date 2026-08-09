import type { CookieOptions } from "express";

/**
 * SameSite/Secure depend on whether the frontend and backend are same-site.
 * Locally (localhost:3000 + localhost:3001) they are -- SameSite compares
 * scheme + registrable domain, not port -- so Lax works over plain HTTP. In
 * production the frontend (Vercel) and backend (Railway/Render) are on
 * different registrable domains, which is genuinely cross-site and requires
 * SameSite=None paired with Secure (browsers reject None without Secure).
 */
export function getCookieOptions(nodeEnv: string): Pick<CookieOptions, "httpOnly" | "secure" | "sameSite"> {
  const isProd = nodeEnv === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
  };
}
