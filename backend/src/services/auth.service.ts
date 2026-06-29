import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/User";
import { config } from "../config/env";
import { JwtPayload } from "../types";

export async function registerUser(
  email: string,
  password: string,
  name?: string
): Promise<{ user: { id: string; email: string; name?: string }; token: string }> {
  // Check if user already exists
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    throw new Error("User with this email already exists");
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 10);

  // Create user
  const user = await User.create({
    email: email.toLowerCase(),
    passwordHash,
    name,
  });

  // Generate JWT token
  const token = generateToken(user._id.toString(), user.email);

  return {
    user: {
      id: user._id.toString(),
      email: user.email,
      name: user.name || undefined,
    },
    token,
  };
}

export async function loginUser(
  email: string,
  password: string
): Promise<{ user: { id: string; email: string; name?: string }; token: string }> {
  // Find user
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    throw new Error("Invalid email or password");
  }

  // Check password
  if (!user.passwordHash) {
    throw new Error("Invalid email or password");
  }

  const isValidPassword = await bcrypt.compare(password, user.passwordHash);
  if (!isValidPassword) {
    throw new Error("Invalid email or password");
  }

  // Generate JWT token
  const token = generateToken(user._id.toString(), user.email);

  return {
    user: {
      id: user._id.toString(),
      email: user.email,
      name: user.name || undefined,
    },
    token,
  };
}

function generateToken(userId: string, email: string): string {
  const payload: JwtPayload = { userId, email };
  return jwt.sign(payload, config.jwtSecret, { expiresIn: "7d" });
}

