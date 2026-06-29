import { Request } from "express";
import { Types } from "mongoose";

export interface AuthRequest extends Request {
  userId?: string;
  user?: {
    id: string;
    email: string;
    name?: string;
  };
}

export interface JwtPayload {
  userId: string;
  email: string;
}

