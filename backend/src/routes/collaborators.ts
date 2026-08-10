import { Router, Request, Response } from "express";
import { body, param } from "express-validator";
import { authenticateToken } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { AuthRequest } from "../types";
import { User } from "../models/User";
import { config } from "../config/env";
import {
  createInvite,
  getInvitePreview,
  acceptInvite,
  listCollaboratorsForOwner,
  listOwnersForCollaborator,
  endCollaboration,
  InviteEmailMismatchError,
} from "../services/collaborators.service";

const router = Router();

// Collaborator-management routes always act on req.userId as the actor,
// regardless of the acting-as cookie -- inviting/revoking/listing your own
// collaborator relationships should never be influenced by whose data
// you're currently viewing. None of these use resolveOwner.

router.post(
  "/invite",
  authenticateToken,
  validate([
    body("email").isEmail().normalizeEmail(),
    body("canApprove").optional().isBoolean(),
  ]),
  async (req: AuthRequest, res: Response) => {
    try {
      const { email, canApprove = true } = req.body as { email: string; canApprove?: boolean };

      const requester = await User.findById(req.userId);
      if (requester && requester.email.toLowerCase() === email.toLowerCase()) {
        res.status(400).json({ error: "You can't invite yourself" });
        return;
      }

      const rawToken = await createInvite(req.userId!, email, canApprove);
      const inviteUrl = `${config.frontendUrl}/accept-invite?token=${rawToken}`;

      if (config.nodeEnv === "production") {
        // Stubbed, same as password reset: no email provider is wired up
        // yet (DEVELOPMENT_PLAN.md Phase 6). Logging server-side at least
        // gets the link to whoever has prod log access.
        console.log(`[collaborator-invite] ${email} -> ${inviteUrl}`);
        res.status(201).json({ message: "Invite sent" });
        return;
      }

      res.status(201).json({ message: "Invite created", devInviteUrl: inviteUrl });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Public: the invitee may not have an account yet, so this can't require auth.
router.get("/invite/:token", async (req: Request, res: Response) => {
  try {
    const preview = await getInvitePreview(req.params.token);
    if (!preview) {
      res.status(404).json({ error: "Invite not found or expired" });
      return;
    }
    res.json(preview);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post(
  "/invite/:token/accept",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      await acceptInvite(req.params.token, req.userId!);
      res.json({ success: true });
    } catch (error: any) {
      const status = error instanceof InviteEmailMismatchError ? 403 : 400;
      res.status(status).json({ error: error.message });
    }
  }
);

// "People you've added" -- accepted, pending, and revoked, merged.
router.get("/", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    res.json(await listCollaboratorsForOwner(req.userId!));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// "Owners who've added you".
router.get("/owners", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    res.json(await listOwnersForCollaborator(req.userId!));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Ends a relationship -- either the owner revoking or the collaborator leaving.
router.delete(
  "/:id",
  authenticateToken,
  validate([param("id").isMongoId()]),
  async (req: AuthRequest, res: Response) => {
    try {
      const ended = await endCollaboration(req.userId!, req.params.id);
      if (!ended) {
        res.status(404).json({ error: "Collaborator relationship not found" });
        return;
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;
