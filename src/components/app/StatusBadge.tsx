import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type ApprovalStatus = "NEUTRAL" | "PENDING" | "APPROVED" | "DENIED" | "VIOLATION";

const statusConfig: Record<ApprovalStatus, { label: string; className: string }> = {
  NEUTRAL: {
    label: "Neutral",
    className: "bg-muted text-muted-foreground border-muted-foreground/30",
  },
  PENDING: {
    label: "Pending",
    className: "bg-warning/20 text-warning border-warning/50",
  },
  APPROVED: {
    label: "Approved",
    className: "bg-success/20 text-success border-success/50",
  },
  DENIED: {
    label: "Denied",
    className: "bg-destructive/20 text-destructive border-destructive/50",
  },
  VIOLATION: {
    label: "Violation",
    className: "bg-destructive/20 text-destructive border-destructive/50",
  },
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

/** The single source of truth for approval-status -> color, used by badges, tables, and dashboard cards. */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status as ApprovalStatus] ?? statusConfig.NEUTRAL;

  return (
    <Badge variant="outline" className={cn(config.className, className)}>
      {config.label}
    </Badge>
  );
}
