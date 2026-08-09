import rateLimit from "express-rate-limit";

/**
 * Brute-force protection on login/register. Keyed by IP (express-rate-limit's
 * default), since these routes run before a JWT exists to key on anything
 * more precise. 10 attempts per 15 minutes is generous for a legitimate user
 * who mistypes a password a couple of times, tight enough to make credential
 * stuffing impractical.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again later." },
});

/**
 * CSV import is the most expensive request the API serves (parses a whole
 * file, runs categorization/rules/subscription logic across it) -- looser
 * than the auth limiter since repeated imports are a normal workflow, but
 * still bounded against an accidental or malicious upload loop.
 */
export const importRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many imports. Please try again later." },
});
