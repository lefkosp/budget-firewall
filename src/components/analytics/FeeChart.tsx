"use client";

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { ChartCard } from "@/components/app/ChartCard";
import { FeeStats } from "@/lib/analytics/calculate";

interface FeeChartProps {
  feeStats: FeeStats;
  formatAmount: (cents: number, currency: string) => string;
}

export function FeeTrendsChart({
  feeStats,
  formatAmount,
}: FeeChartProps) {
  if (feeStats.feeTrends.length === 0) {
    return <ChartCard title="Fee Trends" empty emptyMessage="No fee data available" />;
  }

  const chartData = feeStats.feeTrends.map((item) => ({
    date: new Date(item.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    fee: item.fee / 100, // Convert to currency units
  }));

  return (
    <ChartCard title="Fee Trends Over Time">
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" angle={-45} textAnchor="end" height={100} />
        <YAxis />
        <Tooltip
          formatter={(value: number) => formatAmount(value * 100, "EUR")}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="fee"
          stroke="var(--chart-4)"
          name="Fee"
        />
      </LineChart>
    </ChartCard>
  );
}

export function FeesByTypeChart({
  feeStats,
  formatAmount,
}: FeeChartProps) {
  if (Object.keys(feeStats.feesByType).length === 0) {
    return (
      <ChartCard title="Fees by Transaction Type" empty emptyMessage="No fee data available" />
    );
  }

  const chartData = Object.entries(feeStats.feesByType).map(
    ([type, fee]) => ({
      type,
      fee: fee / 100, // Convert to currency units
    })
  );

  return (
    <ChartCard title="Fees by Transaction Type">
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="type" angle={-45} textAnchor="end" height={100} />
        <YAxis />
        <Tooltip
          formatter={(value: number) => formatAmount(value * 100, "EUR")}
        />
        <Legend />
        <Bar dataKey="fee" fill="var(--chart-4)" name="Total Fees" />
      </BarChart>
    </ChartCard>
  );
}
