/**
 * Shapes of the analytics datasets returned by GET /api/stats/analytics.
 *
 * The calculations that used to live here now run on the server
 * (backend/src/services/analytics.service.ts) -- these pages were pulling
 * every transaction into the browser to compute them. Only the types stay,
 * so the chart components keep a single place to import their props from.
 */

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
  /** totalSpend minus linked reimbursements -- see /reimbursements. */
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

/** The full payload returned by GET /api/stats/analytics. */
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
  totalNetSpend: number;
}
