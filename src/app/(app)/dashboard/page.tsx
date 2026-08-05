"use client";

import { useEffect, useState } from "react";
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
import {
  calculateTransactionTypeStats,
  calculateProductStats,
  calculateTimeStats,
  calculateFeeStats,
  calculateBalanceStats,
  calculateCurrencyStats,
  calculateCategoryStats,
  calculateMerchantStats,
  calculateStateStats,
} from "@/lib/analytics/calculate";
import { TransactionTypePieChart, TransactionTypeBarChart } from "@/components/analytics/TransactionTypeChart";
import { ProductDonutChart, ProductComparisonChart } from "@/components/analytics/ProductChart";
import { DailySpendingChart, WeeklySpendingChart, MonthlySpendingChart } from "@/components/analytics/SpendingTrendChart";
import { BalanceOverTimeChart, BalanceByProductChart } from "@/components/analytics/BalanceChart";
import { CategoryBarChart, CategoryPieChart } from "@/components/analytics/CategoryChart";
import { TopMerchantsBySpendChart, TopMerchantsByFrequencyChart } from "@/components/analytics/MerchantChart";
import { FeeTrendsChart, FeesByTypeChart } from "@/components/analytics/FeeChart";

interface Transaction {
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

export default function DashboardPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState({
    totalSpend: 0,
    violations: 0,
    violationsSpend: 0,
    pendingApprovals: 0,
    gamblingCount: 0,
    cryptoCount: 0,
  });

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch all transactions (use a high limit to get all)
        const response = await api.get<{
          data: Transaction[];
          pagination: any;
        }>("/api/transactions?limit=10000");
        const transactions = response.data || [];
        setTransactions(transactions);

        // Calculate KPIs from all transactions
        const totalSpend = transactions.reduce(
          (sum: number, tx: Transaction) => sum + Math.abs(tx.amount),
          0
        );
        const violationTransactions = transactions.filter(
          (tx: Transaction) => tx.approvalStatus === "VIOLATION"
        );
        const violations = violationTransactions.length;
        const violationsSpend = violationTransactions.reduce(
          (sum: number, tx: Transaction) => sum + Math.abs(tx.amount),
          0
        );
        const pendingApprovals = transactions.filter(
          (tx: Transaction) => tx.approvalStatus === "PENDING"
        ).length;
        const gamblingCount = transactions.filter(
          (tx: Transaction) => tx.isGambling
        ).length;
        const cryptoCount = transactions.filter(
          (tx: Transaction) => tx.isCrypto
        ).length;

        setKpis({
          totalSpend,
          violations,
          violationsSpend,
          pendingApprovals,
          gamblingCount,
          cryptoCount,
        });
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const pendingTransactions = transactions
    .filter((tx) => tx.approvalStatus === "PENDING")
    .sort(
      (a, b) => new Date(b.bookedAt).getTime() - new Date(a.bookedAt).getTime()
    )
    .slice(0, 5);

  const violationTransactions = transactions
    .filter((tx) => tx.approvalStatus === "VIOLATION")
    .sort(
      (a, b) => new Date(b.bookedAt).getTime() - new Date(a.bookedAt).getTime()
    )
    .slice(0, 5);

  // Best-effort: counted from currently loaded transactions, not full history.
  const violationCounts = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.approvalStatus === "VIOLATION") {
      violationCounts.set(
        tx.merchantNameNormalized,
        (violationCounts.get(tx.merchantNameNormalized) ?? 0) + 1
      );
    }
  }

  const formatAmount = formatCurrency;

  // Calculate all analytics
  const transactionTypeStats = calculateTransactionTypeStats(transactions);
  const productStats = calculateProductStats(transactions);
  const timeStats = calculateTimeStats(transactions);
  const feeStats = calculateFeeStats(transactions);
  const balanceStats = calculateBalanceStats(transactions);
  const currencyStats = calculateCurrencyStats(transactions);
  const categoryStats = calculateCategoryStats(transactions);
  const merchantStats = calculateMerchantStats(transactions);
  const stateStats = calculateStateStats(transactions);

  // Get most common transaction type
  const mostCommonType = transactionTypeStats[0]?.type || "N/A";
  const totalByType = transactionTypeStats.reduce((sum, item) => sum + item.count, 0);

  if (loading) {
    return (
      <div className="h-full flex flex-col p-8 overflow-hidden">
        <div className="flex-shrink-0 mb-6 space-y-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex-1 overflow-hidden space-y-8">
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

  return (
    <div className="h-full flex flex-col p-8 overflow-hidden">
      <PageHeader title="Dashboard" description="Overview of your financial activity" />

      <div className="flex-1 overflow-auto space-y-8 animate-in fade-in duration-300">
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
        {transactions.length > 0 && (
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
                    <StatusBadge status="PENDING" />
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
                    <StatusBadge
                      status="VIOLATION"
                      repeat={(violationCounts.get(tx.merchantNameNormalized) ?? 0) >= 2}
                    />
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

        {transactions.length === 0 && (
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
