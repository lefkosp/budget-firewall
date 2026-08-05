export const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
];

/** Neutral color for anything that doesn't get a dedicated hue -- the "Other" bucket. */
export const OTHER_COLOR = "var(--chart-8)";

/**
 * Fixed category -> color assignment. Each spending category keeps this color
 * everywhere (badges, charts, legends) for as long as the app exists -- never
 * cycled or hashed, so a category can't change color when the dataset shape
 * changes. Categories not in this list (and anything beyond it) fall back to
 * OTHER_COLOR rather than generating a new hue. Red is deliberately excluded
 * here; it's reserved for --destructive (rule violations).
 *
 * These seven are the first seven of SPENDING_CATEGORIES in
 * backend/src/constants/categories.ts -- the categorizer can only emit names
 * from that list, so keep the two in sync when either changes.
 */
const CATEGORY_COLORS: Record<string, string> = {
  Groceries: "var(--chart-1)",
  "Eating Out": "var(--chart-2)",
  Transport: "var(--chart-3)",
  "Bills & Utilities": "var(--chart-4)",
  Subscriptions: "var(--chart-5)",
  Shopping: "var(--chart-6)",
  Entertainment: "var(--chart-7)",
};

export function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? OTHER_COLOR;
}
