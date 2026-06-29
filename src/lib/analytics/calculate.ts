export interface Transaction {
  id: string;
  bookedAt: string;
  amount: number;
  currency: string;
  rawDescription: string;
  merchantNameNormalized: string;
  computedCategory: string;
  transactionType?: string;
  product?: string;
  startedDate?: string;
  balance?: number;
  isGambling: boolean;
  isCrypto: boolean;
  isBlacklisted: boolean;
  approvalStatus: string;
}

export interface TransactionTypeStats {
  type: string;
  count: number;
  totalSpend: number;
  averageAmount: number;
}

export interface ProductStats {
  product: string;
  count: number;
  totalSpend: number;
  averageAmount: number;
}

export interface TimeStats {
  averageProcessingTime: number; // in hours
  transactionsByDayOfWeek: Record<string, number>;
  transactionsByHour: Record<number, number>;
  peakSpendingDay: string;
  dailySpending: Array<{ date: string; amount: number }>;
  monthlySpending: Array<{ month: string; amount: number }>;
}

export interface FeeStats {
  totalFees: number;
  averageFee: number;
  highestFee: number;
  feesByType: Record<string, number>;
  feeTrends: Array<{ date: string; fee: number }>;
}

export interface BalanceStats {
  currentBalance: number;
  balanceChange: number;
  lowestBalance: number;
  highestBalance: number;
  balanceOverTime: Array<{ date: string; balance: number }>;
  balanceByProduct: Record<string, number>;
}

export interface CurrencyStats {
  currency: string;
  count: number;
  totalSpend: number;
}

export interface CategoryStats {
  category: string;
  count: number;
  totalSpend: number;
}

export interface MerchantStats {
  merchant: string;
  count: number;
  totalSpend: number;
  averageAmount: number;
}

export interface StateStats {
  state: string;
  count: number;
  percentage: number;
}

export function calculateTransactionTypeStats(
  transactions: Transaction[]
): TransactionTypeStats[] {
  const typeMap = new Map<string, { count: number; totalSpend: number }>();

  transactions.forEach((tx) => {
    const type = tx.transactionType || "UNKNOWN";
    const amount = Math.abs(tx.amount);

    if (!typeMap.has(type)) {
      typeMap.set(type, { count: 0, totalSpend: 0 });
    }

    const stats = typeMap.get(type)!;
    stats.count++;
    stats.totalSpend += amount;
  });

  return Array.from(typeMap.entries())
    .map(([type, stats]) => ({
      type,
      count: stats.count,
      totalSpend: stats.totalSpend,
      averageAmount: stats.totalSpend / stats.count,
    }))
    .sort((a, b) => b.totalSpend - a.totalSpend);
}

export function calculateProductStats(
  transactions: Transaction[]
): ProductStats[] {
  const productMap = new Map<string, { count: number; totalSpend: number }>();

  transactions.forEach((tx) => {
    const product = tx.product || "UNKNOWN";
    const amount = Math.abs(tx.amount);

    if (!productMap.has(product)) {
      productMap.set(product, { count: 0, totalSpend: 0 });
    }

    const stats = productMap.get(product)!;
    stats.count++;
    stats.totalSpend += amount;
  });

  return Array.from(productMap.entries())
    .map(([product, stats]) => ({
      product,
      count: stats.count,
      totalSpend: stats.totalSpend,
      averageAmount: stats.totalSpend / stats.count,
    }))
    .sort((a, b) => b.totalSpend - a.totalSpend);
}

