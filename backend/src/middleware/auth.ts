import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/env";
import { AuthRequest, JwtPayload } from "../types";

export function authenticateToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  if (req.path.includes("/import-csv")) {
    console.log(`[Auth Middleware] Checking authentication for ${req.path}`);
  }
  
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

  if (!token) {
    if (req.path.includes("/import-csv")) {
      console.log(`[Auth Middleware] No token provided for ${req.path}`);
    }
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
    if (req.path.includes("/import-csv")) {
      console.log(`[Auth Middleware] Authentication successful for user ${decoded.userId}`);
    }
    next();
  } catch (error: any) {
    if (req.path.includes("/import-csv")) {
      console.error(`[Auth Middleware] Token verification failed:`, error.message);
    }
    res.status(403).json({ error: "Invalid or expired token" });
  }
}

