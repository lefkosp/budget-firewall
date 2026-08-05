"use client";

import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { ChartCard } from "@/components/app/ChartCard";
import { ProductStats } from "@/lib/analytics/calculate";
import { CHART_COLORS } from "@/lib/chartColors";

interface ProductChartProps {
  data: ProductStats[];
  formatAmount: (cents: number, currency: string) => string;
}

export function ProductDonutChart({
  data,
  formatAmount,
}: ProductChartProps) {
  const chartData = data.map((item) => ({
    name: item.product,
    value: item.count,
    amount: item.totalSpend,
  }));

  return (
    <ChartCard title="Product Distribution">
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
          innerRadius={40}
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

export function ProductComparisonChart({
  data,
  formatAmount,
}: ProductChartProps) {
  const chartData = data.map((item) => ({
    name: item.product,
    spend: item.totalSpend / 100, // Convert to currency units
    count: item.count,
  }));

  return (
    <ChartCard title="Spending by Product">
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
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
