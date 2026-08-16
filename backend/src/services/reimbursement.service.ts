import { Types } from "mongoose";
import { Transaction } from "../models/Transaction";
import { ReimbursementLink } from "../models/ReimbursementLink";
import { isSpendingCategory } from "../constants/categories";
import {
  suggestReimbursementMatches,
  MATCH_WINDOW_DAYS,
} from "./reimbursementMatch.service";

/**
 * CRUD + bookkeeping for linking a P2P inflow to the spend transaction(s) it
 * reimburses. DB-calling, so (per this repo's convention) not unit-tested --
 * the matching heuristic it wraps (reimbursementMatch.service.ts) is where
 * the actual logic lives and is tested.
 */

/** Sums existing links grouped by one side, for a batch of transaction ids. */
async function sumLinkedAmounts(
  ownerUserId: Types.ObjectId,
  field: "expenseTransactionId" | "reimbursementTransactionId",
  transactionIds: Types.ObjectId[]
): Promise<Map<string, number>> {
  if (transactionIds.length === 0) return new Map();

  const rows = await ReimbursementLink.aggregate<{ _id: Types.ObjectId; total: number }>([
    { $match: { ownerUserId, [field]: { $in: transactionIds } } },
    { $group: { _id: `$${field}`, total: { $sum: "$linkedAmount" } } },
  ]);

  return new Map(rows.map((r) => [r._id.toString(), r.total]));
}

function remaining(transaction: { amount: number }, alreadyLinked: number): number {
  return Math.max(0, Math.abs(transaction.amount) - alreadyLinked);
}

export interface SerializedLink {
  id: string;
  expenseTransactionId: string;
  reimbursementTransactionId: string;
  linkedAmount: number;
  createdAt: Date;
}

function serialize(link: {
  _id: Types.ObjectId;
  expenseTransactionId: Types.ObjectId;
  reimbursementTransactionId: Types.ObjectId;
  linkedAmount: number;
  createdAt: Date;
}): SerializedLink {
  return {
    id: link._id.toString(),
    expenseTransactionId: link.expenseTransactionId.toString(),
    reimbursementTransactionId: link.reimbursementTransactionId.toString(),
    linkedAmount: link.linkedAmount,
    createdAt: link.createdAt,
  };
}

/**
 * Links (all or part of) a P2P inflow to a spend transaction it reimburses,
 * netting `linkedAmount` off the expense in Net Spend totals. Throws a
 * descriptive, user-facing Error for every rejected case -- callers (routes)
 * surface these as 400s rather than 500s, same as csvImport.service.ts.
 */
export async function createReimbursementLink(
  userId: string,
  expenseTransactionId: string,
  reimbursementTransactionId: string,
  amountCents?: number
): Promise<SerializedLink> {
  const ownerUserId = new Types.ObjectId(userId);

  if (expenseTransactionId === reimbursementTransactionId) {
    throw new Error("A transaction can't reimburse itself");
  }

  const [expense, reimbursement] = await Promise.all([
    Transaction.findOne({ _id: expenseTransactionId, ownerUserId }),
    Transaction.findOne({ _id: reimbursementTransactionId, ownerUserId }),
  ]);

  if (!expense || !reimbursement) {
    throw new Error("Transaction not found");
  }

  if (expense.amount >= 0 || !isSpendingCategory(expense.computedCategory)) {
    throw new Error("The expense side must be a real spend transaction");
  }

  if (
    reimbursement.amount <= 0 ||
    reimbursement.computedCategory !== "Transfers" ||
    !reimbursement.isP2PTransfer
  ) {
    throw new Error("The reimbursement side must be a P2P inflow");
  }

  const [expenseLinked, reimbursementLinked] = await Promise.all([
    sumLinkedAmounts(ownerUserId, "expenseTransactionId", [expense._id]),
    sumLinkedAmounts(ownerUserId, "reimbursementTransactionId", [reimbursement._id]),
  ]);

  const expenseRemaining = remaining(expense, expenseLinked.get(expense._id.toString()) ?? 0);
  const reimbursementRemaining = remaining(
    reimbursement,
    reimbursementLinked.get(reimbursement._id.toString()) ?? 0
  );

  if (expenseRemaining === 0) {
    throw new Error("This expense is already fully reimbursed");
  }
  if (reimbursementRemaining === 0) {
    throw new Error("This inflow is already fully linked");
  }

  const linkedAmount = amountCents ?? Math.min(expenseRemaining, reimbursementRemaining);

  if (linkedAmount <= 0) {
    throw new Error("Link amount must be greater than zero");
  }
  if (linkedAmount > expenseRemaining) {
    throw new Error("Link amount exceeds what's left to reimburse on the expense");
  }
  if (linkedAmount > reimbursementRemaining) {
    throw new Error("Link amount exceeds what's left of the inflow");
  }

  const link = await ReimbursementLink.create({
    ownerUserId,
    expenseTransactionId: expense._id,
    reimbursementTransactionId: reimbursement._id,
    linkedAmount,
  });

  return serialize(link);
}