export function calculateTimeStats(transactions: Transaction[]): TimeStats {
  const dayOfWeekMap = new Map<string, number>();
  const hourMap = new Map<number, number>();
  const dailySpendingMap = new Map<string, number>();
  const monthlySpendingMap = new Map<string, number>();
  let totalProcessingTime = 0;
  let processingTimeCount = 0;

  const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  transactions.forEach((tx) => {
    const date = new Date(tx.bookedAt);
    const dayOfWeek = dayNames[date.getDay()];
    const hour = date.getHours();
    const dateKey = date.toISOString().split("T")[0];
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const amount = Math.abs(tx.amount);

    // Day of week
    dayOfWeekMap.set(dayOfWeek, (dayOfWeekMap.get(dayOfWeek) || 0) + 1);

    // Hour
    hourMap.set(hour, (hourMap.get(hour) || 0) + 1);

    // Daily spending
    dailySpendingMap.set(
      dateKey,
      (dailySpendingMap.get(dateKey) || 0) + amount
    );

    // Monthly spending
    monthlySpendingMap.set(
      monthKey,
      (monthlySpendingMap.get(monthKey) || 0) + amount
    );

    // Processing time
    if (tx.startedDate) {
      const started = new Date(tx.startedDate);
      const completed = new Date(tx.bookedAt);
      const diffHours = (completed.getTime() - started.getTime()) / (1000 * 60 * 60);
      if (diffHours >= 0 && diffHours < 168) {
        // Reasonable range (0-7 days)
        totalProcessingTime += diffHours;
        processingTimeCount++;
      }
    }
  });

  // Find peak spending day
  let peakDay = "Unknown";
  let maxCount = 0;
  dayOfWeekMap.forEach((count, day) => {
    if (count > maxCount) {
      maxCount = count;
      peakDay = day;
    }
  });

  // Convert maps to arrays
  const transactionsByDayOfWeek: Record<string, number> = {};
  dayOfWeekMap.forEach((count, day) => {
    transactionsByDayOfWeek[day] = count;
  });

  const transactionsByHour: Record<number, number> = {};
  hourMap.forEach((count, hour) => {
    transactionsByHour[hour] = count;
  });

  const dailySpending = Array.from(dailySpendingMap.entries())
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const monthlySpending = Array.from(monthlySpendingMap.entries())
    .map(([month, amount]) => ({ month, amount }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return {
    averageProcessingTime:
      processingTimeCount > 0 ? totalProcessingTime / processingTimeCount : 0,
    transactionsByDayOfWeek,
    transactionsByHour,
    peakSpendingDay: peakDay,
    dailySpending,
    monthlySpending,
  };
}

export function calculateFeeStats(transactions: Transaction[]): FeeStats {
  // Note: Fees are currently added to amount in the parser
  // We'll need to extract them separately if available
  // For now, return zero stats as fees aren't stored separately
  return {
    totalFees: 0,
    averageFee: 0,
    highestFee: 0,
    feesByType: {},
    feeTrends: [],
  };
}

export function calculateBalanceStats(
  transactions: Transaction[]
): BalanceStats {
  const balanceOverTime: Array<{ date: string; balance: number }> = [];
  const balanceByProductMap = new Map<string, number>();

  let lowestBalance = Infinity;
  let highestBalance = -Infinity;
  let firstBalance: number | null = null;
  let lastBalance: number | null = null;

  // Sort by date
  const sortedTransactions = [...transactions].sort(
    (a, b) => new Date(a.bookedAt).getTime() - new Date(b.bookedAt).getTime()
  );

  sortedTransactions.forEach((tx) => {
    if (tx.balance !== undefined) {
      const balance = tx.balance;
      const date = new Date(tx.bookedAt).toISOString().split("T")[0];

      balanceOverTime.push({ date, balance });

      if (balance < lowestBalance) lowestBalance = balance;
      if (balance > highestBalance) highestBalance = balance;

      if (firstBalance === null) firstBalance = balance;
      lastBalance = balance;

      // Balance by product
      const product = tx.product || "UNKNOWN";
      if (!balanceByProductMap.has(product)) {
        balanceByProductMap.set(product, balance);
      }
    }
  });

  const balanceByProduct: Record<string, number> = {};
  balanceByProductMap.forEach((balance, product) => {
    balanceByProduct[product] = balance;
  });

  return {
    currentBalance: lastBalance || 0,
    balanceChange: lastBalance && firstBalance ? lastBalance - firstBalance : 0,
    lowestBalance: lowestBalance === Infinity ? 0 : lowestBalance,
    highestBalance: highestBalance === -Infinity ? 0 : highestBalance,
    balanceOverTime,
    balanceByProduct,
  };
}

export function calculateCurrencyStats(
  transactions: Transaction[]
): CurrencyStats[] {
  const currencyMap = new Map<string, { count: number; totalSpend: number }>();

  transactions.forEach((tx) => {
    const currency = tx.currency || "UNKNOWN";
    const amount = Math.abs(tx.amount);

    if (!currencyMap.has(currency)) {
      currencyMap.set(currency, { count: 0, totalSpend: 0 });
    }

    const stats = currencyMap.get(currency)!;
    stats.count++;
    stats.totalSpend += amount;
  });

  return Array.from(currencyMap.entries())
    .map(([currency, stats]) => ({
      currency,
      count: stats.count,
      totalSpend: stats.totalSpend,
    }))
    .sort((a, b) => b.totalSpend - a.totalSpend);
}

export function calculateCategoryStats(
  transactions: Transaction[]
): CategoryStats[] {
  const categoryMap = new Map<string, { count: number; totalSpend: number }>();

  transactions.forEach((tx) => {
    const category = tx.computedCategory || "unknown";
    const amount = Math.abs(tx.amount);

    if (!categoryMap.has(category)) {
      categoryMap.set(category, { count: 0, totalSpend: 0 });
    }

    const stats = categoryMap.get(category)!;
    stats.count++;
    stats.totalSpend += amount;
  });

  return Array.from(categoryMap.entries())
    .map(([category, stats]) => ({
      category,
      count: stats.count,
      totalSpend: stats.totalSpend,
    }))
    .sort((a, b) => b.totalSpend - a.totalSpend);
}

export function calculateMerchantStats(
  transactions: Transaction[]
): MerchantStats[] {
  const merchantMap = new Map<
    string,
    { count: number; totalSpend: number }
  >();

  transactions.forEach((tx) => {
    const merchant = tx.merchantNameNormalized || tx.rawDescription || "UNKNOWN";
    const amount = Math.abs(tx.amount);

    if (!merchantMap.has(merchant)) {
      merchantMap.set(merchant, { count: 0, totalSpend: 0 });
    }

    const stats = merchantMap.get(merchant)!;
    stats.count++;
    stats.totalSpend += amount;
  });

  return Array.from(merchantMap.entries())
    .map(([merchant, stats]) => ({
      merchant,
      count: stats.count,
      totalSpend: stats.totalSpend,
      averageAmount: stats.totalSpend / stats.count,
    }))
    .sort((a, b) => b.totalSpend - a.totalSpend);
}

export function calculateStateStats(transactions: Transaction[]): StateStats[] {
  const stateMap = new Map<string, number>();
  const total = transactions.length;

  transactions.forEach((tx) => {
    // For now, we'll infer state from approvalStatus
    // In a real implementation, we'd have a separate state field
    // Assuming completed transactions have NEUTRAL, PENDING, or VIOLATION status
    // and we can infer "completed" from bookedAt being set
    const state = "completed"; // Default, as we filter by state in parser
    stateMap.set(state, (stateMap.get(state) || 0) + 1);
  });

  return Array.from(stateMap.entries())
    .map(([state, count]) => ({
      state,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);
}
