import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";

type MoneyVariant = "spend" | "income" | "refund" | "violation" | "neutral";

const variantClassName: Record<MoneyVariant, string> = {
  spend: "text-foreground",
  income: "text-success",
  refund: "text-info",
  violation: "text-destructive",
  neutral: "text-foreground",
};

interface MoneyProps {
  cents: number;
  currency?: string;
  variant?: MoneyVariant;
  signDisplay?: boolean;
  className?: string;
}

/** The single way an amount is ever rendered: cents -> currency, with income/spend coloring. */
export function Money({
  cents,
  currency = "EUR",
  variant = "neutral",
  signDisplay = false,
  className,
}: MoneyProps) {
  const formatted = formatCurrency(cents, currency, signDisplay ? "exceptZero" : "auto");

  return (
    <span className={cn("tabular-nums", variantClassName[variant], className)}>
      {formatted}
    </span>
  );
}