export async function deleteReimbursementLink(
  userId: string,
  linkId: string
): Promise<boolean> {
  const result = await ReimbursementLink.findOneAndDelete({
    _id: linkId,
    ownerUserId: new Types.ObjectId(userId),
  });
  return result !== null;
}

export interface LinkedTransactionSummary {
  id: string;
  merchantNameNormalized: string;
  rawDescription: string;
  counterpartyName: string | null;
  amount: number;
  bookedAt: Date;
}

export interface SerializedLinkWithTransactions extends SerializedLink {
  expense: LinkedTransactionSummary;
  reimbursement: LinkedTransactionSummary;
}

function summarize(tx: {
  _id: Types.ObjectId;
  merchantNameNormalized: string;
  rawDescription: string;
  counterpartyName?: string;
  amount: number;
  bookedAt: Date;
}): LinkedTransactionSummary {
  return {
    id: tx._id.toString(),
    merchantNameNormalized: tx.merchantNameNormalized,
    rawDescription: tx.rawDescription,
    counterpartyName: tx.counterpartyName ?? null,
    amount: tx.amount,
    bookedAt: tx.bookedAt,
  };
}

/**
 * Every link touching a transaction, from either side -- with both linked
 * transactions' display info populated in, so callers (the Reimbursements
 * page) can show "Zorbas Bakery" rather than a bare ObjectId.
 */
export async function listLinksForTransaction(
  userId: string,
  transactionId: string
): Promise<SerializedLinkWithTransactions[]> {
  const ownerUserId = new Types.ObjectId(userId);
  const txId = new Types.ObjectId(transactionId);

  const links = await ReimbursementLink.find({
    ownerUserId,
    $or: [{ expenseTransactionId: txId }, { reimbursementTransactionId: txId }],
  })
    .sort({ createdAt: -1 })
    .populate<{ expenseTransactionId: Parameters<typeof summarize>[0] }>(
      "expenseTransactionId",
      "merchantNameNormalized rawDescription counterpartyName amount bookedAt"
    )
    .populate<{ reimbursementTransactionId: Parameters<typeof summarize>[0] }>(
      "reimbursementTransactionId",
      "merchantNameNormalized rawDescription counterpartyName amount bookedAt"
    )
    .lean();

  return links.map((link) => ({
    id: link._id.toString(),
    expenseTransactionId: link.expenseTransactionId._id.toString(),
    reimbursementTransactionId: link.reimbursementTransactionId._id.toString(),
    linkedAmount: link.linkedAmount,
    createdAt: link.createdAt,
    expense: summarize(link.expenseTransactionId),
    reimbursement: summarize(link.reimbursementTransactionId),
  }));
}

export interface P2PInflowSummary {
  id: string;
  bookedAt: Date;
  amount: number;
  counterpartyName: string | null;
  rawDescription: string;
  linkedAmount: number;
  remainingAmount: number;
}

/** Every P2P inflow the user has received, with how much of it is already linked. */
export async function listP2PInflows(userId: string): Promise<P2PInflowSummary[]> {
  const ownerUserId = new Types.ObjectId(userId);

  const inflows = await Transaction.find({
    ownerUserId,
    computedCategory: "Transfers",
    isP2PTransfer: true,
    amount: { $gt: 0 },
  })
    .sort({ bookedAt: -1 })
    .select("bookedAt amount counterpartyName rawDescription")
    .lean();

  const linkedMap = await sumLinkedAmounts(
    ownerUserId,
    "reimbursementTransactionId",
    inflows.map((tx) => tx._id)
  );

  return inflows.map((tx) => {
    const linkedAmount = linkedMap.get(tx._id.toString()) ?? 0;
    return {
      id: tx._id.toString(),
      bookedAt: tx.bookedAt,
      amount: tx.amount,
      counterpartyName: tx.counterpartyName ?? null,
      rawDescription: tx.rawDescription,
      linkedAmount,
      remainingAmount: remaining(tx, linkedAmount),
    };
  });
}

