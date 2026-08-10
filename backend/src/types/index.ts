import { Request } from "express";
import { Types } from "mongoose";

export interface AuthRequest extends Request {
  userId?: string;
  user?: {
    id: string;
    email: string;
    name?: string;
  };
  /** The effective data owner for this request -- req.userId unless resolveOwner.ts confirmed an active collaborator relationship for a different owner. Set by resolveOwner middleware. */
  ownerUserId?: string;
  collaboratorContext?: {
    ownerUserId: string;
    canApprove: boolean;
  } | null;
}

export interface JwtPayload {
  userId: string;
  email: string;
}

