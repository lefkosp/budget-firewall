"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { ChartCard } from "@/components/app/ChartCard";
import { MerchantStats } from "@/lib/analytics/calculate";

interface MerchantChartProps {
  data: MerchantStats[];
  formatAmount: (cents: number, currency: string) => string;
}

function truncate(merchant: string) {
  return merchant.length > 20 ? merchant.substring(0, 20) + "..." : merchant;
}

// The x-axis label is truncated to keep the chart readable; the tooltip
// looks up the untruncated name from the data point so hovering still shows
// the full merchant.
function fullNameLabel(_label: string, payload: { payload?: { fullName?: string } }[]) {
  return payload?.[0]?.payload?.fullName ?? _label;
}

export function TopMerchantsBySpendChart({
  data,
  formatAmount,
}: MerchantChartProps) {
  const topMerchants = data.slice(0, 10);
  const chartData = topMerchants.map((item) => ({
    name: truncate(item.merchant),
    fullName: item.merchant,
    spend: item.totalSpend / 100, // Convert to currency units
    count: item.count,
  }));

  return (
    <ChartCard title="Top Merchants by Spend">
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
        <YAxis />
        <Tooltip
          labelFormatter={fullNameLabel}
          formatter={(value: number) => formatAmount(value * 100, "EUR")}
        />
        <Legend />
        <Bar dataKey="spend" fill="var(--chart-1)" name="Total Spend" />
      </BarChart>
    </ChartCard>
  );
}

export function TopMerchantsByFrequencyChart({
  data,
  formatAmount,
}: MerchantChartProps) {
  const topMerchants = data.slice(0, 10);
  const chartData = topMerchants.map((item) => ({
    name: truncate(item.merchant),
    fullName: item.merchant,
    count: item.count,
    average: item.averageAmount / 100, // Convert to currency units
  }));

  return (
    <ChartCard title="Top Merchants by Frequency">
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
        <YAxis />
        <Tooltip labelFormatter={fullNameLabel} />
        <Legend />
        <Bar dataKey="count" fill="var(--chart-2)" name="Transaction Count" />
      </BarChart>
    </ChartCard>
  );
}
