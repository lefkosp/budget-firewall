import { cn } from "@/lib/utils";

interface BudgetProgressBarProps {
  spent: number; // cents
  limit: number; // cents; 0 means "no limit set"
  className?: string;
}

/** Spent-vs-limit bar: neutral under 80%, warning approaching the cap, serious once over. */
export function BudgetProgressBar({ spent, limit, className }: BudgetProgressBarProps) {
  if (limit <= 0) {
    return (
      <div className={cn("h-2 rounded-full bg-muted", className)}>
        <div className="h-full w-0 rounded-full" />
      </div>
    );
  }

  const percent = Math.min((spent / limit) * 100, 100);
  const over = spent > limit;
  const approaching = !over && spent / limit >= 0.8;

  return (
    <div className={cn("h-2 rounded-full bg-muted overflow-hidden", className)}>
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-300",
          over ? "bg-serious" : approaching ? "bg-warning" : "bg-primary"
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
