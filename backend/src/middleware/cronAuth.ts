import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { config } from "../config/env";

const CRON_SECRET_HEADER = "x-cron-secret";

/**
 * Timing-safe comparison against the header a scheduled task must present
 * (see routes/cron.ts) -- a plain string `===` would leak how many leading
 * bytes match through response-time differences.
 */
export function cronAuth(req: Request, res: Response, next: NextFunction): void {
  const presented = req.headers[CRON_SECRET_HEADER];

  if (!config.cronSecret || typeof presented !== "string") {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const expected = Buffer.from(config.cronSecret);
  const actual = Buffer.from(presented);

  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}
