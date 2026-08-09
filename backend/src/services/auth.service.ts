import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/User";
import { config } from "../config/env";
import { JwtPayload } from "../types";
import { createRefreshToken } from "./refreshToken.service";

interface AuthResult {
  user: { id: string; email: string; name?: string };
  accessToken: string;
  refreshToken: string;
}

export async function registerUser(email: string, password: string, name?: string): Promise<AuthResult> {
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    throw new Error("User with this email already exists");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await User.create({
    email: email.toLowerCase(),
    passwordHash,
    name,
  });

  return buildAuthResult(user._id.toString(), user.email, user.name);
}

export async function loginUser(email: string, password: string): Promise<AuthResult> {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !user.passwordHash) {
    throw new Error("Invalid email or password");
  }

  const isValidPassword = await bcrypt.compare(password, user.passwordHash);
  if (!isValidPassword) {
    throw new Error("Invalid email or password");
  }

  return buildAuthResult(user._id.toString(), user.email, user.name);
}

async function buildAuthResult(userId: string, email: string, name?: string): Promise<AuthResult> {
  const [accessToken, refreshToken] = await Promise.all([
    Promise.resolve(generateAccessToken(userId, email)),
    createRefreshToken(userId),
  ]);

  return {
    user: { id: userId, email, name: name || undefined },
    accessToken,
    refreshToken,
  };
}

export function generateAccessToken(userId: string, email: string): string {
  const payload: JwtPayload = { userId, email };
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.accessTokenTtl as jwt.SignOptions["expiresIn"] });
}