export interface ReimbursementSuggestionView {
  transactionId: string;
  bookedAt: Date;
  amount: number;
  merchantNameNormalized: string;
  rawDescription: string;
  computedCategory: string;
  suggestedAmount: number;
  daysBefore: number;
  exactAmountMatch: boolean;
}

/** Candidate expenses this P2P inflow might be reimbursing, ranked best-first. */
export async function getReimbursementSuggestions(
  userId: string,
  reimbursementTransactionId: string
): Promise<ReimbursementSuggestionView[]> {
  const ownerUserId = new Types.ObjectId(userId);

  const inflow = await Transaction.findOne({
    _id: reimbursementTransactionId,
    ownerUserId,
  });

  if (!inflow) {
    throw new Error("Transaction not found");
  }
  if (inflow.amount <= 0 || inflow.computedCategory !== "Transfers" || !inflow.isP2PTransfer) {
    throw new Error("This transaction is not a P2P inflow");
  }

  const [inflowLinked] = await Promise.all([
    sumLinkedAmounts(ownerUserId, "reimbursementTransactionId", [inflow._id]),
  ]);
  const inflowRemaining = remaining(inflow, inflowLinked.get(inflow._id.toString()) ?? 0);
  if (inflowRemaining === 0) return [];

  const windowStart = new Date(
    new Date(inflow.bookedAt).getTime() - MATCH_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );

  const candidates = await Transaction.find({
    ownerUserId,
    amount: { $lt: 0 },
    bookedAt: { $gte: windowStart, $lte: inflow.bookedAt },
  })
    .select("bookedAt amount merchantNameNormalized rawDescription computedCategory")
    .lean();

  const spendCandidates = candidates.filter((tx) => isSpendingCategory(tx.computedCategory));
  const candidateLinked = await sumLinkedAmounts(
    ownerUserId,
    "expenseTransactionId",
    spendCandidates.map((tx) => tx._id)
  );

  const withRemaining = spendCandidates.map((tx) => ({
    ...tx,
    remainingAmount: remaining(tx, candidateLinked.get(tx._id.toString()) ?? 0),
  }));

  const suggestions = suggestReimbursementMatches(
    { bookedAt: inflow.bookedAt, remainingAmount: inflowRemaining },
    withRemaining.map((tx) => ({
      id: tx._id.toString(),
      amount: tx.amount,
      bookedAt: tx.bookedAt,
      computedCategory: tx.computedCategory,
      remainingAmount: tx.remainingAmount,
    }))
  );

  const byId = new Map(withRemaining.map((tx) => [tx._id.toString(), tx]));

  return suggestions.map((s) => {
    const tx = byId.get(s.transactionId) as (typeof withRemaining)[number];
    return {
      transactionId: s.transactionId,
      bookedAt: tx.bookedAt,
      amount: tx.amount,
      merchantNameNormalized: tx.merchantNameNormalized,
      rawDescription: tx.rawDescription,
      computedCategory: tx.computedCategory,
      suggestedAmount: s.suggestedAmount,
      daysBefore: s.daysBefore,
      exactAmountMatch: s.exactAmountMatch,
    };
  });
}

/** Total reimbursed cents per expense transaction id -- used by analytics.service.ts / stats.ts for Net Spend. */
export async function loadLinkedAmountsByExpense(
  userId: string
): Promise<Map<string, number>> {
  const rows = await ReimbursementLink.aggregate<{ _id: Types.ObjectId; total: number }>([
    { $match: { ownerUserId: new Types.ObjectId(userId) } },
    { $group: { _id: "$expenseTransactionId", total: { $sum: "$linkedAmount" } } },
  ]);

  return new Map(rows.map((r) => [r._id.toString(), r.total]));
}
