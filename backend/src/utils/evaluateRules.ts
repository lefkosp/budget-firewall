import { isSpendingCategory } from "../constants/categories";

// Generic types for rule evaluation
export interface TransactionInput {
  merchantNameNormalized: string;
  providerCategory?: string | null;
  computedCategory: string;
  amount: number;
}

export interface RuleInput {
  type: string;
  enabled: boolean;
  config: any;
}

export interface RuleEvaluationResult {
  isGambling: boolean;
  isCrypto: boolean;
  isBlacklisted: boolean;
  isOverBudget: boolean;
  approvalRequired: boolean;
  approvalStatus: "NEUTRAL" | "PENDING" | "APPROVED" | "DENIED" | "VIOLATION";
}

export interface BudgetSnapshot {
  category: string;
  spent: number; // in cents
  limit: number; // in cents
}

/**
 * Evaluates a transaction against user rules and budget constraints.
 * Rules are applied in order: blacklist → gambling → crypto → threshold → budget.
 */
export function evaluateTransaction(
  transaction: TransactionInput,
  rules: RuleInput[],
  budgetSnapshot: BudgetSnapshot[]
): RuleEvaluationResult {
  const result: RuleEvaluationResult = {
    isGambling: false,
    isCrypto: false,
    isBlacklisted: false,
    isOverBudget: false,
    approvalRequired: false,
    approvalStatus: "NEUTRAL",
  };

  // Get enabled rules by type
  const merchantBlacklistRule = rules.find(
    (r) => r.type === "MERCHANT_BLACKLIST" && r.enabled
  );
  const gamblingRule = rules.find((r) => r.type === "GAMBLING" && r.enabled);
  const cryptoRule = rules.find((r) => r.type === "CRYPTO" && r.enabled);
  const approvalThresholdRule = rules.find(
    (r) => r.type === "APPROVAL_THRESHOLD" && r.enabled
  );

  // 1. Merchant blacklist check
  if (merchantBlacklistRule) {
    const config = merchantBlacklistRule.config as { merchants?: string[] };
    const blacklist = config?.merchants || [];
    const normalizedMerchant = transaction.merchantNameNormalized.toLowerCase();

    for (const blacklistedMerchant of blacklist) {
      if (normalizedMerchant.includes(blacklistedMerchant.toLowerCase())) {
        result.isBlacklisted = true;
        result.approvalStatus = "VIOLATION";
        break;
      }
    }
  }

  // 2. Gambling check
  if (gamblingRule && result.approvalStatus === "NEUTRAL") {
    const isGamblingCategory =
      transaction.providerCategory?.toLowerCase().includes("gambling") ||
      transaction.computedCategory?.toLowerCase().includes("gambling");
    const isGamblingMerchant = isGamblingMerchantName(transaction.merchantNameNormalized);

    if (isGamblingCategory || isGamblingMerchant) {
      result.isGambling = true;
      result.approvalStatus = "VIOLATION";
    }
  }

  // 3. Crypto check
  if (cryptoRule && result.approvalStatus === "NEUTRAL") {
    const isCryptoCategory =
      transaction.providerCategory?.toLowerCase().includes("crypto") ||
      transaction.computedCategory?.toLowerCase().includes("crypto");
    const isCryptoMerchant = isCryptoMerchantName(transaction.merchantNameNormalized);

    if (isCryptoCategory || isCryptoMerchant) {
      result.isCrypto = true;
      result.approvalStatus = "VIOLATION";
    }
  }

  // 4. Approval threshold check (only if not already a violation).
  // Only spending needs approval -- asking someone to approve their own
  // salary landing, or a transfer between their own accounts, is noise.
  if (
    approvalThresholdRule &&
    result.approvalStatus === "NEUTRAL" &&
    isSpendingCategory(transaction.computedCategory)
  ) {
    const config = approvalThresholdRule.config as { amountCents?: number };
    const threshold = config?.amountCents || 0;
    const absAmount = Math.abs(transaction.amount);

    if (absAmount >= threshold) {
      result.approvalRequired = true;
      result.approvalStatus = "PENDING";
    }
  }

  // 5. Budget exceed check
  const categoryBudget = isSpendingCategory(transaction.computedCategory)
    ? budgetSnapshot.find((b) => b.category === transaction.computedCategory)
    : undefined;
  if (categoryBudget && categoryBudget.limit > 0) {
    const absAmount = Math.abs(transaction.amount);
    const newSpent = categoryBudget.spent + absAmount;

    if (newSpent > categoryBudget.limit) {
      result.isOverBudget = true;
      // Only set to VIOLATION if not already PENDING
      if (result.approvalStatus === "NEUTRAL" || result.approvalStatus === "PENDING") {
        result.approvalStatus = "VIOLATION";
      }
    }
  }

  return result;
}

/**
 * Simple gambling merchant name detection
 */
function isGamblingMerchantName(merchantName: string): boolean {
  const gamblingKeywords = [
    "bet",
    "casino",
    "poker",
    "gambling",
    "lottery",
    "bet365",
    "paddy power",
    "william hill",
  ];
  const normalized = merchantName.toLowerCase();
  return gamblingKeywords.some((keyword) => normalized.includes(keyword));
}

/**
 * Simple crypto merchant name detection
 */
function isCryptoMerchantName(merchantName: string): boolean {
  const cryptoKeywords = [
    "binance",
    "coinbase",
    "crypto",
    "bitcoin",
    "ethereum",
    "kraken",
    "crypto.com",
    "mercuryo",
  ];
  const normalized = merchantName.toLowerCase();
  return cryptoKeywords.some((keyword) => normalized.includes(keyword));
}

