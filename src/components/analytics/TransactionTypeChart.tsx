"use client";

import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { ChartCard } from "@/components/app/ChartCard";
import { TransactionTypeStats } from "@/lib/analytics/calculate";
import { CHART_COLORS } from "@/lib/chartColors";

interface TransactionTypeChartProps {
  data: TransactionTypeStats[];
  formatAmount: (cents: number, currency: string) => string;
}

export function TransactionTypePieChart({
  data,
  formatAmount,
}: TransactionTypeChartProps) {
  const chartData = data.map((item) => ({
    name: item.type,
    value: item.count,
    amount: item.totalSpend,
  }));

  return (
    <ChartCard title="Transaction Types Distribution">
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={({ name, percent }) =>
            `${name}: ${(percent * 100).toFixed(0)}%`
          }
          outerRadius={80}
          fill="var(--chart-1)"
          dataKey="value"
        >
          {chartData.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={CHART_COLORS[index % CHART_COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ChartCard>
  );
}

export function TransactionTypeBarChart({
  data,
  formatAmount,
}: TransactionTypeChartProps) {
  const chartData = data.map((item) => ({
    name: item.type,
    count: item.count,
    spend: item.totalSpend / 100, // Convert to currency units
  }));

  return (
    <ChartCard title="Spend by Transaction Type">
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
    </ChartCard>
  );
}
