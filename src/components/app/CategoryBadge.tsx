import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getCategoryColor } from "@/lib/chartColors";

interface CategoryBadgeProps {
  category: string;
  className?: string;
}

/** Colored category chip; color comes from the fixed category -> hue assignment. */
export function CategoryBadge({ category, className }: CategoryBadgeProps) {
  const color = getCategoryColor(category);

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
