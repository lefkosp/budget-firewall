import { Router, Request, Response } from "express";
import { authenticateToken } from "../middleware/auth";
import { AuthRequest } from "../types";
import {
  createRequisition,
  handleCallback,
  provider,
} from "../services/banking.service";
import { Account } from "../models/Account";
import { BankConnection } from "../models/BankConnection";
import { syncAndProcessTransactions } from "../services/transaction.service";
import { Types } from "mongoose";

const router = Router();

router.post(
  "/requisition",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const result = await createRequisition(userId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Callback route - handles both mock and real OAuth flows
router.get("/callback", async (req: Request, res: Response) => {
  try {
    const { requisitionId, mock } = req.query;

    if (!requisitionId || typeof requisitionId !== "string") {
      return res.status(400).json({ error: "Missing requisitionId" });
    }

    // For mock flow, we don't require authentication but verify the requisition exists
    const isMock = mock === "true";

    if (isMock) {
      // Look up the requisition to get the userId
      const bankConnection = await BankConnection.findOne({ requisitionId });
      if (!bankConnection) {
        return res.status(404).json({ error: "Invalid requisition" });
      }

      const userId = bankConnection.ownerUserId.toString();
      const accountsCount = await handleCallback(userId, requisitionId);

      // Redirect to frontend connect page with success
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
      return res.redirect(`${frontendUrl}/connect?linked=true`);
    }

    // For real OAuth flow, we would handle the OAuth code exchange here
    // For now, return an error since we only support mock flows
    res.status(400).json({ error: "Real OAuth flow not yet implemented" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post(
  "/sync",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.userId!;

      // Get user's linked bank connection
      const bankConnection = await BankConnection.findOne({
        ownerUserId: new Types.ObjectId(userId),
        status: "LINKED",
      });

      if (!bankConnection) {
        return res
          .status(404)
          .json({ error: "No linked bank connection found" });
      }

      // Get all accounts for this user
      const accounts = await Account.find({
        ownerUserId: new Types.ObjectId(userId),
      });

      if (accounts.length === 0) {
        return res.status(404).json({ error: "No accounts found" });
      }

      // Sync transactions for each account
      let totalImported = 0;
      let totalNew = 0;

      // Use provider from banking service (already imported)

      for (const account of accounts) {
        // Fetch transactions from provider (last 30 days)
        const dateFrom = new Date();
        dateFrom.setDate(dateFrom.getDate() - 30);

        // Get provider transactions
        const providerTransactions = await provider.getTransactions(
          account.providerAccountId,
          dateFrom
        );

        // Sync and process transactions
        const newTransactions = await syncAndProcessTransactions(
          userId,
          account._id.toString(),
          providerTransactions
        );

        totalImported += providerTransactions.length;
        totalNew += newTransactions.length;
      }

      res.json({
        success: true,
        imported: totalImported,
        new: totalNew,
        accounts: accounts.length,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;
