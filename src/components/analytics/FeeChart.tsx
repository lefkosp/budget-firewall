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
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    return (
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-lg">Fee Trends</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            No fee data available
          </p>
        </CardContent>
      </Card>
    );
  }

  const chartData = feeStats.feeTrends.map((item) => ({
    date: new Date(item.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    fee: item.fee / 100, // Convert to currency units
  }));

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-lg">Fee Trends Over Time</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
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
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function FeesByTypeChart({
  feeStats,
  formatAmount,
}: FeeChartProps) {
  if (Object.keys(feeStats.feesByType).length === 0) {
    return (
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-lg">Fees by Transaction Type</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            No fee data available
          </p>
        </CardContent>
      </Card>
    );
  }

  const chartData = Object.entries(feeStats.feesByType).map(
    ([type, fee]) => ({
      type,
      fee: fee / 100, // Convert to currency units
    })
  );

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-lg">Fees by Transaction Type</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
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
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
