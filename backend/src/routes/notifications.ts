import { Router, Response } from "express";
import { param } from "express-validator";
import { Types } from "mongoose";
import { authenticateToken } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { AuthRequest } from "../types";
import { Notification } from "../models/Notification";

const router = Router();

// Notifications are actor-scoped (who received them), not owner-scoped --
// no resolveOwner here, same reasoning as the collaborator-management routes.
router.get("/", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const notifications = await Notification.find({ recipientUserId: new Types.ObjectId(req.userId!) })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json(
      notifications.map((n) => ({
        id: n._id.toString(),
        ownerUserId: n.ownerUserId.toString(),
        type: n.type,
        message: n.message,
        readAt: n.readAt,
        createdAt: n.createdAt,
      }))
    );
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post(
  "/:id/read",
  authenticateToken,
  validate([param("id").isMongoId()]),
  async (req: AuthRequest, res: Response) => {
    try {
      const notification = await Notification.findOneAndUpdate(
        { _id: req.params.id, recipientUserId: new Types.ObjectId(req.userId!) },
        { readAt: new Date() },
        { new: true }
      );

      if (!notification) {
        res.status(404).json({ error: "Notification not found" });
        return;
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;
