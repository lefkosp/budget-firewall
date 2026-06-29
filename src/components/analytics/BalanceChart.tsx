"use client";

import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-lg">Balance Over Time</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
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
              stroke="#8884d8"
              fill="#8884d8"
              fillOpacity={0.3}
              name="Balance"
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
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
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-lg">Balance by Product</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
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
              stroke="#82ca9d"
              fill="#82ca9d"
              fillOpacity={0.3}
              name="Balance"
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
