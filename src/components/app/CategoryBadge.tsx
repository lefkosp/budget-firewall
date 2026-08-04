import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { stableChartColor } from "@/lib/chartColors";

interface CategoryBadgeProps {
  category: string;
  className?: string;
}

/** Colored category chip; color is a stable hash of the category name into the chart palette. */
export function CategoryBadge({ category, className }: CategoryBadgeProps) {
  const color = stableChartColor(category);

  return (
    <Badge
      variant="outline"
      className={cn("border-transparent", className)}
      style={{
        backgroundColor: `color-mix(in oklch, ${color} 20%, transparent)`,
        color,
      }}
    >
      {category}
    </Badge>
  );
}
