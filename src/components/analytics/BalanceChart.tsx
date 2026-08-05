"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { ChartCard } from "@/components/app/ChartCard";
import { BalanceStats } from "@/lib/analytics/calculate";

interface BalanceChartProps {
  balanceStats: BalanceStats;
  formatAmount: (cents: number, currency: string) => string;
}

export function BalanceOverTimeChart({
  balanceStats,
  formatAmount,
}: BalanceChartProps) {
  const chartData = balanceStats.balanceOverTime.map((item) => ({
    date: new Date(item.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    balance: item.balance / 100, // Convert to currency units
  }));

  return (
    <ChartCard title="Balance Over Time">
      <AreaChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" angle={-45} textAnchor="end" height={100} />
        <YAxis />
        <Tooltip
          formatter={(value: number) => formatAmount(value * 100, "EUR")}
        />
        <Legend />
        <Area
          type="monotone"
          dataKey="balance"
          stroke="var(--chart-1)"
          fill="var(--chart-1)"
          fillOpacity={0.3}
          name="Balance"
        />
      </AreaChart>
    </ChartCard>
  );
}

export function BalanceByProductChart({
  balanceStats,
  formatAmount,
}: BalanceChartProps) {
  const chartData = Object.entries(balanceStats.balanceByProduct).map(
    ([product, balance]) => ({
      product,
      balance: balance / 100, // Convert to currency units
    })
  );

  return (
    <ChartCard title="Balance by Product">
      <AreaChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="product" />
        <YAxis />
        <Tooltip
          formatter={(value: number) => formatAmount(value * 100, "EUR")}
        />
        <Legend />
        <Area
          type="monotone"
          dataKey="balance"
          stroke="var(--chart-2)"
          fill="var(--chart-2)"
          fillOpacity={0.3}
          name="Balance"
        />
      </AreaChart>
    </ChartCard>
  );
}
