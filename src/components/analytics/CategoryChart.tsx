"use client";

import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryStats } from "@/lib/analytics/calculate";
import { getCategoryColor, OTHER_COLOR } from "@/lib/chartColors";

interface CategoryChartProps {
  data: CategoryStats[];
  formatAmount: (cents: number, currency: string) => string;
}

const NAMED_CATEGORY_SLOTS = 7;

interface PieSlice {
  name: string;
  value: number;
  count: number;
  folded?: string[];
}

/** Top 7 categories keep their own hue; anything past that folds into one neutral "Other" slice. */
function toPieData(data: CategoryStats[]): PieSlice[] {
  const named = data.slice(0, NAMED_CATEGORY_SLOTS).map((item) => ({
    name: item.category,
    value: item.totalSpend,
    count: item.count,
  }));

  const overflow = data.slice(NAMED_CATEGORY_SLOTS);
  if (overflow.length === 0) return named;

  const other: PieSlice = {
    name: "Other",
    value: overflow.reduce((sum, item) => sum + item.totalSpend, 0),
    count: overflow.reduce((sum, item) => sum + item.count, 0),
    folded: overflow.map((item) => item.category),
  };

  return [...named, other];
}

function CategoryTooltip({
  active,
  payload,
  formatAmount,
}: {
  active?: boolean;
  payload?: { payload: PieSlice }[];
  formatAmount: (cents: number, currency: string) => string;
}) {
  if (!active || !payload?.length) return null;
  const slice = payload[0].payload;

  return (
    <div className="rounded-lg border border-border/50 bg-popover px-3 py-2 text-sm shadow-md">
      <div className="font-medium">{slice.name}</div>
      <div className="text-muted-foreground">{formatAmount(slice.value, "EUR")}</div>
      {slice.folded && (
        <div className="mt-1.5 max-w-52 border-t border-border/50 pt-1.5 text-xs text-muted-foreground">
          {slice.folded.join(", ")}
        </div>
      )}
    </div>
  );
}

export function CategoryBarChart({
  data,
  formatAmount,
}: CategoryChartProps) {
  const topCategories = data.slice(0, 10);
  const chartData = topCategories.map((item) => ({
    name: item.category,
    spend: item.totalSpend / 100, // Convert to currency units
    count: item.count,
  }));

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-lg">Top Categories by Spend</CardTitle>
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

export function CategoryPieChart({
  data,
  formatAmount,
}: CategoryChartProps) {
  const chartData = toPieData(data);

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-lg">Category Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
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
              {chartData.map((entry) => (
                <Cell
                  key={`cell-${entry.name}`}
                  fill={entry.name === "Other" ? OTHER_COLOR : getCategoryColor(entry.name)}
                />
              ))}
            </Pie>
            <Tooltip content={<CategoryTooltip formatAmount={formatAmount} />} />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
