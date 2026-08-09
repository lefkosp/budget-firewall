"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Money } from "@/components/app/Money";
import { StatusBadge } from "@/components/app/StatusBadge";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/app/StatCard";
import { FlagChips } from "@/components/app/FlagChips";
import { formatCurrency } from "@/lib/format";
import Link from "next/link";
import type { AnalyticsBundle } from "@/lib/analytics/types";
import { TransactionTypePieChart, TransactionTypeBarChart } from "@/components/analytics/TransactionTypeChart";
import { ProductDonutChart, ProductComparisonChart } from "@/components/analytics/ProductChart";
import { DailySpendingChart, WeeklySpendingChart, MonthlySpendingChart } from "@/components/analytics/SpendingTrendChart";
import { BalanceOverTimeChart, BalanceByProductChart } from "@/components/analytics/BalanceChart";
import { CategoryBarChart, CategoryPieChart } from "@/components/analytics/CategoryChart";
import { TopMerchantsBySpendChart, TopMerchantsByFrequencyChart } from "@/components/analytics/MerchantChart";
import { FeeTrendsChart, FeesByTypeChart } from "@/components/analytics/FeeChart";

/** A row in the dashboard's "needs attention" lists, as returned by /api/stats/dashboard. */
interface AttentionTransaction {
  id: string;
  bookedAt: string;
  amount: number;
  currency: string;
  merchantNameNormalized: string;
  isGambling: boolean;
  isCrypto: boolean;
  isBlacklisted: boolean;
  isRepeatViolation?: boolean;
}

interface DashboardStats {
  kpis: {
    totalSpend: number;
    violations: number;
    violationsSpend: number;
    pendingApprovals: number;
    gamblingCount: number;
    cryptoCount: number;
    totalTransactions: number;
  };
  pendingTransactions: AttentionTransaction[];
  violationTransactions: AttentionTransaction[];
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<DashboardStats | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsBundle | null>(null);
  const [subscriptionsSummary, setSubscriptionsSummary] = useState<{
    totalMonthlyCost: number;
    count: number;
  } | null>(null);
  const [budgets, setBudgets] = useState<
    { name: string; monthlyLimit: number; spentThisMonth: number }[]
  >([]);

  useEffect(() => {
    async function fetchSubscriptions() {
      try {
        const result = await api.get<{ totalMonthlyCost: number; count: number }>(
          "/api/subscriptions"
        );
        setSubscriptionsSummary(result);
      } catch (error) {
        console.error("Error fetching subscriptions summary:", error);
      }
    }
    fetchSubscriptions();
  }, []);

