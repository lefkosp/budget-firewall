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
import { TimeStats } from "@/lib/analytics/calculate";

interface SpendingTrendChartProps {
  timeStats: TimeStats;
  formatAmount: (cents: number, currency: string) => string;
}

export function DailySpendingChart({
  timeStats,
  formatAmount,
}: SpendingTrendChartProps) {
  const chartData = timeStats.dailySpending.map((item) => ({
    date: new Date(item.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    amount: item.amount / 100, // Convert to currency units
  }));

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-lg">Daily Spending Trends</CardTitle>
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
              dataKey="amount"
              stroke="var(--chart-1)"
              name="Daily Spend"
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function WeeklySpendingChart({
  timeStats,
  formatAmount,
}: SpendingTrendChartProps) {
  const dayOrder = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  const chartData = dayOrder.map((day) => ({
    day,
    transactions: timeStats.transactionsByDayOfWeek[day] || 0,
  }));

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-lg">Transactions by Day of Week</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="transactions" fill="var(--chart-2)" name="Transactions" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function MonthlySpendingChart({
  timeStats,
  formatAmount,
}: SpendingTrendChartProps) {
  const chartData = timeStats.monthlySpending.map((item) => ({
    month: item.month,
    amount: item.amount / 100, // Convert to currency units
  }));

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-lg">Monthly Spending Trends</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip
              formatter={(value: number) => formatAmount(value * 100, "EUR")}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="amount"
              stroke="var(--chart-3)"
              name="Monthly Spend"
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
