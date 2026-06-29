import { Types } from "mongoose";
import {
  Transaction,
  ITransaction,
  ApprovalStatus,
} from "../models/Transaction";
import { Rule } from "../models/Rule";
import { BudgetCategory } from "../models/BudgetCategory";
import { normalizeMerchant } from "../utils/normalizeMerchant";
import { evaluateTransaction, BudgetSnapshot } from "../utils/evaluateRules";
import { ensureUserDefaults } from "./user.service";

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

  const newTransactions: ITransaction[] = [];
  let duplicateCount = 0;

  for (const providerTx of providerTransactions) {
    const merchantNameNormalized = normalizeMerchant(providerTx.rawDescription);
    const computedCategory = providerTx.providerCategory || "unknown";

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

  // Calculate spent per category (excluding the new transactions we're about to evaluate)
  const categorySpend: Record<string, number> = {};
  for (const tx of existingTransactions) {
    const category = tx.computedCategory || "unknown";
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
    ...existingTransactions.map((t) => t.computedCategory || "unknown"),
    ...transactions.map((t) => t.computedCategory || "unknown"),
  ]);
  for (const category of categoriesWithTransactions) {
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
    const category = transaction.computedCategory || "unknown";
    const budget = budgetSnapshot.find((b) => b.category === category);
    if (budget) {
      budget.spent += Math.abs(transaction.amount);
    }
  }
}
