import { Router, Response } from "express";
import { body, param } from "express-validator";
import { Types } from "mongoose";
import { authenticateToken } from "../middleware/auth";
import { resolveOwner, requireOwnerSelf } from "../middleware/resolveOwner";
import { validate } from "../middleware/validate";
import { AuthRequest } from "../types";
import { Intent, IntentStatus } from "../models/Intent";
import { isValidCategory } from "../constants/categories";
import { notifyNewIntent } from "../services/notification.service";

const router = Router();

function serialize(intent: {
  _id: Types.ObjectId;
  amount: number;
  merchantText: string;
  category: string;
  note?: string;
  expiresAt: Date;
  status: string;
  createdAt: Date;
}) {
  return {
    id: intent._id.toString(),
    amount: intent.amount,
    merchantText: intent.merchantText,
    category: intent.category,
    note: intent.note,
    expiresAt: intent.expiresAt,
    status: intent.status,
    createdAt: intent.createdAt,
  };
}

router.get("/", authenticateToken, resolveOwner, async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = new Types.ObjectId(req.ownerUserId!);
    const intents = await Intent.find({ ownerUserId }).sort({ createdAt: -1 }).lean();
    res.json(intents.map(serialize));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Creates a pre-approval intent: "I'm about to spend ~X at Y" -- matched
// against future imports so the expected charge doesn't need a manual
// approval later. See intentMatch.service.ts for the matching itself.
router.post(
  "/",
  authenticateToken,
  resolveOwner,
  requireOwnerSelf,
  validate([
    body("amount").isFloat({ gt: 0 }),
    body("merchantText").isString().trim().isLength({ min: 1, max: 200 }),
    body("category").isString().custom((value) => isValidCategory(value)),
    body("note").optional().isString().trim().isLength({ max: 1000 }),
    body("expiresAt")
      .isISO8601()
      .custom((value) => new Date(value) > new Date()),
  ]),
  async (req: AuthRequest, res: Response) => {
    try {
      const ownerUserId = new Types.ObjectId(req.ownerUserId!);
      const { amount, merchantText, category, note, expiresAt } = req.body as {
        amount: number;
        merchantText: string;
        category: string;
        note?: string;
        expiresAt: string;
      };

      const intent = await Intent.create({
        ownerUserId,
        amount,
        merchantText: merchantText.trim(),
        category,
        note: note?.trim() || undefined,
        expiresAt: new Date(expiresAt),
        status: IntentStatus.PENDING,
      });

      await notifyNewIntent(req.ownerUserId!, intent.merchantText);

      res.status(201).json(serialize(intent.toObject()));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Cancels a pending intent. Only pending ones -- once an intent has matched
// a transaction (or expired), it's history, not something to delete.
router.delete(
  "/:id",
  authenticateToken,
  resolveOwner,
  requireOwnerSelf,
  validate([param("id").isMongoId()]),
  async (req: AuthRequest, res: Response) => {
    try {
      const ownerUserId = new Types.ObjectId(req.ownerUserId!);
      const intent = await Intent.findOneAndDelete({
        _id: req.params.id,
        ownerUserId,
        status: IntentStatus.PENDING,
      });

      if (!intent) {
        res.status(404).json({ error: "Pending intent not found" });
        return;
      }

      res.json({ deleted: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;
