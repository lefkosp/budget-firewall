import { Router, Response } from "express";
import { Types } from "mongoose";
import { authenticateToken } from "../middleware/auth";
import { AuthRequest } from "../types";
import { Transaction } from "../models/Transaction";
import { SubscriptionDismissal } from "../models/SubscriptionDismissal";
import { detectSubscriptions, monthlyCost } from "../services/subscriptions.service";

const router = Router();

// List detected subscriptions, most expensive (normalized to monthly) first.
router.get("/", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = new Types.ObjectId(req.userId!);

    // EUR-only v1: monthlyCost sums amounts, so detection runs on EUR spend
    // only -- a merchant billing in two currencies would otherwise look like
    // a price change every cycle.
    const [transactions, dismissals] = await Promise.all([
      Transaction.find({ ownerUserId, currency: "EUR" }).select(
        "merchantNameNormalized amount bookedAt computedCategory"
      ),
      SubscriptionDismissal.find({ ownerUserId }).select("merchantNameNormalized"),
    ]);

    const dismissed = new Set(dismissals.map((d) => d.merchantNameNormalized));

    const subscriptions = detectSubscriptions(transactions).filter(
      (sub) => !dismissed.has(sub.merchant)
    );

    const totalMonthlyCost = subscriptions.reduce((sum, sub) => sum + monthlyCost(sub), 0);

    res.json({
      subscriptions,
      totalMonthlyCost: Math.round(totalMonthlyCost),
      count: subscriptions.length,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// "This isn't a subscription" -- hides a merchant from future detection.
router.post(
  "/:merchant/dismiss",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const ownerUserId = new Types.ObjectId(req.userId!);
      const merchantNameNormalized = decodeURIComponent(req.params.merchant);

      await SubscriptionDismissal.findOneAndUpdate(
        { ownerUserId, merchantNameNormalized },
        {},
        { upsert: true }
      );

      res.json({ dismissed: merchantNameNormalized });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;
