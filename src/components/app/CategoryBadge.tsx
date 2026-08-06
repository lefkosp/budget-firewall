import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { getCategoryColor } from "@/lib/chartColors";
import { EDITABLE_CATEGORIES } from "@/lib/categories";

interface CategoryBadgeProps {
  category: string;
  className?: string;
  /** Renders as a dropdown trigger instead of a static chip. */
  editable?: boolean;
  onSelect?: (category: string) => void;
}

/** Colored category chip; color comes from the fixed category -> hue assignment. */
export function CategoryBadge({ category, className, editable, onSelect }: CategoryBadgeProps) {
  const color = getCategoryColor(category);

  const badge = (
    <Badge
      variant="outline"
      className={cn("border-transparent", editable && "cursor-pointer", className)}
      style={{
        backgroundColor: `color-mix(in oklch, ${color} 20%, transparent)`,
        color,
      }}
    >
      {category}
    </Badge>
  );

  if (!editable || !onSelect) {
    return badge;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex"
          onClick={(e) => e.stopPropagation()}
        >
          {badge}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        // DropdownMenuContent renders in a portal, but React still bubbles
        // its synthetic events through the *React* tree (CategoryBadge ->
        // the table cell -> the row), not the DOM tree -- so a click on any
        // item here would otherwise reach the row's onClick and open the
        // drawer right after picking a category. Stop it at the source.
        onClick={(e) => e.stopPropagation()}
      >
        {EDITABLE_CATEGORIES.map((cat) => (
          <DropdownMenuItem key={cat} onSelect={() => onSelect(cat)}>
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: getCategoryColor(cat) }}
            />
            {cat}
            {cat === category && <Check className="ml-auto size-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
