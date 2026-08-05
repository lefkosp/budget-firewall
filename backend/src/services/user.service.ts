import { Types } from "mongoose";
import { Rule, RuleType } from "../models/Rule";
import { BudgetCategory } from "../models/BudgetCategory";
import { SPENDING_CATEGORIES } from "../constants/categories";

/**
 * Ensures default rules and budget categories exist for a user.
 * Called on first user creation or first bank connection.
 */
export async function ensureUserDefaults(userId: string): Promise<void> {
  // Check if user already has rules
  const existingRulesCount = await Rule.countDocuments({
    ownerUserId: new Types.ObjectId(userId),
  });

  if (existingRulesCount === 0) {
    // Create default rules
    await Rule.insertMany([
      {
        ownerUserId: new Types.ObjectId(userId),
        type: RuleType.APPROVAL_THRESHOLD,
        config: { amountCents: 5000 }, // €50
        enabled: true,
      },
      {
        ownerUserId: new Types.ObjectId(userId),
        type: RuleType.GAMBLING,
        config: {},
        enabled: true,
      },
      {
        ownerUserId: new Types.ObjectId(userId),
        type: RuleType.CRYPTO,
        config: {},
        enabled: true,
      },
      {
        ownerUserId: new Types.ObjectId(userId),
        type: RuleType.MERCHANT_BLACKLIST,
        config: { merchants: [] },
        enabled: true,
      },
    ]);
  }

  // Check if user already has budget categories
  const existingBudgetsCount = await BudgetCategory.countDocuments({
    ownerUserId: new Types.ObjectId(userId),
  });

  if (existingBudgetsCount === 0) {
    // One budget category per spending category, so budgets and transaction
    // categories always line up. Non-spend categories (Income, Transfers,
    // Fees) deliberately get none -- you don't budget your salary.
    await BudgetCategory.insertMany(
      SPENDING_CATEGORIES.map((name) => ({
        ownerUserId: new Types.ObjectId(userId),
        name,
        monthlyLimit: 0, // No limit by default
      }))
    );
  }
}

