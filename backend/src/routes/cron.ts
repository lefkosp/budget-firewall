import { Router, Request, Response } from "express";
import { BankConnection, BankConnectionStatus } from "../models/BankConnection";
import { syncAccountsForConnection } from "../services/banking.service";
import { cronAuth } from "../middleware/cronAuth";

const router = Router();

/**
 * Background sync sweep, meant to be hit by an external scheduler (Railway
 * Cron / Render Cron Jobs / a GitHub Actions schedule) rather than an
 * in-process timer -- this deploys as a normal web dyno, not an always-on
 * worker, so an in-process scheduler would only fire while the dyno
 * happens to be warm. See README for the exact invocation.
 */
router.post("/sync-all", cronAuth, async (req: Request, res: Response) => {
  const connections = await BankConnection.find({ status: BankConnectionStatus.LINKED });

  let accountsSynced = 0;
  let transactionsImported = 0;
  const errors: Array<{ connectionId: string; message: string }> = [];

  for (const connection of connections) {
    try {
      const result = await syncAccountsForConnection(connection.ownerUserId.toString());
      accountsSynced += result.accountsSynced;
      transactionsImported += result.transactionsImported;
    } catch (error: any) {
      // One broken connection (expired consent, provider outage) shouldn't
      // abort the sweep for everyone else.
      errors.push({ connectionId: connection._id.toString(), message: error.message });
    }
  }

  res.json({
    connectionsProcessed: connections.length,
    accountsSynced,
    transactionsImported,
    errors,
  });
});

export default router;
