import { Router, Response } from "express";
import { Types } from "mongoose";
import { authenticateToken } from "../middleware/auth";
import { AuthRequest } from "../types";
import { Transaction } from "../models/Transaction";
import { BudgetCategory } from "../models/BudgetCategory";
import { SPENDING_CATEGORIES } from "../constants/categories";
import { startOfUTCMonth, endOfUTCMonth } from "../utils/monthWindow";
import { detectSubscriptions, monthlyCost } from "../services/subscriptions.service";
import { suggestBudgets, applySubscriptionsOverride } from "../services/budgetSuggest.service";

const router = Router();

/**
 * Guarantees a BudgetCategory row exists for every category in the current
 * taxonomy. ensureUserDefaults only seeds these once, at signup -- an
 * account created before a taxonomy change (categories renamed, added, or
 * dropped) would otherwise be stuck with stale rows forever. Upserting on
 * every read is cheap (10 categories) and means the taxonomy is always the
 * single source of truth, no migration script required. Existing rows for
 * categories no longer in the taxonomy are left alone (not deleted) and
 * simply excluded from what callers see.
 */
async function ensureCurrentCategories(ownerUserId: Types.ObjectId): Promise<void> {
  await Promise.all(
    SPENDING_CATEGORIES.map((name) =>
      BudgetCategory.updateOne(
        { ownerUserId, name },
        { $setOnInsert: { monthlyLimit: 0 } },
        { upsert: true }
      )
    )
  );
}

/**
 * This calendar month's spend per category, computed in the database rather
 * than by shipping every transaction to the browser to be summed there.
 *
 * Month bounds are UTC (see utils/monthWindow.ts) to match how bookedAt is
 * stored -- the client-side version this replaces used browser-local
 * getMonth(), which put boundary transactions in the wrong month for anyone
 * in a timezone behind UTC.
 *
 * Only money out counts, matching budgetSuggest.service -- "spent" and the
 * suggestion derived from it should never disagree about what spending is.
 */
async function spendThisMonthByCategory(
  ownerUserId: Types.ObjectId,
  now: Date = new Date()
): Promise<Record<string, number>> {
  const rows = await Transaction.aggregate<{ _id: string; spent: number }>([
    {
      $match: {
        ownerUserId,
        bookedAt: { $gte: startOfUTCMonth(now), $lte: endOfUTCMonth(now) },
        amount: { $lt: 0 },
        computedCategory: { $in: SPENDING_CATEGORIES },
        currency: "EUR",
      },
    },
    { $group: { _id: "$computedCategory", spent: { $sum: { $abs: "$amount" } } } },
  ]);

  return Object.fromEntries(rows.map((r) => [r._id, r.spent]));
}

async function currentBudgets(ownerUserId: Types.ObjectId) {
  const [budgets, spendByCategory] = await Promise.all([
    BudgetCategory.find({
      ownerUserId,
      name: { $in: SPENDING_CATEGORIES },
    })
      .sort({ name: 1 })
      .lean(),
    spendThisMonthByCategory(ownerUserId),
  ]);

  return budgets.map((b) => ({
    id: b._id.toString(),
    name: b.name,
    monthlyLimit: b.monthlyLimit,
    spentThisMonth: spendByCategory[b.name] ?? 0,
  }));
}

// Current budget limits, one row per spending category.
router.get("/", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = new Types.ObjectId(req.userId!);
    await ensureCurrentCategories(ownerUserId);
    res.json(await currentBudgets(ownerUserId));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Per-category suggested limits, derived from historical spend. Subscriptions
// gets its suggestion replaced with the detected recurring total -- see
// budgetSuggest.service's applySubscriptionsOverride for why.
router.get("/suggestions", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = new Types.ObjectId(req.userId!);

    // EUR-only v1: suggestions (and the recurring-subscription override
    // merged into them below) are derived only from EUR spend.
    const transactions = await Transaction.find({ ownerUserId, currency: "EUR" }).select(
      "merchantNameNormalized computedCategory amount bookedAt"
    );

    let suggestions = suggestBudgets(transactions);

    const recurring = detectSubscriptions(transactions).filter(
      (sub) => sub.computedCategory === "Subscriptions"
    );
    if (recurring.length > 0) {
      const recurringMonthlyTotal = Math.round(
        recurring.reduce((sum, sub) => sum + monthlyCost(sub), 0)
      );
      suggestions = applySubscriptionsOverride(suggestions, recurringMonthlyTotal);
    }

    res.json({ suggestions });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Updates a single category's limit (the "edit" half of review & accept).
router.put("/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = new Types.ObjectId(req.userId!);
    const { monthlyLimit } = req.body;

    if (typeof monthlyLimit !== "number" || monthlyLimit < 0) {
      res.status(400).json({ error: "monthlyLimit must be a non-negative number" });
      return;
    }

    const budget = await BudgetCategory.findOneAndUpdate(
      { _id: req.params.id, ownerUserId },
      { monthlyLimit },
      { new: true }
    ).lean();

    if (!budget) {
      res.status(404).json({ error: "Budget category not found" });
      return;
    }

    res.json({ id: budget._id.toString(), name: budget.name, monthlyLimit: budget.monthlyLimit });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// "Accept all suggestions" -- applies every suggested amount in one request
// instead of the frontend firing one PUT per category.
router.post("/accept-all", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = new Types.ObjectId(req.userId!);
    const { suggestions } = req.body as {
      suggestions: { category: string; suggested: number }[];
    };

    if (!Array.isArray(suggestions)) {
      res.status(400).json({ error: "suggestions must be an array" });
      return;
    }

    await ensureCurrentCategories(ownerUserId);
    await Promise.all(
      suggestions.map((s) =>
        BudgetCategory.updateOne(
          { ownerUserId, name: s.category },
          { monthlyLimit: s.suggested }
        )
      )
    );

    res.json(await currentBudgets(ownerUserId));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
