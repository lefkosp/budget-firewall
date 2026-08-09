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
  possibleSubscriptions: Subscription[];
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

function SubscriptionRow({
  sub,
  tentative,
  onDismiss,
}: {
  sub: Subscription;
  tentative: boolean;
  onDismiss: (merchant: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-4">
      <div className="min-w-0 flex-1">
        <div className="font-semibold capitalize">{sub.merchant}</div>
        <div className="text-sm text-muted-foreground mt-1">
          {CADENCE_LABEL[sub.cadence]} &middot;{" "}
          {sub.status === "possibly-cancelled"
            ? `Expected ${formatDate(sub.nextExpected)}`
            : tentative
              ? `2nd charge ${formatDate(sub.lastCharged)}`
              : `Next charge ~${formatDate(sub.nextExpected)}`}
        </div>
      </div>
      <Money cents={-sub.amount} currency="EUR" className="font-semibold" />
      {tentative ? (
        <Badge variant="outline" className="bg-primary/10 text-foreground border-primary/40">
          Possible
        </Badge>
      ) : (
        <Badge variant="outline" className={STATUS_CONFIG[sub.status].className}>
          {STATUS_CONFIG[sub.status].label}
        </Badge>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onDismiss(sub.merchant)}
        title="Not a subscription"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
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
        <div className="flex-1 min-h-0 overflow-hidden space-y-6">
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
  const possibleSubscriptions = data?.possibleSubscriptions ?? [];

  return (
    <div className="h-full flex flex-col p-8 overflow-hidden">
      <PageHeader
        title="Subscriptions"
        description="Recurring charges detected from your transaction history"
      />

      {subscriptions.length === 0 && possibleSubscriptions.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="No subscriptions detected yet"
          description="Once you've imported a few months of history, charges that repeat on a regular schedule and for a stable amount will show up here automatically."
        />
      ) : (
        <div className="flex-1 min-h-0 overflow-auto space-y-6 animate-in fade-in duration-300">
          {subscriptions.length > 0 && (
            <>
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
                      <SubscriptionRow
                        key={sub.merchant}
                        sub={sub}
                        tentative={false}
                        onDismiss={handleDismiss}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {possibleSubscriptions.length > 0 && (
            <div className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold">Possible subscriptions</h2>
                <p className="text-sm text-muted-foreground">
                  Charged twice on a matching schedule for a matching amount, but not yet
                  confirmed by a third charge. Not included in the monthly cost above.
                </p>
              </div>
              <Card className="border-dashed border-border/50 bg-card/30 backdrop-blur-sm">
                <CardContent className="p-0">
                  <div className="divide-y divide-border/50">
                    {possibleSubscriptions.map((sub) => (
                      <SubscriptionRow
                        key={sub.merchant}
                        sub={sub}
                        tentative={true}
                        onDismiss={handleDismiss}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
