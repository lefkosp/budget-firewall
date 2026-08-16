import { Router, Response } from "express";
import { body, param, query } from "express-validator";
import { authenticateToken } from "../middleware/auth";
import { resolveOwner, requireOwnerSelf } from "../middleware/resolveOwner";
import { validate } from "../middleware/validate";
import { AuthRequest } from "../types";
import {
  createReimbursementLink,
  deleteReimbursementLink,
  listLinksForTransaction,
  listP2PInflows,
  getReimbursementSuggestions,
} from "../services/reimbursement.service";

const router = Router();

// Every P2P inflow the user has received (money from a friend/family
// member, as opposed to an internal pocket/vault move), with how much of
// each is already linked to an expense it reimburses. Backs the
// Reimbursements page.
router.get("/inflows", authenticateToken, resolveOwner, async (req: AuthRequest, res: Response) => {
  try {
    const inflows = await listP2PInflows(req.ownerUserId!);
    res.json(inflows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Candidate expenses a specific P2P inflow might be reimbursing -- ranked
// suggestions, never auto-applied. See reimbursementMatch.service.ts.
router.get(
  "/inflows/:id/suggestions",
  authenticateToken,
  resolveOwner,
  validate([param("id").isMongoId()]),
  async (req: AuthRequest, res: Response) => {
    try {
      const suggestions = await getReimbursementSuggestions(req.ownerUserId!, req.params.id);
      res.json(suggestions);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

// Every reimbursement link touching a transaction, from either side --
// backs the "reimbursed" indicator on a transaction row/drawer.
router.get(
  "/links",
  authenticateToken,
  resolveOwner,
  validate([query("transactionId").isMongoId()]),
  async (req: AuthRequest, res: Response) => {
    try {
      const links = await listLinksForTransaction(
        req.ownerUserId!,
        req.query.transactionId as string
      );
      res.json(links);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Links (all or part of) a P2P inflow to a spend transaction it reimburses.
// amount is optional -- defaults to the smaller of what's left unreimbursed
// on each side.
router.post(
  "/links",
  authenticateToken,
  resolveOwner,
  requireOwnerSelf,
  validate([
    body("expenseTransactionId").isMongoId(),
    body("reimbursementTransactionId").isMongoId(),
    body("amount").optional().isFloat({ gt: 0 }),
  ]),
  async (req: AuthRequest, res: Response) => {
    try {
      const { expenseTransactionId, reimbursementTransactionId, amount } = req.body as {
        expenseTransactionId: string;
        reimbursementTransactionId: string;
        amount?: number;
      };

      const link = await createReimbursementLink(
        req.ownerUserId!,
        expenseTransactionId,
        reimbursementTransactionId,
        amount
      );

      res.status(201).json(link);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

router.delete(
  "/links/:id",
  authenticateToken,
  resolveOwner,
  requireOwnerSelf,
  validate([param("id").isMongoId()]),
  async (req: AuthRequest, res: Response) => {
    try {
      const deleted = await deleteReimbursementLink(req.ownerUserId!, req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Link not found" });
      }
      res.json({ deleted: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;