  useEffect(() => {
    async function fetchBudgets() {
      try {
        const result =
          await api.get<{ name: string; monthlyLimit: number; spentThisMonth: number }[]>(
            "/api/budgets"
          );
        setBudgets(result);
      } catch (error) {
        console.error("Error fetching budgets:", error);
      }
    }
    fetchBudgets();
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const [dashboardStats, analyticsStats] = await Promise.all([
        api.get<DashboardStats>("/api/stats/dashboard"),
        api.get<AnalyticsBundle>("/api/stats/analytics"),
      ]);
      setDashboard(dashboardStats);
      setAnalytics(analyticsStats);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleDecision = useCallback(
    async (tx: AttentionTransaction, decision: "approve" | "deny") => {
      try {
        await api.post(`/api/transactions/${tx.id}/${decision}`, {});
        toast.success(decision === "approve" ? "Transaction approved" : "Transaction denied");
        // Deciding a transaction moves it out of its list and changes the
        // KPI counts, so re-read the stats rather than patching them locally.
        fetchStats();
      } catch (err: any) {
        toast.error(err.message || `Failed to ${decision} transaction`);
      }
    },
    [fetchStats]
  );

  if (loading || !dashboard || !analytics) {
    return (
      <div className="h-full flex flex-col p-8 overflow-hidden">
        <div className="flex-shrink-0 mb-6 space-y-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex-1 min-h-0 overflow-hidden space-y-8">
          <div className="grid gap-6 md:grid-cols-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <Skeleton className="h-72 w-full" />
            <Skeleton className="h-72 w-full" />
          </div>
        </div>
      </div>
    );
  }


  const { kpis, pendingTransactions, violationTransactions } = dashboard;
  const {
    transactionTypeStats,
    productStats,
    timeStats,
    feeStats,
    balanceStats,
    currencyStats,
    categoryStats,
    merchantStats,
    stateStats,
  } = analytics;

  const formatAmount = formatCurrency;

  // Get most common transaction type
  const mostCommonType = transactionTypeStats[0]?.type || "N/A";
  const totalByType = transactionTypeStats.reduce((sum, item) => sum + item.count, 0);

  // Budget status for the current calendar month. spentThisMonth is computed
  // server-side (UTC-anchored) and arrives with each budget row.
  const budgetedCategories = budgets.filter((b) => b.monthlyLimit > 0);
  const totalBudgeted = budgetedCategories.reduce((sum, b) => sum + b.monthlyLimit, 0);
  const totalSpentAgainstBudget = budgetedCategories.reduce(
    (sum, b) => sum + b.spentThisMonth,
    0
  );
  const overBudgetCount = budgetedCategories.filter(
    (b) => b.spentThisMonth > b.monthlyLimit
  ).length;

  return (
    <div className="h-full flex flex-col p-8 overflow-hidden">
      <PageHeader title="Dashboard" description="Overview of your financial activity" />

      <div className="flex-1 min-h-0 overflow-auto space-y-8 animate-in fade-in duration-300">
        <div className="grid gap-6 md:grid-cols-3">
          <StatCard
            label="Total Spend"
            value={<Money cents={kpis.totalSpend} currency="EUR" className="text-primary" />}
            className="animate-in fade-in slide-in-from-bottom-1 duration-300"
          />
          <StatCard
            label="Violations"
            value={kpis.violations}
            intent="destructive"
            className="animate-in fade-in slide-in-from-bottom-1 duration-300 [animation-delay:40ms] [animation-fill-mode:backwards]"
          />
          <StatCard
            label="Pending Approvals"
            value={kpis.pendingApprovals}
            intent="warning"
            className="animate-in fade-in slide-in-from-bottom-1 duration-300 [animation-delay:80ms] [animation-fill-mode:backwards]"
          />
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <StatCard
            label="Violations Spend"
            value={<Money cents={kpis.violationsSpend} currency="EUR" variant="violation" />}
            className="animate-in fade-in slide-in-from-bottom-1 duration-300 [animation-delay:120ms] [animation-fill-mode:backwards]"
          />
          <StatCard
            label="Gambling"
            value={kpis.gamblingCount}
            intent="destructive"
            className="animate-in fade-in slide-in-from-bottom-1 duration-300 [animation-delay:160ms] [animation-fill-mode:backwards]"
          />
          <StatCard
            label="Crypto"
            value={kpis.cryptoCount}
            intent="destructive"
            className="animate-in fade-in slide-in-from-bottom-1 duration-300 [animation-delay:200ms] [animation-fill-mode:backwards]"
          />
        </div>

        {subscriptionsSummary && subscriptionsSummary.count > 0 && (
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardContent className="flex items-center justify-between py-6">
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  Recurring
                </div>
                <div className="text-2xl font-bold">
                  <Money cents={subscriptionsSummary.totalMonthlyCost} currency="EUR" />
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    /month across {subscriptionsSummary.count} subscription
                    {subscriptionsSummary.count !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
              <Button variant="outline" className="border-border/50" asChild>
                <Link href="/subscriptions">View Subscriptions</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {budgetedCategories.length > 0 && (
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardContent className="flex items-center justify-between py-6">
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">Budgets</div>
                <div className="text-2xl font-bold">
                  <Money cents={totalSpentAgainstBudget} currency="EUR" />
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    of <Money cents={totalBudgeted} currency="EUR" className="text-sm" /> budgeted
                    this month
                  </span>
                  {overBudgetCount > 0 && (
                    <span className="text-sm font-normal text-serious ml-2">
                      &middot; {overBudgetCount} over budget
                    </span>
                  )}
                </div>
              </div>
              <Button variant="outline" className="border-border/50" asChild>
                <Link href="/budgets">View Budgets</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Transaction Type Analytics */}
        {transactionTypeStats.length > 0 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-4">Transaction Types</h2>
              <div className="grid gap-6 md:grid-cols-3">
                <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Most Common Type
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-bold">{mostCommonType}</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {transactionTypeStats[0]?.count || 0} transactions
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Total Types
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{transactionTypeStats.length}</div>
                  </CardContent>
                </Card>
                <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Total Transactions
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{totalByType}</div>
                  </CardContent>
                </Card>
              </div>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <TransactionTypePieChart data={transactionTypeStats} formatAmount={formatAmount} />
              <TransactionTypeBarChart data={transactionTypeStats} formatAmount={formatAmount} />
            </div>
          </div>
        )}

        {/* Product Analytics */}
        {productStats.length > 0 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-4">Product Analytics</h2>
              <div className="grid gap-6 md:grid-cols-2">
                {productStats.map((product) => (
                  <Card key={product.product} className="border-border/50 bg-card/50 backdrop-blur-sm">
                    <CardHeader>
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        {product.product}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div>
                          <div className="text-2xl font-bold">
                            <Money cents={product.totalSpend} currency="EUR" />
                          </div>
                          <div className="text-sm text-muted-foreground">Total Spend</div>
                        </div>
                        <div>
                          <div className="text-xl font-bold">{product.count}</div>
                          <div className="text-sm text-muted-foreground">Transactions</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <ProductDonutChart data={productStats} formatAmount={formatAmount} />
              <ProductComparisonChart data={productStats} formatAmount={formatAmount} />
            </div>
          </div>
        )}

        {/* Time-Based Analytics */}
        {kpis.totalTransactions > 0 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-4">Time Analysis</h2>
              <div className="grid gap-6 md:grid-cols-3">
                <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Avg Processing Time
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {timeStats.averageProcessingTime > 0
                        ? `${timeStats.averageProcessingTime.toFixed(1)}h`
                        : "N/A"}
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Peak Spending Day
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-bold">{timeStats.peakSpendingDay}</div>
                  </CardContent>
                </Card>
                <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Total Days
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{timeStats.dailySpending.length}</div>
                  </CardContent>
                </Card>
              </div>
            </div>
            <div className="grid gap-6 md:grid-cols-1">
              <DailySpendingChart timeStats={timeStats} formatAmount={formatAmount} />
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <WeeklySpendingChart timeStats={timeStats} formatAmount={formatAmount} />
              <MonthlySpendingChart timeStats={timeStats} formatAmount={formatAmount} />
            </div>
          </div>
        )}

        {/* Balance Analytics */}
        {balanceStats.balanceOverTime.length > 0 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-4">Balance Analytics</h2>
              <div className="grid gap-6 md:grid-cols-4">
                <StatCard
                  label="Current Balance"
                  value={<Money cents={balanceStats.currentBalance} currency="EUR" />}
                />
                <StatCard
                  label="Balance Change"
                  value={
                    <Money
                      cents={balanceStats.balanceChange}
                      currency="EUR"
                      variant={balanceStats.balanceChange >= 0 ? "income" : "spend"}
                      signDisplay={balanceStats.balanceChange >= 0}
                    />
                  }
                />
                <StatCard
                  label="Lowest Balance"
                  value={<Money cents={balanceStats.lowestBalance} currency="EUR" />}
                />
                <StatCard
                  label="Highest Balance"
                  value={<Money cents={balanceStats.highestBalance} currency="EUR" />}
                />
              </div>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <BalanceOverTimeChart balanceStats={balanceStats} formatAmount={formatAmount} />
              {Object.keys(balanceStats.balanceByProduct).length > 0 && (
                <BalanceByProductChart balanceStats={balanceStats} formatAmount={formatAmount} />
              )}
            </div>
          </div>
        )}

        {/* Currency Analytics */}
        {currencyStats.length > 0 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-4">Currency Analytics</h2>
              <div className="grid gap-6 md:grid-cols-3">
                {currencyStats.slice(0, 3).map((currency) => (
                  <Card key={currency.currency} className="border-border/50 bg-card/50 backdrop-blur-sm">
                    <CardHeader>
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        {currency.currency}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div>
                          <div className="text-2xl font-bold">
                            <Money cents={currency.totalSpend} currency={currency.currency} />
                          </div>
                          <div className="text-sm text-muted-foreground">Total Spend</div>
                        </div>
                        <div>
                          <div className="text-xl font-bold">{currency.count}</div>
                          <div className="text-sm text-muted-foreground">Transactions</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Category Analytics */}
        {categoryStats.length > 0 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-4">Category Analytics</h2>
              <div className="grid gap-6 md:grid-cols-5">
                {categoryStats.slice(0, 5).map((category) => (
                  <Card key={category.category} className="border-border/50 bg-card/50 backdrop-blur-sm">
                    <CardHeader>
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        {category.category}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-xl font-bold">
                        <Money cents={category.totalSpend} currency="EUR" />
                      </div>
                      <div className="text-sm text-muted-foreground">{category.count} transactions</div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <CategoryBarChart data={categoryStats} formatAmount={formatAmount} />
              <CategoryPieChart data={categoryStats} formatAmount={formatAmount} />
            </div>
          </div>
        )}

        {/* Merchant Analytics */}
        {merchantStats.length > 0 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-4">Top Merchants</h2>
              <div className="grid gap-6 md:grid-cols-5">
                {merchantStats.slice(0, 5).map((merchant) => (
                  <Card key={merchant.merchant} className="border-border/50 bg-card/50 backdrop-blur-sm">
                    <CardHeader>
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        {merchant.merchant.length > 15
                          ? merchant.merchant.substring(0, 15) + "..."
                          : merchant.merchant}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-xl font-bold">
                        <Money cents={merchant.totalSpend} currency="EUR" />
                      </div>
                      <div className="text-sm text-muted-foreground">{merchant.count} transactions</div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <TopMerchantsBySpendChart data={merchantStats} formatAmount={formatAmount} />
              <TopMerchantsByFrequencyChart data={merchantStats} formatAmount={formatAmount} />
            </div>
          </div>
        )}

        {/* Fee Analytics */}
        {feeStats.totalFees > 0 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-4">Fee Analytics</h2>
              <div className="grid gap-6 md:grid-cols-3">
                <StatCard
                  label="Total Fees"
                  value={<Money cents={feeStats.totalFees} currency="EUR" />}
                />
                <StatCard
                  label="Average Fee"
                  value={<Money cents={feeStats.averageFee} currency="EUR" />}
                />
                <StatCard
                  label="Highest Fee"
                  value={<Money cents={feeStats.highestFee} currency="EUR" />}
                />
              </div>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <FeeTrendsChart feeStats={feeStats} formatAmount={formatAmount} />
              <FeesByTypeChart feeStats={feeStats} formatAmount={formatAmount} />
            </div>
          </div>
        )}

        {/* State Analytics (based on approvalStatus) */}
        {stateStats.length > 0 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-4">Transaction Status</h2>
              <div className="grid gap-6 md:grid-cols-4">
                {stateStats.map((state) => (
                  <Card key={state.state} className="border-border/50 bg-card/50 backdrop-blur-sm">
                    <CardHeader>
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        {state.state}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{state.count}</div>
                      <div className="text-sm text-muted-foreground">{state.percentage.toFixed(1)}%</div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        )}

        {pendingTransactions.length > 0 && (
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm flex flex-col overflow-hidden">
            <CardHeader className="flex-shrink-0">
              <CardTitle className="text-lg">Pending Approvals</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col overflow-hidden p-0">
              <div className="overflow-auto flex-1 p-6 space-y-3">
                {pendingTransactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between p-4 border border-border/50 rounded-lg bg-background/50 hover:bg-accent/10 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="font-semibold">
                        {tx.merchantNameNormalized}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {new Date(tx.bookedAt).toLocaleDateString()} •{" "}
                        <Money cents={tx.amount} currency={tx.currency} className="font-medium" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status="PENDING" />
                      <Button
                        size="icon-sm"
                        className="bg-success hover:bg-success/90 text-success-foreground"
                        onClick={() => handleDecision(tx, "approve")}
                        title="Approve"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="outline"
                        className="border-destructive/50 hover:bg-destructive/20 hover:text-destructive"
                        onClick={() => handleDecision(tx, "deny")}
                        title="Deny"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-border/50 p-6 flex-shrink-0">
                <Button
                  variant="outline"
                  className="w-full border-accent/50 hover:bg-accent/20 hover:text-accent"
                  asChild
                >
                  <Link href="/transactions?status=PENDING">View All</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {violationTransactions.length > 0 && (
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm flex flex-col overflow-hidden">
            <CardHeader className="flex-shrink-0">
              <CardTitle className="text-lg">Violations</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col overflow-hidden p-0">
              <div className="overflow-auto flex-1 p-6 space-y-3">
                {violationTransactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between p-4 border border-destructive/30 rounded-lg bg-destructive/5 hover:bg-destructive/10 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="font-semibold">
                        {tx.merchantNameNormalized}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {new Date(tx.bookedAt).toLocaleDateString()} •{" "}
                        <Money cents={tx.amount} currency={tx.currency} className="font-medium" />
                      </div>
                      <FlagChips
                        isGambling={tx.isGambling}
                        isCrypto={tx.isCrypto}
                        isBlacklisted={tx.isBlacklisted}
                        className="mt-2"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status="VIOLATION" repeat={tx.isRepeatViolation} />
                      <Button
                        size="icon-sm"
                        className="bg-success hover:bg-success/90 text-success-foreground"
                        onClick={() => handleDecision(tx, "approve")}
                        title="Approve"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="outline"
                        className="border-destructive/50 hover:bg-destructive/20 hover:text-destructive"
                        onClick={() => handleDecision(tx, "deny")}
                        title="Deny"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-border/50 p-6 flex-shrink-0">
                <Button
                  variant="outline"
                  className="w-full border-destructive/50 hover:bg-destructive/20 hover:text-destructive"
                  asChild
                >
                  <Link href="/transactions?status=VIOLATION">View All</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {kpis.totalTransactions === 0 && (
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground mb-6 text-lg">
                No transactions yet
              </p>
              <Button
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                asChild
              >
                <Link href="/connect">Connect Revolut</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
