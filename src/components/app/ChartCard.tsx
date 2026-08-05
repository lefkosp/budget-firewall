import type { ReactElement, ReactNode } from "react";
import { ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ChartCardProps {
  title: string;
  height?: number;
  className?: string;
  children?: ReactElement;
  empty?: boolean;
  emptyMessage?: string;
}

/** Uniform card + header + height wrapper for every analytics chart. */
export function ChartCard({
  title,
  height = 300,
  className,
  children,
  empty,
  emptyMessage = "No data available",
}: ChartCardProps): ReactNode {
  return (
    <Card className={cn("border-border/50 bg-card/50 backdrop-blur-sm", className)}>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {empty || !children ? (
          <p className="text-muted-foreground text-center py-8">{emptyMessage}</p>
        ) : (
          <ResponsiveContainer width="100%" height={height}>
            {children}
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
