import { Response, NextFunction } from "express";
import { Types } from "mongoose";
import { AuthRequest } from "../types";
import { Collaborator } from "../models/Collaborator";
import { ACTING_AS_COOKIE_NAME } from "../utils/authCookies";
import { canApprove, isOwnerOnlyAction } from "../utils/collaboratorAccess";

/**
 * Resolves which user's data this request should operate on. The
 * bf_acting_as cookie is a lookup key, not an authority -- the underlying
 * Collaborator relationship is re-checked against the DB on every request,
 * so a revoked collaborator loses access on their very next request with
 * no session invalidation needed, and a forged/stale cookie value just
 * fails the check. Every failure mode here (missing cookie, invalid ID,
 * no active relationship, a DB error) degrades to "you're viewing your
 * own data" rather than surfacing an error.
 */
export async function resolveOwner(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const cookieOwnerId = req.cookies?.[ACTING_AS_COOKIE_NAME];

  if (!cookieOwnerId || cookieOwnerId === req.userId) {
    req.ownerUserId = req.userId!;
    req.collaboratorContext = null;
    next();
    return;
  }

  if (!Types.ObjectId.isValid(cookieOwnerId)) {
    req.ownerUserId = req.userId!;
    req.collaboratorContext = null;
    next();
    return;
  }

  try {
    const relationship = await Collaborator.findOne({
      ownerUserId: new Types.ObjectId(cookieOwnerId),
      collaboratorUserId: new Types.ObjectId(req.userId!),
      revokedAt: { $exists: false },
    }).lean();

    if (relationship) {
      req.ownerUserId = cookieOwnerId;
      req.collaboratorContext = { ownerUserId: cookieOwnerId, canApprove: relationship.canApprove };
    } else {
      req.ownerUserId = req.userId!;
      req.collaboratorContext = null;
    }
  } catch {
    req.ownerUserId = req.userId!;
    req.collaboratorContext = null;
  }

  next();
}

/** Blocks non-approve writes for anyone but the true data owner. */
export function requireOwnerSelf(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!isOwnerOnlyAction(req.userId!, req.ownerUserId!)) {
    res.status(403).json({ error: "Only the account owner can perform this action" });
    return;
  }
  next();
}

/** Gates approve/deny -- the owner always can; a collaborator needs canApprove on their relationship. */
export function requireCanApprove(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!canApprove(req.userId!, req.ownerUserId!, req.collaboratorContext?.canApprove)) {
    res.status(403).json({ error: "You don't have permission to approve or deny this owner's transactions" });
    return;
  }
  next();
}
