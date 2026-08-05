import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StatCardIntent = "default" | "warning" | "destructive";

const intentClassName: Record<StatCardIntent, string> = {
  default: "",
  warning: "text-warning",
  destructive: "text-destructive",
};

interface StatCardProps {
  label: string;
  value: ReactNode;
  intent?: StatCardIntent;
  className?: string;
}

/** Dashboard KPI card: label + big value, optionally colored by intent. */
export function StatCard({ label, value, intent = "default", className }: StatCardProps) {
  return (
    <Card className={cn("border-border/50 bg-card/50 backdrop-blur-sm", className)}>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={cn("text-3xl font-bold", intentClassName[intent])}>{value}</div>
      </CardContent>
    </Card>
  );
}
