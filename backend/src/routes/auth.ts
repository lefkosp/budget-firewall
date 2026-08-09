import { Router, Request, Response } from "express";
import { body } from "express-validator";
import { registerUser, loginUser, generateAccessToken } from "../services/auth.service";
import { rotateRefreshToken, revokeRefreshToken } from "../services/refreshToken.service";
import { createResetToken, redeemResetToken } from "../services/passwordReset.service";
import { validate } from "../middleware/validate";
import { passwordResetRateLimiter } from "../middleware/rateLimit";
import { setAuthCookies, clearAuthCookies, REFRESH_COOKIE_NAME } from "../utils/authCookies";
import { config } from "../config/env";
import { User } from "../models/User";

const router = Router();

router.post(
  "/register",
  validate([
    body("email").isEmail().normalizeEmail(),
    body("password").isLength({ min: 6 }),
    body("name").optional().trim(),
  ]),
  async (req: Request, res: Response) => {
    try {
      const { email, password, name } = req.body;
      const { user, accessToken, refreshToken } = await registerUser(email, password, name);
      setAuthCookies(res, accessToken, refreshToken);
      res.status(201).json({ user });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

router.post(
  "/login",
  validate([body("email").isEmail().normalizeEmail(), body("password").notEmpty()]),
  async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      const { user, accessToken, refreshToken } = await loginUser(email, password);
      setAuthCookies(res, accessToken, refreshToken);
      res.json({ user });
    } catch (error: any) {
      res.status(401).json({ error: error.message });
    }
  }
);

router.post("/refresh", async (req: Request, res: Response) => {
  const presentedRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];

  if (!presentedRefreshToken) {
    res.status(401).json({ error: "No refresh token" });
    return;
  }

  const rotated = await rotateRefreshToken(presentedRefreshToken);
  if (!rotated) {
    clearAuthCookies(res);
    res.status(401).json({ error: "Invalid or expired refresh token" });
    return;
  }

  const user = await User.findById(rotated.userId);
  if (!user) {
    clearAuthCookies(res);
    res.status(401).json({ error: "User no longer exists" });
    return;
  }

  const accessToken = generateAccessToken(rotated.userId, user.email);
  setAuthCookies(res, accessToken, rotated.newRawToken);
  res.json({ user: { id: rotated.userId, email: user.email, name: user.name || undefined } });
});

router.post(
  "/forgot-password",
  passwordResetRateLimiter,
  validate([body("email").isEmail().normalizeEmail()]),
  async (req: Request, res: Response) => {
    const { email } = req.body;

    // Always the same response, whether or not the account exists -- an
    // account-dependent response here would let an attacker enumerate
    // registered emails.
    const genericResponse = {
      message: "If an account exists for that email, a reset link has been sent.",
    };

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      res.json(genericResponse);
      return;
    }

    const rawToken = await createResetToken(user._id.toString());
    const resetUrl = `${config.frontendUrl}/reset-password?token=${rawToken}`;

    if (config.nodeEnv === "production") {
      // Stubbed: no email provider is wired up yet (see DEVELOPMENT_PLAN.md
      // Phase 6, which plans Resend). Logging server-side at least gets the
      // link to whoever has prod log access until real delivery lands.
      console.log(`[password-reset] ${email} -> ${resetUrl}`);
      res.json(genericResponse);
      return;
    }

    // Dev/test: no email provider stands in the way of testing the flow.
    res.json({ ...genericResponse, devResetUrl: resetUrl, devResetToken: rawToken });
  }
);

router.post(
  "/reset-password",
  passwordResetRateLimiter,
  validate([body("token").notEmpty(), body("newPassword").isLength({ min: 6 })]),
  async (req: Request, res: Response) => {
    try {
      const { token, newPassword } = req.body;
      await redeemResetToken(token, newPassword);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

router.post("/logout", async (req: Request, res: Response) => {
  const presentedRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
  if (presentedRefreshToken) {
    await revokeRefreshToken(presentedRefreshToken);
  }
  clearAuthCookies(res);
  res.json({ success: true });
});

export default router;
