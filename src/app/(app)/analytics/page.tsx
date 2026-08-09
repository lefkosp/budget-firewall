"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState } from "@/components/app/EmptyState";
import { formatCurrency } from "@/lib/format";
import type { AnalyticsBundle } from "@/lib/analytics/types";
import { TransactionTypePieChart, TransactionTypeBarChart } from "@/components/analytics/TransactionTypeChart";
import { ProductDonutChart, ProductComparisonChart } from "@/components/analytics/ProductChart";
import { DailySpendingChart, WeeklySpendingChart, MonthlySpendingChart } from "@/components/analytics/SpendingTrendChart";
import { BalanceOverTimeChart, BalanceByProductChart } from "@/components/analytics/BalanceChart";
import { CategoryBarChart, CategoryPieChart } from "@/components/analytics/CategoryChart";
import { TopMerchantsBySpendChart, TopMerchantsByFrequencyChart } from "@/components/analytics/MerchantChart";
import { FeeTrendsChart, FeesByTypeChart } from "@/components/analytics/FeeChart";

export default function AnalyticsPage() {
  const [stats, setStats] = useState<AnalyticsBundle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        setStats(await api.get<AnalyticsBundle>("/api/stats/analytics"));
      } catch (error) {
        console.error("Error fetching analytics data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const formatAmount = formatCurrency;

  if (loading) {
    return (
      <div className="h-full flex flex-col p-8 overflow-hidden">
        <div className="flex-shrink-0 mb-6 space-y-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex-1 min-h-0 overflow-hidden space-y-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-4">
              <Skeleton className="h-6 w-48" />
              <div className="grid gap-6 md:grid-cols-2">
                <Skeleton className="h-72 w-full" />
                <Skeleton className="h-72 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!stats || stats.totalTransactions === 0) {
    return (
      <div className="h-full flex flex-col p-8 overflow-hidden">
        <PageHeader
          title="Analytics"
          description="Comprehensive financial analytics and insights"
        />
        <EmptyState title="No transactions available for analytics" />
      </div>
    );
  }

  const {
    transactionTypeStats,
    productStats,
    timeStats,
    feeStats,
    balanceStats,
    categoryStats,
    merchantStats,
  } = stats;

  return (
    <div className="h-full flex flex-col p-8 overflow-hidden">
      <PageHeader
        title="Analytics"
        description="Comprehensive financial analytics and insights"
      />

      <div className="flex-1 min-h-0 overflow-auto space-y-8 animate-in fade-in duration-300">
        {/* Transaction Type Analytics */}
        {transactionTypeStats.length > 0 && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold">Transaction Types</h2>
            <div className="grid gap-6 md:grid-cols-2">
              <TransactionTypePieChart data={transactionTypeStats} formatAmount={formatAmount} />
              <TransactionTypeBarChart data={transactionTypeStats} formatAmount={formatAmount} />
            </div>
          </div>
        )}

        {/* Product Analytics */}
        {productStats.length > 0 && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold">Product Analytics</h2>
            <div className="grid gap-6 md:grid-cols-2">
              <ProductDonutChart data={productStats} formatAmount={formatAmount} />
              <ProductComparisonChart data={productStats} formatAmount={formatAmount} />
            </div>
          </div>
        )}

        {/* Time-Based Analytics */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold">Time Analysis</h2>
          <div className="grid gap-6 md:grid-cols-1">
            <DailySpendingChart timeStats={timeStats} formatAmount={formatAmount} />
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <WeeklySpendingChart timeStats={timeStats} formatAmount={formatAmount} />
            <MonthlySpendingChart timeStats={timeStats} formatAmount={formatAmount} />
          </div>
        </div>

        {/* Balance Analytics */}
        {balanceStats.balanceOverTime.length > 0 && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold">Balance Analytics</h2>
            <div className="grid gap-6 md:grid-cols-2">
              <BalanceOverTimeChart balanceStats={balanceStats} formatAmount={formatAmount} />
              {Object.keys(balanceStats.balanceByProduct).length > 0 && (
                <BalanceByProductChart balanceStats={balanceStats} formatAmount={formatAmount} />
              )}
            </div>
          </div>
        )}

        {/* Category Analytics */}
        {categoryStats.length > 0 && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold">Category Analytics</h2>
            <div className="grid gap-6 md:grid-cols-2">
              <CategoryBarChart data={categoryStats} formatAmount={formatAmount} />
              <CategoryPieChart data={categoryStats} formatAmount={formatAmount} />
            </div>
          </div>
        )}

        {/* Merchant Analytics */}
        {merchantStats.length > 0 && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold">Merchant Analytics</h2>
            <div className="grid gap-6 md:grid-cols-2">
              <TopMerchantsBySpendChart data={merchantStats} formatAmount={formatAmount} />
              <TopMerchantsByFrequencyChart data={merchantStats} formatAmount={formatAmount} />
            </div>
          </div>
        )}

        {/* Fee Analytics */}
        {feeStats.totalFees > 0 && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold">Fee Analytics</h2>
            <div className="grid gap-6 md:grid-cols-2">
              <FeeTrendsChart feeStats={feeStats} formatAmount={formatAmount} />
              <FeesByTypeChart feeStats={feeStats} formatAmount={formatAmount} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
