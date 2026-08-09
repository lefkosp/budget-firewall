import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/env";
import { AuthRequest, JwtPayload } from "../types";
import { ACCESS_COOKIE_NAME } from "../utils/authCookies";

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.[ACCESS_COOKIE_NAME];

  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
    req.userId = decoded.userId;
    req.user = {
      id: decoded.userId,
      email: decoded.email,
    };
    next();
  } catch {
    res.status(403).json({ error: "Invalid or expired token" });
  }
}
