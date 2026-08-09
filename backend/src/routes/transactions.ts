import { Router, Response, NextFunction } from "express";
import { authenticateToken } from "../middleware/auth";
import { AuthRequest } from "../types";
import { Transaction } from "../models/Transaction";
import { Types } from "mongoose";
import multer from "multer";
import { importTransactionsFromCSV } from "../services/csvImport.service";
import { recategorizeUserTransactions } from "../services/categorize.service";
import { setTransactionCategory } from "../services/categoryOverride.service";
import { decideTransaction, getTransactionApprovalHistory } from "../services/approval.service";
import { ApprovalDecision } from "../models/Approval";
import { isValidCategory } from "../constants/categories";
import { escapeRegex } from "../utils/escapeRegex";
import { importRateLimiter } from "../middleware/rateLimit";

const router = Router();
// 10MB cap: the memory-storage engine buffers the whole file in the
// process's memory before it ever reaches the parser, so an unbounded
// upload is a straightforward way to OOM the server. The real Revolut
// export this was built against is well under 1MB for a full year of
// transactions -- 10MB is generous headroom, not a tight fit.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// multer's own errors (oversized file, malformed multipart body) surface via
// a callback rather than a thrown exception, so they never reach the route
// handler's try/catch below -- this turns them into the same JSON error
// shape as everything else instead of falling through to the generic 500
// error handler with a confusing "File too large" message on a 500.
function handleCsvUpload(req: AuthRequest, res: Response, next: NextFunction) {
  upload.single("csvFile")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({ error: "CSV file is too large (10MB limit)" });
        return;
      }
      res.status(400).json({ error: err.message });
      return;
    }
    if (err) {
      next(err);
      return;
    }
    next();
  });
}

