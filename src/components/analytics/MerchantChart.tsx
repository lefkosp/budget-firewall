"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MerchantStats } from "@/lib/analytics/calculate";

interface MerchantChartProps {
  data: MerchantStats[];
  formatAmount: (cents: number, currency: string) => string;
}

export function TopMerchantsBySpendChart({
  data,
  formatAmount,
}: MerchantChartProps) {
  const topMerchants = data.slice(0, 10);
  const chartData = topMerchants.map((item) => ({
    name: item.merchant.length > 20
      ? item.merchant.substring(0, 20) + "..."
      : item.merchant,
    spend: item.totalSpend / 100, // Convert to currency units
    count: item.count,
  }));

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-lg">Top Merchants by Spend</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
            <YAxis />
            <Tooltip
              formatter={(value: number) => formatAmount(value * 100, "EUR")}
            />
            <Legend />
            <Bar dataKey="spend" fill="var(--chart-1)" name="Total Spend" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function TopMerchantsByFrequencyChart({
  data,
  formatAmount,
}: MerchantChartProps) {
  const topMerchants = data.slice(0, 10);
  const chartData = topMerchants.map((item) => ({
    name: item.merchant.length > 20
      ? item.merchant.substring(0, 20) + "..."
      : item.merchant,
    count: item.count,
    average: item.averageAmount / 100, // Convert to currency units
  }));

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-lg">Top Merchants by Frequency</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="count" fill="var(--chart-2)" name="Transaction Count" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
