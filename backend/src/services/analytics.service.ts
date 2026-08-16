import { isSpendingCategory } from "../constants/categories";
import { monthKey } from "../utils/monthWindow";

/**
 * Analytics aggregation for the Dashboard and Analytics pages.
 *
 * Moved here from the frontend (src/lib/analytics/calculate.ts), where every
 * one of these ran in the browser over a full ?limit=10000 transaction dump.
 * The logic is deliberately unchanged apart from date handling: all calendar
 * math now uses UTC getters to match how bookedAt is stored, so a
 * transaction's day-of-week and month don't shift with the server's
 * timezone (see utils/monthWindow.ts).
 *
 * Kept as pure functions over a plain array -- same shape as the other
 * engines here, so they stay directly unit-testable without a database.
 */

export interface AnalyticsTransactionInput {
  id?: string;
  bookedAt: string | Date;
  amount: number;
  currency: string;
  rawDescription: string;
  merchantNameNormalized: string;
  computedCategory: string;
  transactionType?: string;
  product?: string;
  startedDate?: string | Date;
  balance?: number;
  /** Cents already linked to a reimbursement (see reimbursement.service.ts). Nets against this transaction's own amount in Net Spend totals. */
  reimbursedAmount?: number;
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
  /** totalSpend minus linked reimbursements -- see AnalyticsTransactionInput.reimbursedAmount. */
  netSpend: number;
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

/** Every dataset the Dashboard and Analytics pages render. */
export interface AnalyticsBundle {
  transactionTypeStats: TransactionTypeStats[];
  productStats: ProductStats[];
  timeStats: TimeStats;
  feeStats: FeeStats;
  balanceStats: BalanceStats;
  currencyStats: CurrencyStats[];
  categoryStats: CategoryStats[];
  merchantStats: MerchantStats[];
  stateStats: StateStats[];
  totalTransactions: number;
  /** Sum of categoryStats' netSpend -- gross spend minus linked reimbursements. */
  totalNetSpend: number;
}

function onlySpending<T extends { computedCategory: string }>(transactions: T[]): T[] {
  return transactions.filter((tx) => isSpendingCategory(tx.computedCategory));
}

/** Groups by a key, summing absolute amounts. The shape behind most of the stats below. */
function groupTotals<T extends { amount: number }>(
  transactions: T[],
  keyOf: (tx: T) => string
): Array<{ key: string; count: number; totalSpend: number }> {
  const map = new Map<string, { count: number; totalSpend: number }>();

  for (const tx of transactions) {
    const key = keyOf(tx);
    const entry = map.get(key) ?? { count: 0, totalSpend: 0 };
    entry.count++;
    entry.totalSpend += Math.abs(tx.amount);
    map.set(key, entry);
  }

  return Array.from(map.entries())
    .map(([key, stats]) => ({ key, ...stats }))
    .sort((a, b) => b.totalSpend - a.totalSpend);
}

export function calculateTransactionTypeStats(
  transactions: AnalyticsTransactionInput[]
): TransactionTypeStats[] {
  return groupTotals(transactions, (tx) => tx.transactionType || "UNKNOWN").map((g) => ({
    type: g.key,
    count: g.count,
    totalSpend: g.totalSpend,
    averageAmount: g.totalSpend / g.count,
  }));
}

export function calculateProductStats(
  transactions: AnalyticsTransactionInput[]
): ProductStats[] {
  return groupTotals(transactions, (tx) => tx.product || "UNKNOWN").map((g) => ({
    product: g.key,
    count: g.count,
    totalSpend: g.totalSpend,
    averageAmount: g.totalSpend / g.count,
  }));
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function calculateTimeStats(
  transactions: AnalyticsTransactionInput[]
): TimeStats {
  const dayOfWeekMap = new Map<string, number>();
  const hourMap = new Map<number, number>();
  const dailySpendingMap = new Map<string, number>();
  const monthlySpendingMap = new Map<string, number>();
  let totalProcessingTime = 0;
  let processingTimeCount = 0;

  for (const tx of transactions) {
    const date = new Date(tx.bookedAt);
    const dayOfWeek = DAY_NAMES[date.getUTCDay()];
    const hour = date.getUTCHours();
    const dateKey = date.toISOString().split("T")[0];
    const amount = Math.abs(tx.amount);

    dayOfWeekMap.set(dayOfWeek, (dayOfWeekMap.get(dayOfWeek) || 0) + 1);
    hourMap.set(hour, (hourMap.get(hour) || 0) + 1);

    // Spending totals exclude income and transfers; the frequency maps above
    // deliberately don't, since "how many transactions on a Friday" is a
    // question about activity, not spending.
    if (isSpendingCategory(tx.computedCategory)) {
      dailySpendingMap.set(dateKey, (dailySpendingMap.get(dateKey) || 0) + amount);
      monthlySpendingMap.set(
        monthKey(date),
        (monthlySpendingMap.get(monthKey(date)) || 0) + amount
      );
    }

    if (tx.startedDate) {
      const started = new Date(tx.startedDate);
      const diffHours = (date.getTime() - started.getTime()) / (1000 * 60 * 60);
      if (diffHours >= 0 && diffHours < 168) {
        // Reasonable range (0-7 days)
        totalProcessingTime += diffHours;
        processingTimeCount++;
      }
    }
  }

  let peakSpendingDay = "Unknown";
  let maxCount = 0;
  for (const [day, count] of dayOfWeekMap) {
    if (count > maxCount) {
      maxCount = count;
      peakSpendingDay = day;
    }
  }

  return {
    averageProcessingTime:
      processingTimeCount > 0 ? totalProcessingTime / processingTimeCount : 0,
    transactionsByDayOfWeek: Object.fromEntries(dayOfWeekMap),
    transactionsByHour: Object.fromEntries(hourMap),
    peakSpendingDay,
    dailySpending: Array.from(dailySpendingMap.entries())
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    monthlySpending: Array.from(monthlySpendingMap.entries())
      .map(([month, amount]) => ({ month, amount }))
      .sort((a, b) => a.month.localeCompare(b.month)),
  };
}

/**
 * NOTE: a stub, carried over unchanged from the frontend implementation.
 * Fees aren't stored separately -- the CSV parser folds the Fee column into
 * the transaction amount -- so there's nothing to report and this returns
 * zeros regardless of input. The Dashboard only renders its Fee Analytics
 * block when totalFees > 0, so today that section never appears. Left as-is
 * deliberately: making it real means either storing fees separately at
 * import or deriving them from the "Fees" category, which is a feature
 * decision, not part of moving this to the server.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- see the note above: input is intentionally ignored
export function calculateFeeStats(_transactions: AnalyticsTransactionInput[]): FeeStats {
  return {
    totalFees: 0,
    averageFee: 0,
    highestFee: 0,
    feesByType: {},
    feeTrends: [],
  };
}

export function calculateBalanceStats(
  transactions: AnalyticsTransactionInput[]
): BalanceStats {
  const balanceOverTime: Array<{ date: string; balance: number }> = [];
  const balanceByProduct: Record<string, number> = {};

  let lowestBalance = Infinity;
  let highestBalance = -Infinity;
  let firstBalance: number | null = null;
  let lastBalance: number | null = null;

  const sorted = [...transactions].sort(
    (a, b) => new Date(a.bookedAt).getTime() - new Date(b.bookedAt).getTime()
  );

  for (const tx of sorted) {
    if (tx.balance === undefined) continue;

    const balance = tx.balance;
    balanceOverTime.push({
      date: new Date(tx.bookedAt).toISOString().split("T")[0],
      balance,
    });

    if (balance < lowestBalance) lowestBalance = balance;
    if (balance > highestBalance) highestBalance = balance;
    if (firstBalance === null) firstBalance = balance;
    lastBalance = balance;

    // First balance seen per product, in date order.
    const product = tx.product || "UNKNOWN";
    if (!(product in balanceByProduct)) {
      balanceByProduct[product] = balance;
    }
  }

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
  transactions: AnalyticsTransactionInput[]
): CurrencyStats[] {
  return groupTotals(transactions, (tx) => tx.currency || "UNKNOWN").map((g) => ({
    currency: g.key,
    count: g.count,
    totalSpend: g.totalSpend,
  }));
}

export function calculateCategoryStats(
  transactions: AnalyticsTransactionInput[]
): CategoryStats[] {
  // Spending breakdown, so income and transfers are excluded -- otherwise a
  // salary credit shows up as the biggest "category" on the chart.
  const map = new Map<string, { count: number; totalSpend: number; netSpend: number }>();

  for (const tx of onlySpending(transactions)) {
    const key = tx.computedCategory || "Other";
    const entry = map.get(key) ?? { count: 0, totalSpend: 0, netSpend: 0 };
    const gross = Math.abs(tx.amount);
    entry.count++;
    entry.totalSpend += gross;
    // Clamped at 0: a reimbursedAmount can never exceed the expense's own
    // amount (reimbursement.service.ts enforces that when links are
    // created), but the clamp keeps this safe even if that invariant is
    // ever violated by stale data.
    entry.netSpend += Math.max(0, gross - (tx.reimbursedAmount ?? 0));
    map.set(key, entry);
  }

  return Array.from(map.entries())
    .map(([category, stats]) => ({ category, ...stats }))
    .sort((a, b) => b.totalSpend - a.totalSpend);
}

export function calculateMerchantStats(
  transactions: AnalyticsTransactionInput[]
): MerchantStats[] {
  // "Top merchants by spend" -- an employer paying you isn't a merchant you
  // spent money at, so non-spend categories are excluded here too.
  return groupTotals(
    onlySpending(transactions),
    (tx) => tx.merchantNameNormalized || tx.rawDescription || "UNKNOWN"
  ).map((g) => ({
    merchant: g.key,
    count: g.count,
    totalSpend: g.totalSpend,
    averageAmount: g.totalSpend / g.count,
  }));
}

/**
 * NOTE: also a stub carried over unchanged. There is no per-transaction
 * state field -- the CSV parser already filters to completed/settled rows at
 * import -- so every transaction is bucketed as "completed" and this always
 * returns a single 100% row. Kept for output-shape compatibility with the
 * Dashboard's "Transaction Status" block.
 */
export function calculateStateStats(
  transactions: AnalyticsTransactionInput[]
): StateStats[] {
  const total = transactions.length;
  if (total === 0) return [];

  return [{ state: "completed", count: total, percentage: 100 }];
}

/** Runs every calculation over one transaction set. */
export function buildAnalyticsBundle(
  transactions: AnalyticsTransactionInput[]
): AnalyticsBundle {
  const categoryStats = calculateCategoryStats(transactions);

  return {
    transactionTypeStats: calculateTransactionTypeStats(transactions),
    productStats: calculateProductStats(transactions),
    timeStats: calculateTimeStats(transactions),
    feeStats: calculateFeeStats(transactions),
    balanceStats: calculateBalanceStats(transactions),
    currencyStats: calculateCurrencyStats(transactions),
    categoryStats,
    merchantStats: calculateMerchantStats(transactions),
    stateStats: calculateStateStats(transactions),
    totalTransactions: transactions.length,
    totalNetSpend: categoryStats.reduce((sum, c) => sum + c.netSpend, 0),
  };
}
