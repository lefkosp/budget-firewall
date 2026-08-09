import { Router, Request, Response } from "express";
import { param } from "express-validator";
import { authenticateToken } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { AuthRequest } from "../types";
import {
  createRequisition,
  handleCallback,
  provider,
  syncAccountsForConnection,
} from "../services/banking.service";
import { BankConnection, BankConnectionStatus } from "../models/BankConnection";
import { Account } from "../models/Account";
import { Types } from "mongoose";
import { config } from "../config/env";
import { getConsentRenewalState } from "../utils/consentExpiry";

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

// Callback route - handles both mock and real OAuth flows. Always reached
// via a top-level browser navigation (the user's bank redirects here after
// consent), so every outcome -- success or failure -- redirects back to the
// frontend rather than dead-ending on a raw JSON response.
router.get("/callback", async (req: Request, res: Response) => {
  const frontendUrl = config.frontendUrl;
  const isMock = req.query.mock === "true";

  try {
    if (isMock) {
      const requisitionId = req.query.requisitionId;
      if (!requisitionId || typeof requisitionId !== "string") {
        return res.redirect(`${frontendUrl}/connect?error=missing_requisition`);
      }

      const bankConnection = await BankConnection.findOne({ requisitionId });
      if (!bankConnection) {
        return res.redirect(`${frontendUrl}/connect?error=invalid_requisition`);
      }

      await handleCallback(bankConnection.ownerUserId.toString(), requisitionId);
      return res.redirect(`${frontendUrl}/connect?linked=true`);
    }

    // Real GoCardless flow: the bank redirects here with our own reference
    // as `?ref=`, not their requisition ID (see types/openbanking.ts).
    const ref = req.query.ref;
    if (!ref || typeof ref !== "string") {
      return res.redirect(`${frontendUrl}/connect?error=missing_reference`);
    }

    const bankConnection = await BankConnection.findOne({ requisitionId: ref });
    if (!bankConnection || !bankConnection.providerRequisitionId) {
      return res.redirect(`${frontendUrl}/connect?error=invalid_requisition`);
    }

    const requisitionStatus = await provider.getRequisition(bankConnection.providerRequisitionId);
    // GoCardless statuses: "LN" = Linked, "CR" = Created, "EX" = Expired, "RJ" = Rejected
    if (requisitionStatus.status !== "LN") {
      return res.redirect(`${frontendUrl}/connect?error=not_authorized`);
    }

    await handleCallback(bankConnection.ownerUserId.toString(), ref);
    return res.redirect(`${frontendUrl}/connect?linked=true`);
  } catch (error: any) {
    return res.redirect(`${frontendUrl}/connect?error=${encodeURIComponent(error.message)}`);
  }
});

router.post(
  "/sync",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.userId!;

      const bankConnection = await BankConnection.findOne({
        ownerUserId: new Types.ObjectId(userId),
        status: "LINKED",
      });

      if (!bankConnection) {
        return res
          .status(404)
          .json({ error: "No linked bank connection found" });
      }

      const result = await syncAccountsForConnection(userId);

      if (result.accountsSynced === 0) {
        return res.status(404).json({ error: "No accounts found" });
      }

      res.json({
        success: true,
        imported: result.transactionsImported,
        new: result.transactionsNew,
        accounts: result.accountsSynced,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Every linked bank connection for the user, with its accounts and consent
// renewal state. Array-shaped for forward-compat even though today's model
// (and UI) still assume a single connection per user.
router.get("/connections", authenticateToken, async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const ownerUserId = new Types.ObjectId(userId);

  const [connections, accounts] = await Promise.all([
    BankConnection.find({ ownerUserId }).sort({ createdAt: -1 }),
    Account.find({ ownerUserId }),
  ]);

  const now = new Date();
  res.json({
    connections: connections.map((connection) => ({
      id: connection._id.toString(),
      provider: connection.provider,
      status: connection.status,
      consentExpiresAt: connection.consentExpiresAt,
      renewalState: getConsentRenewalState(connection.consentExpiresAt, now),
      createdAt: connection.createdAt,
      accounts: accounts.map((account) => ({
        id: account._id.toString(),
        name: account.name,
        currency: account.currency,
        lastSyncedAt: account.lastSyncedAt,
      })),
    })),
  });
});

// Revokes a connection locally and (best-effort) with the provider.
// Historical transactions and accounts are kept -- nothing else in the app
// destructively deletes on disconnect either.
router.delete(
  "/connections/:id",
  authenticateToken,
  validate([param("id").isMongoId()]),
  async (req: AuthRequest, res: Response) => {
    const userId = req.userId!;

    const connection = await BankConnection.findOne({
      _id: req.params.id,
      ownerUserId: new Types.ObjectId(userId),
    });

    if (!connection) {
      return res.status(404).json({ error: "Connection not found" });
    }

    if (connection.providerRequisitionId) {
      try {
        await provider.deleteRequisition(connection.providerRequisitionId);
      } catch (error: any) {
        // A locally-revoked-but-remotely-stuck consent is safer than the
        // reverse -- don't block disconnect on the provider's own cleanup.
        console.error(`[Banking] Failed to delete requisition with provider: ${error.message}`);
      }
    }

    connection.status = BankConnectionStatus.REVOKED;
    await connection.save();

    res.json({ success: true });
  }
);

export default router;
