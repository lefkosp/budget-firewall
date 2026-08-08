import { Types } from "mongoose";
import {
  Transaction,
  ITransaction,
  ApprovalStatus,
} from "../models/Transaction";
import { Rule } from "../models/Rule";
import { BudgetCategory } from "../models/BudgetCategory";
import { Intent, IntentStatus } from "../models/Intent";
import { normalizeMerchant } from "../utils/normalizeMerchant";
import { evaluateTransaction, BudgetSnapshot } from "../utils/evaluateRules";
import { ensureUserDefaults } from "./user.service";
import { categorizeTransaction, loadMerchantCategoryMap } from "./categorize.service";
import { matchIntents } from "./intentMatch.service";
import { DEFAULT_CATEGORY, isSpendingCategory } from "../constants/categories";

export async function syncAndProcessTransactions(
  userId: string,
  accountId: string,
  providerTransactions: Array<{
    providerTransactionId: string;
    bookedAt: Date;
    amount: number;
    currency: string;
    rawDescription: string;
    providerCategory?: string;
    transactionType?: string;
    product?: string;
    startedDate?: Date;
    balance?: number;
  }>
): Promise<ITransaction[]> {
  console.log(
    `[Transaction Service] Syncing ${providerTransactions.length} transactions for account ${accountId}`
  );

  // Ensure user has default rules and budgets
  await ensureUserDefaults(userId);

  const merchantMap = await loadMerchantCategoryMap(userId);

  const newTransactions: ITransaction[] = [];
  let duplicateCount = 0;

  for (const providerTx of providerTransactions) {
    const merchantNameNormalized = normalizeMerchant(providerTx.rawDescription);
    const computedCategory = categorizeTransaction(
      {
        merchantNameNormalized,
        rawDescription: providerTx.rawDescription,
        amount: providerTx.amount,
        transactionType: providerTx.transactionType,
        providerCategory: providerTx.providerCategory,
      },
      merchantMap
    );

    // Check if transaction already exists
    const existing = await Transaction.findOne({
      providerTransactionId: providerTx.providerTransactionId,
    });

    if (!existing) {
      // Create new transaction
      const transaction = await Transaction.create({
        ownerUserId: new Types.ObjectId(userId),
        accountId: new Types.ObjectId(accountId),
        providerTransactionId: providerTx.providerTransactionId,
        bookedAt: providerTx.bookedAt,
        amount: providerTx.amount,
        currency: providerTx.currency,
        rawDescription: providerTx.rawDescription,
        merchantNameNormalized,
        providerCategory: providerTx.providerCategory || undefined,
        computedCategory,
        transactionType: providerTx.transactionType,
        product: providerTx.product,
        startedDate: providerTx.startedDate,
        balance: providerTx.balance,
        approvalStatus: ApprovalStatus.NEUTRAL,
      });

      newTransactions.push(transaction);
    } else {
      duplicateCount++;
    }
  }

  console.log(
    `[Transaction Service] Created ${newTransactions.length} new transactions, skipped ${duplicateCount} duplicates`
  );

  // Apply rules to new transactions
  if (newTransactions.length > 0) {
    console.log(
      `[Transaction Service] Applying rules to ${newTransactions.length} new transactions`
    );
    await applyRulesToTransactions(userId, newTransactions);
    console.log(`[Transaction Service] Rules applied successfully`);
    await applyIntentMatching(userId, newTransactions);
  } else {
    console.log(`[Transaction Service] No new transactions to process`);
  }

  return newTransactions;
}