router.get("/", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const {
      month,
      startDate,
      endDate,
      status,
      isGambling,
      isCrypto,
      isBlacklisted,
      category,
      merchant,
      minAmount,
      maxAmount,
      sortBy,
      sortOrder,
      page,
      limit,
    } = req.query;

    // Build query
    const query: any = {
      ownerUserId: new Types.ObjectId(userId),
    };

    // Date filtering: month takes precedence, then date range, then no filter (all transactions)
    if (month && typeof month === "string") {
      const [year, monthNum] = month.split("-").map(Number);
      const monthStart = new Date(year, monthNum - 1, 1);
      const monthEnd = new Date(year, monthNum, 0, 23, 59, 59);
      query.bookedAt = {
        $gte: monthStart,
        $lte: monthEnd,
      };
    } else if (startDate || endDate) {
      query.bookedAt = {};
      if (startDate && typeof startDate === "string") {
        query.bookedAt.$gte = new Date(startDate);
      }
      if (endDate && typeof endDate === "string") {
        query.bookedAt.$lte = new Date(endDate);
      }
    }
    // If no date filter specified, return all transactions

    // Status filter
    if (status) {
      query.approvalStatus = status;
    }

    // Flag filters
    if (isGambling === "true") {
      query.isGambling = true;
    }
    if (isCrypto === "true") {
      query.isCrypto = true;
    }
    if (isBlacklisted === "true") {
      query.isBlacklisted = true;
    }

    // Category filter
    if (category && typeof category === "string") {
      query.computedCategory = category;
    }

    // Merchant search (case-insensitive partial match). The search term is
    // escaped before it reaches $regex -- unescaped, a term containing
    // regex metacharacters is interpreted as a pattern rather than literal
    // text (ReDoS risk from a pathological pattern, or a filter bypass from
    // something like ".*" matching every transaction).
    if (merchant && typeof merchant === "string") {
      const pattern = escapeRegex(merchant);
      query.$or = [
        { merchantNameNormalized: { $regex: pattern, $options: "i" } },
        { rawDescription: { $regex: pattern, $options: "i" } },
      ];
    }

    // Amount range filters
    if (minAmount || maxAmount) {
      query.amount = {};
      if (minAmount && typeof minAmount === "string") {
        query.amount.$gte = parseInt(minAmount, 10);
      }
      if (maxAmount && typeof maxAmount === "string") {
        query.amount.$lte = parseInt(maxAmount, 10);
      }
    }

    // Sorting
    const sortField =
      sortBy && typeof sortBy === "string" ? sortBy : "bookedAt";
    const sortDirection = sortOrder === "asc" ? 1 : -1;
    const sortOptions: any = {};
    sortOptions[sortField] = sortDirection;

    // Pagination
    const pageNum = page && typeof page === "string" ? parseInt(page, 10) : 1;
    const limitNum = limit && typeof limit === "string" ? parseInt(limit, 10) : 100;
    const skip = (pageNum - 1) * limitNum;

    // Get total count for pagination metadata
    const total = await Transaction.countDocuments(query);

    const transactions = await Transaction.find(query)
      .populate("accountId", "name currency")
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Transform to match frontend expectations
    const transformed = transactions.map((tx: any) => ({
      ...tx,
      id: tx._id.toString(),
      accountId: tx.accountId._id.toString(),
      account: {
        name: tx.accountId.name,
        currency: tx.accountId.currency,
      },
      _id: undefined,
    }));

    res.json({
      data: transformed,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get available categories for filtering
router.get(
  "/categories",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const categories = await Transaction.distinct("computedCategory", {
        ownerUserId: new Types.ObjectId(userId),
      });
      res.json(categories.sort());
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Manually set a transaction's category. Marks it as overridden so
// recategorize never clobbers it. With applyToAllFromMerchant, also
// remembers the correction for every future import from that merchant and
// applies it to the user's other existing transactions from them.
router.patch(
  "/:id",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const { category, applyToAllFromMerchant } = req.body as {
        category?: string;
        applyToAllFromMerchant?: boolean;
      };

      if (!category || !isValidCategory(category)) {
        return res.status(400).json({ error: "Invalid category" });
      }

      const result = await setTransactionCategory(
        req.userId!,
        req.params.id,
        category,
        Boolean(applyToAllFromMerchant)
      );

      if (!result) {
        return res.status(404).json({ error: "Transaction not found" });
      }

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Re-run normalization + categorization over existing history. Safe to call
// repeatedly; manual category overrides are preserved.
router.post(
  "/recategorize",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const result = await recategorizeUserTransactions(req.userId!);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

router.post(
  "/import-csv",
  authenticateToken,
  importRateLimiter,
  handleCsvUpload,
  async (req: AuthRequest, res: Response) => {
    const startTime = Date.now();
    const userId = req.userId!;

    console.log(`[CSV Import] ===== REQUEST RECEIVED =====`);
    console.log(`[CSV Import] User ID: ${userId}`);
    console.log(`[CSV Import] Headers:`, JSON.stringify(req.headers, null, 2));

    try {
      console.log(`[CSV Import] Starting import for user ${userId}`);
      const file = req.file;

      if (!file) {
        console.log(`[CSV Import] Error: No file provided for user ${userId}`);
        return res.status(400).json({ error: "No CSV file provided" });
      }

      console.log(
        `[CSV Import] File received: ${file.originalname} (${file.size} bytes, ${file.mimetype})`
      );

      // Check file type
      if (
        !file.mimetype.includes("csv") &&
        !file.originalname.endsWith(".csv")
      ) {
        console.log(
          `[CSV Import] Error: Invalid file type for ${file.originalname}`
        );
        return res.status(400).json({ error: "File must be a CSV file" });
      }

      // Parse CSV content
      const csvContent = file.buffer.toString("utf-8");
      const accountName = req.body.accountName;
      const currency = req.body.currency || "EUR";

      console.log(
        `[CSV Import] CSV content length: ${csvContent.length} chars`
      );
      console.log(
        `[CSV Import] Account name: ${
          accountName || "default"
        }, Currency: ${currency}`
      );

      // Import transactions
      const result = await importTransactionsFromCSV(
        userId,
        csvContent,
        accountName,
        currency
      );

      const duration = Date.now() - startTime;
      console.log(
        `[CSV Import] Completed in ${duration}ms - Imported: ${result.imported}, New: ${result.new}, Skipped: ${result.skipped}, Errors: ${result.errors.length}`
      );

      res.json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(
        `[CSV Import] Failed after ${duration}ms for user ${userId}:`,
        error.message
      );
      res.status(400).json({ error: error.message });
    }
  }
);

// Approve/deny a flagged or pending transaction. The owner self-approves
// for now -- same mechanics a collaborator will use later (Phase 6), just
// with actorUserId always equal to ownerUserId until then.
router.post(
  "/:id/approve",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const { note } = req.body as { note?: string };
      const result = await decideTransaction(
        req.userId!,
        req.userId!,
        req.params.id,
        ApprovalDecision.APPROVED,
        note
      );
      if (!result) {
        return res.status(404).json({ error: "Transaction not found" });
      }
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

router.post(
  "/:id/deny",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const { note } = req.body as { note?: string };
      const result = await decideTransaction(
        req.userId!,
        req.userId!,
        req.params.id,
        ApprovalDecision.DENIED,
        note
      );
      if (!result) {
        return res.status(404).json({ error: "Transaction not found" });
      }
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

router.get(
  "/:id/approvals",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const history = await getTransactionApprovalHistory(req.userId!, req.params.id);
      res.json(
        history.map((a) => ({
          id: a._id.toString(),
          decision: a.decision,
          note: a.note,
          createdAt: a.createdAt,
        }))
      );
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;
