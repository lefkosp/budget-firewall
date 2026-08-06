"use client";

import { useCallback, useEffect, useState } from "react";
import { Repeat, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/app/StatCard";
import { EmptyState } from "@/components/app/EmptyState";
import { Money } from "@/components/app/Money";

type SubscriptionCadence = "weekly" | "monthly" | "yearly";
type SubscriptionStatus = "active" | "price-changed" | "possibly-cancelled";

interface Subscription {
  merchant: string;
  amount: number;
  cadence: SubscriptionCadence;
  firstSeen: string;
  lastCharged: string;
  nextExpected: string;
  status: SubscriptionStatus;
  occurrences: number;
}

interface SubscriptionsResponse {
  subscriptions: Subscription[];
  totalMonthlyCost: number;
  count: number;
}

const STATUS_CONFIG: Record<SubscriptionStatus, { label: string; className: string }> = {
  active: {
    label: "Active",
    className: "bg-muted text-muted-foreground border-muted-foreground/30",
  },
  "price-changed": {
    label: "Price changed",
    className: "bg-warning/20 text-warning border-warning/50",
  },
  "possibly-cancelled": {
    label: "Possibly cancelled",
    className: "bg-serious/20 text-serious border-serious/50",
  },
};

const CADENCE_LABEL: Record<SubscriptionCadence, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function SubscriptionsPage() {
  const [data, setData] = useState<SubscriptionsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSubscriptions = useCallback(async () => {
    try {
      setLoading(true);
      const result = await api.get<SubscriptionsResponse>("/api/subscriptions");
      setData(result);
    } catch (error) {
      console.error("Error fetching subscriptions:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  async function handleDismiss(merchant: string) {
    try {
      await api.post(`/api/subscriptions/${encodeURIComponent(merchant)}/dismiss`);
      toast.success(`Dismissed "${merchant}" -- won't be suggested again`);
      fetchSubscriptions();
    } catch (error: any) {
      toast.error(error.message || "Failed to dismiss");
    }
  }

  if (loading) {
    return (
      <div className="h-full flex flex-col p-8 overflow-hidden">
        <div className="flex-shrink-0 mb-6 space-y-2">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex-1 overflow-hidden space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  const subscriptions = data?.subscriptions ?? [];

  return (
    <div className="h-full flex flex-col p-8 overflow-hidden">
      <PageHeader
        title="Subscriptions"
        description="Recurring charges detected from your transaction history"
      />

      {subscriptions.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="No subscriptions detected yet"
          description="Once you've imported a few months of history, charges that repeat on a regular schedule and for a stable amount will show up here automatically."
        />
      ) : (
        <div className="flex-1 overflow-auto space-y-6 animate-in fade-in duration-300">
          <div className="grid gap-6 md:grid-cols-2">
            <StatCard
              label="Monthly Recurring Cost"
              value={<Money cents={data!.totalMonthlyCost} currency="EUR" />}
            />
            <StatCard label="Active Subscriptions" value={data!.count} />
          </div>

          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardContent className="p-0">
              <div className="divide-y divide-border/50">
                {subscriptions.map((sub) => (
                  <div
                    key={sub.merchant}
                    className="flex items-center justify-between gap-4 p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold capitalize">{sub.merchant}</div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {CADENCE_LABEL[sub.cadence]} &middot;{" "}
                        {sub.status === "possibly-cancelled"
                          ? `Expected ${formatDate(sub.nextExpected)}`
                          : `Next charge ~${formatDate(sub.nextExpected)}`}
                      </div>
                    </div>
                    <Money cents={-sub.amount} currency="EUR" className="font-semibold" />
                    <Badge
                      variant="outline"
                      className={STATUS_CONFIG[sub.status].className}
                    >
                      {STATUS_CONFIG[sub.status].label}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleDismiss(sub.merchant)}
                      title="Not a subscription"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