async function applyRulesToTransactions(
  userId: string,
  transactions: ITransaction[]
): Promise<void> {
  if (transactions.length === 0) return;

  // Load all user rules
  const rules = await Rule.find({ ownerUserId: new Types.ObjectId(userId) });

  // Calculate current month spend per category
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59
  );

  const existingTransactions = await Transaction.find({
    ownerUserId: new Types.ObjectId(userId),
    bookedAt: { $gte: startOfMonth, $lte: endOfMonth },
  }).select("computedCategory amount");

  // Calculate spent per category (excluding the new transactions we're about
  // to evaluate). Income and transfers are skipped -- counting a salary
  // credit or a savings top-up as "spend" would blow past every budget.
  const categorySpend: Record<string, number> = {};
  for (const tx of existingTransactions) {
    const category = tx.computedCategory || DEFAULT_CATEGORY;
    if (!isSpendingCategory(category)) continue;
    categorySpend[category] =
      (categorySpend[category] || 0) + Math.abs(tx.amount);
  }

  // Get budget limits per category
  const budgets = await BudgetCategory.find({
    ownerUserId: new Types.ObjectId(userId),
  });

  const budgetSnapshot: BudgetSnapshot[] = budgets.map((budget) => ({
    category: budget.name,
    spent: categorySpend[budget.name] || 0,
    limit: budget.monthlyLimit,
  }));

  // Add categories that have transactions but no budget
  const categoriesWithTransactions = new Set([
    ...existingTransactions.map((t) => t.computedCategory || DEFAULT_CATEGORY),
    ...transactions.map((t) => t.computedCategory || DEFAULT_CATEGORY),
  ]);
  for (const category of categoriesWithTransactions) {
    if (!isSpendingCategory(category)) continue;
    if (!budgetSnapshot.find((b) => b.category === category)) {
      budgetSnapshot.push({
        category,
        spent: categorySpend[category] || 0,
        limit: 0,
      });
    }
  }

  // Evaluate each transaction and update
  for (const transaction of transactions) {
    const evaluation = evaluateTransaction(
      {
        merchantNameNormalized: transaction.merchantNameNormalized,
        providerCategory: transaction.providerCategory || null,
        computedCategory: transaction.computedCategory,
        amount: transaction.amount,
      },
      rules.map((r) => ({
        type: r.type,
        enabled: r.enabled,
        config: r.config,
      })),
      budgetSnapshot
    );

    // Update transaction with evaluation results
    await Transaction.findByIdAndUpdate(transaction._id, {
      isGambling: evaluation.isGambling,
      isCrypto: evaluation.isCrypto,
      isBlacklisted: evaluation.isBlacklisted,
      isOverBudget: evaluation.isOverBudget,
      approvalRequired: evaluation.approvalRequired,
      approvalStatus: evaluation.approvalStatus,
    });

    // Update budget snapshot for next transaction
    const category = transaction.computedCategory || DEFAULT_CATEGORY;
    const budget = isSpendingCategory(category)
      ? budgetSnapshot.find((b) => b.category === category)
      : undefined;
    if (budget) {
      budget.spent += Math.abs(transaction.amount);
    }
  }
}

/**
 * Pre-approves newly-imported transactions that match a pending intent
 * ("I'm about to spend ~€150 at Ikea"), so an expected purchase doesn't sit
 * in Pending or get flagged as a Violation just because it crossed the
 * approval threshold or a rule. A matched transaction is marked APPROVED
 * outright and carries matchedIntentId as provenance; the intent itself is
 * marked APPROVED so it isn't matched again by a later import.
 */
async function applyIntentMatching(
  userId: string,
  transactions: ITransaction[]
): Promise<void> {
  const ownerUserId = new Types.ObjectId(userId);
  const pendingIntents = await Intent.find({
    ownerUserId,
    status: IntentStatus.PENDING,
  });

  if (pendingIntents.length === 0) return;

  const matches = matchIntents(
    transactions.map((tx) => ({
      id: tx._id.toString(),
      merchantNameNormalized: tx.merchantNameNormalized,
      amount: tx.amount,
      bookedAt: tx.bookedAt,
    })),
    pendingIntents.map((intent) => ({
      id: intent._id.toString(),
      merchantText: intent.merchantText,
      amount: intent.amount,
      expiresAt: intent.expiresAt,
    }))
  );

  if (matches.length === 0) return;

  console.log(`[Transaction Service] Matched ${matches.length} transaction(s) to intents`);

  for (const match of matches) {
    await Transaction.findByIdAndUpdate(match.transactionId, {
      matchedIntentId: new Types.ObjectId(match.intentId),
      approvalStatus: ApprovalStatus.APPROVED,
    });
    await Intent.findByIdAndUpdate(match.intentId, { status: IntentStatus.APPROVED });
  }
}
