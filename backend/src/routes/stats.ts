import { Router, Response } from "express";
import { Types } from "mongoose";
import { authenticateToken } from "../middleware/auth";
import { AuthRequest } from "../types";
import { Transaction } from "../models/Transaction";
import { NON_SPEND_CATEGORIES } from "../constants/categories";
import { buildAnalyticsBundle } from "../services/analytics.service";

const router = Router();

const RECENT_LIST_SIZE = 5;

interface KpiRow {
  totalSpend: number;
  violations: number;
  violationsSpend: number;
  pendingApprovals: number;
  gamblingCount: number;
  cryptoCount: number;
  totalTransactions: number;
}

const EMPTY_KPIS: KpiRow = {
  totalSpend: 0,
  violations: 0,
  violationsSpend: 0,
  pendingApprovals: 0,
  gamblingCount: 0,
  cryptoCount: 0,
  totalTransactions: 0,
};

/**
 * Every dashboard KPI in a single pass over the user's transactions.
 * `totalSpend` excludes non-spend categories (income, transfers, fees) --
 * expressed as "not in NON_SPEND" rather than "in SPENDING" so it matches
 * isSpendingCategory exactly, including for any category outside the
 * current taxonomy.
 */
async function loadKpis(ownerUserId: Types.ObjectId): Promise<KpiRow> {
  const [row] = await Transaction.aggregate<KpiRow>([
    { $match: { ownerUserId } },
    {
      $group: {
        _id: null,
        totalSpend: {
          $sum: {
            $cond: [
              { $in: ["$computedCategory", NON_SPEND_CATEGORIES] },
              0,
              { $abs: "$amount" },
            ],
          },
        },
        violations: {
          $sum: { $cond: [{ $eq: ["$approvalStatus", "VIOLATION"] }, 1, 0] },
        },
        violationsSpend: {
          $sum: {
            $cond: [{ $eq: ["$approvalStatus", "VIOLATION"] }, { $abs: "$amount" }, 0],
          },
        },
        pendingApprovals: {
          $sum: { $cond: [{ $eq: ["$approvalStatus", "PENDING"] }, 1, 0] },
        },
        gamblingCount: { $sum: { $cond: ["$isGambling", 1, 0] } },
        cryptoCount: { $sum: { $cond: ["$isCrypto", 1, 0] } },
        totalTransactions: { $sum: 1 },
      },
    },
    { $project: { _id: 0 } },
  ]);

  return row ?? EMPTY_KPIS;
}

/**
 * Merchants with 2+ violations, for the "Repeat Violation" badge.
 *
 * This is now counted across the user's whole history. The client-side
 * version it replaces could only count within the page of transactions it
 * had loaded, and said so in a comment ("best-effort... not full history") --
 * moving the count into the database makes the badge actually mean what it
 * says.
 */
async function loadRepeatViolationMerchants(
  ownerUserId: Types.ObjectId
): Promise<Set<string>> {
  const rows = await Transaction.aggregate<{ _id: string }>([
    { $match: { ownerUserId, approvalStatus: "VIOLATION" } },
    { $group: { _id: "$merchantNameNormalized", count: { $sum: 1 } } },
    { $match: { count: { $gte: 2 } } },
  ]);

  return new Set(rows.map((r) => r._id));
}

async function loadRecentByStatus(ownerUserId: Types.ObjectId, status: string) {
  return Transaction.find({ ownerUserId, approvalStatus: status })
    .sort({ bookedAt: -1 })
    .limit(RECENT_LIST_SIZE)
    .select("bookedAt amount currency merchantNameNormalized isGambling isCrypto isBlacklisted")
    .lean();
}

// KPIs plus the two "needs attention" lists the dashboard renders.
router.get("/dashboard", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = new Types.ObjectId(req.userId!);

    const [kpis, pending, violations, repeatMerchants] = await Promise.all([
      loadKpis(ownerUserId),
      loadRecentByStatus(ownerUserId, "PENDING"),
      loadRecentByStatus(ownerUserId, "VIOLATION"),
      loadRepeatViolationMerchants(ownerUserId),
    ]);

    const shape = (tx: (typeof pending)[number]) => ({
      id: tx._id.toString(),
      bookedAt: tx.bookedAt,
      amount: tx.amount,
      currency: tx.currency,
      merchantNameNormalized: tx.merchantNameNormalized,
      isGambling: tx.isGambling,
      isCrypto: tx.isCrypto,
      isBlacklisted: tx.isBlacklisted,
    });

    res.json({
      kpis,
      pendingTransactions: pending.map(shape),
      violationTransactions: violations.map((tx) => ({
        ...shape(tx),
        isRepeatViolation: repeatMerchants.has(tx.merchantNameNormalized),
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Every chart dataset for the Analytics and Dashboard pages.
 *
 * Transactions are still materialized here rather than aggregated entirely
 * in Mongo: the series calculations (daily/monthly spend, processing-time
 * averaging, balance-over-time ordering) are far clearer as plain functions
 * than as pipeline stages, and keeping them that way is what makes them
 * unit-testable. The expensive part -- shipping every transaction over the
 * network to the browser -- is what this removes. If transaction volume
 * grows enough for the in-process pass to matter (post-Open-Banking), the
 * group-and-sum stats are the ones to push into the pipeline first.
 */
router.get("/analytics", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = new Types.ObjectId(req.userId!);

    const transactions = await Transaction.find({ ownerUserId })
      .select(
        "bookedAt amount currency rawDescription merchantNameNormalized computedCategory transactionType product startedDate balance"
      )
      .lean();

    res.json(buildAnalyticsBundle(transactions));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
