import { Router, Response } from "express";
import { Types } from "mongoose";
import { authenticateToken } from "../middleware/auth";
import { AuthRequest } from "../types";
import { Rule, RuleType } from "../models/Rule";
import { BudgetCategory } from "../models/BudgetCategory";
import { Transaction } from "../models/Transaction";
import { reevaluateTransactions } from "../services/reevaluate.service";

const router = Router();

const DEFAULT_CONFIG: Record<RuleType, Record<string, any>> = {
  [RuleType.APPROVAL_THRESHOLD]: { amountCents: 5000 },
  [RuleType.GAMBLING]: {},
  [RuleType.CRYPTO]: {},
  [RuleType.MERCHANT_BLACKLIST]: { merchants: [] },
};

/** Same self-healing idea as /api/budgets -- guarantees one row per current rule type. */
async function ensureCurrentRules(ownerUserId: Types.ObjectId): Promise<void> {
  await Promise.all(
    Object.values(RuleType).map((type) =>
      Rule.updateOne(
        { ownerUserId, type },
        { $setOnInsert: { config: DEFAULT_CONFIG[type], enabled: true } },
        { upsert: true }
      )
    )
  );
}

function serialize(rule: { _id: Types.ObjectId; type: string; config: any; enabled: boolean }) {
  // Mongoose's default `minimize` strips an empty {} config before save
  // (GAMBLING/CRYPTO rules carry no config, just an enabled flag), so the
  // field can legitimately be absent -- always hand callers a real object.
  return {
    id: rule._id.toString(),
    type: rule.type,
    config: rule.config ?? {},
    enabled: rule.enabled,
  };
}

router.get("/", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = new Types.ObjectId(req.userId!);
    await ensureCurrentRules(ownerUserId);
    const rules = await Rule.find({ ownerUserId }).sort({ type: 1 }).lean();
    res.json(rules.map(serialize));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Updates a rule's enabled flag and/or config (e.g. the approval threshold amount).
router.put("/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = new Types.ObjectId(req.userId!);
    const { enabled, config } = req.body as { enabled?: boolean; config?: Record<string, any> };

    const update: Record<string, any> = {};
    if (typeof enabled === "boolean") update.enabled = enabled;
    if (config && typeof config === "object") update.config = config;

    if (Object.keys(update).length === 0) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }

    const rule = await Rule.findOneAndUpdate(
      { _id: req.params.id, ownerUserId },
      update,
      { new: true }
    ).lean();

    if (!rule) {
      res.status(404).json({ error: "Rule not found" });
      return;
    }

    res.json(serialize(rule));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Adds a merchant to the blacklist (creates the rule if it doesn't exist yet).
router.post("/blacklist", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = new Types.ObjectId(req.userId!);
    const { merchant } = req.body as { merchant?: string };

    if (!merchant || !merchant.trim()) {
      res.status(400).json({ error: "merchant is required" });
      return;
    }

    await ensureCurrentRules(ownerUserId);
    const rule = await Rule.findOne({ ownerUserId, type: RuleType.MERCHANT_BLACKLIST });
    const merchants: string[] = rule?.config?.merchants || [];
    const trimmed = merchant.trim();
    const alreadyPresent = merchants.some((m) => m.toLowerCase() === trimmed.toLowerCase());

    if (!alreadyPresent) {
      const updated = await Rule.findOneAndUpdate(
        { ownerUserId, type: RuleType.MERCHANT_BLACKLIST },
        { config: { merchants: [...merchants, trimmed] } },
        { new: true }
      ).lean();
      res.json(serialize(updated!));
      return;
    }

    res.json(serialize(rule!.toObject()));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Removes a merchant from the blacklist.
router.delete(
  "/blacklist/:merchant",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const ownerUserId = new Types.ObjectId(req.userId!);
      const merchant = decodeURIComponent(req.params.merchant).toLowerCase();

      const rule = await Rule.findOne({ ownerUserId, type: RuleType.MERCHANT_BLACKLIST });
      const merchants: string[] = rule?.config?.merchants || [];

      const updated = await Rule.findOneAndUpdate(
        { ownerUserId, type: RuleType.MERCHANT_BLACKLIST },
        { config: { merchants: merchants.filter((m) => m.toLowerCase() !== merchant) } },
        { new: true, upsert: true }
      ).lean();

      res.json(serialize(updated!));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Re-runs current rules + budgets against the user's entire transaction
// history. Rules normally only ever run once, at import time -- this is
// how a changed threshold or a newly blacklisted merchant reaches
// transactions that already exist.
router.post("/reevaluate", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = new Types.ObjectId(req.userId!);

    const [rules, budgets, transactions] = await Promise.all([
      Rule.find({ ownerUserId }).lean(),
      BudgetCategory.find({ ownerUserId }).lean(),
      Transaction.find({ ownerUserId }).select(
        "merchantNameNormalized providerCategory computedCategory amount currency bookedAt"
      ),
    ]);

    const results = reevaluateTransactions(
      transactions.map((tx) => ({
        id: tx._id.toString(),
        merchantNameNormalized: tx.merchantNameNormalized,
        providerCategory: tx.providerCategory,
        computedCategory: tx.computedCategory,
        amount: tx.amount,
        currency: tx.currency,
        bookedAt: tx.bookedAt,
      })),
      rules.map((r) => ({ type: r.type, enabled: r.enabled, config: r.config })),
      budgets.map((b) => ({ category: b.name, limit: b.monthlyLimit }))
    );

    if (results.length > 0) {
      await Transaction.bulkWrite(
        results.map((r) => ({
          updateOne: {
            filter: { _id: new Types.ObjectId(r.id) },
            update: {
              isGambling: r.isGambling,
              isCrypto: r.isCrypto,
              isBlacklisted: r.isBlacklisted,
              isOverBudget: r.isOverBudget,
              approvalRequired: r.approvalRequired,
              approvalStatus: r.approvalStatus,
            },
          },
        }))
      );
    }

    res.json({ evaluated: results.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
