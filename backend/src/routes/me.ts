import { Router, Response } from "express";
import { body } from "express-validator";
import { Types } from "mongoose";
import { authenticateToken } from "../middleware/auth";
import { resolveOwner } from "../middleware/resolveOwner";
import { validate } from "../middleware/validate";
import { AuthRequest } from "../types";
import { User } from "../models/User";
import { hasActiveRelationship } from "../services/collaborators.service";
import { setActingAsCookie, clearActingAsCookie } from "../utils/authCookies";

const router = Router();

router.get("/", authenticateToken, resolveOwner, async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId).select("-passwordHash");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    let actingAs = null;
    if (req.ownerUserId && req.ownerUserId !== req.userId) {
      const owner = await User.findById(req.ownerUserId).select("-passwordHash");
      if (owner) {
        actingAs = { id: owner._id.toString(), email: owner.email, name: owner.name };
      }
    }

    res.json({
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      actingAs,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Switches (or clears) which owner's data subsequent requests operate on.
// Deliberately does NOT run resolveOwner -- this route determines what
// resolveOwner will read on *future* requests, so it shouldn't be
// influenced by whatever the cookie already says.
router.post(
  "/switch-owner",
  authenticateToken,
  validate([body("ownerUserId").optional({ nullable: true }).isMongoId()]),
  async (req: AuthRequest, res: Response) => {
    try {
      const { ownerUserId } = req.body as { ownerUserId?: string | null };

      if (!ownerUserId || ownerUserId === req.userId) {
        clearActingAsCookie(res);
        res.json({ actingAs: null });
        return;
      }

      const allowed = await hasActiveRelationship(ownerUserId, req.userId!);
      if (!allowed) {
        res.status(403).json({ error: "You don't have access to this owner's data" });
        return;
      }

      const owner = await User.findById(new Types.ObjectId(ownerUserId)).select("-passwordHash");
      if (!owner) {
        res.status(404).json({ error: "Owner not found" });
        return;
      }

      setActingAsCookie(res, ownerUserId);
      res.json({ actingAs: { id: owner._id.toString(), email: owner.email, name: owner.name } });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;
