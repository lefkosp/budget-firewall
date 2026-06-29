import { Router, Response } from "express";
import { authenticateToken } from "../middleware/auth";
import { AuthRequest } from "../types";
import { Transaction } from "../models/Transaction";
import { Types } from "mongoose";
import multer from "multer";
import { importTransactionsFromCSV } from "../services/csvImport.service";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

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

    // Merchant search (case-insensitive partial match)
    if (merchant && typeof merchant === "string") {
      query.$or = [
        { merchantNameNormalized: { $regex: merchant, $options: "i" } },
        { rawDescription: { $regex: merchant, $options: "i" } },
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

router.post(
  "/import-csv",
  authenticateToken,
  upload.single("csvFile"),
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

export default router;
