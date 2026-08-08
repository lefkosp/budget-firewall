"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Target, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState } from "@/components/app/EmptyState";
import { Money } from "@/components/app/Money";
import { EDITABLE_CATEGORIES } from "@/lib/categories";

type IntentStatus = "PENDING" | "APPROVED" | "DENIED";

interface Intent {
  id: string;
  amount: number; // cents
  merchantText: string;
  category: string;
  note?: string;
  expiresAt: string;
  status: IntentStatus;
  createdAt: string;
}

const DURATIONS = [
  { label: "24 hours", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "7 days", hours: 168 },
];

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function IntentsPage() {
  const [intents, setIntents] = useState<Intent[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [amount, setAmount] = useState("");
  const [merchantText, setMerchantText] = useState("");
  const [category, setCategory] = useState<string>(EDITABLE_CATEGORIES[0]);
  const [note, setNote] = useState("");
  const [durationHours, setDurationHours] = useState(24);

  const fetchIntents = useCallback(async () => {
    try {
      setLoading(true);
      const result = await api.get<Intent[]>("/api/intents");
      setIntents(result);
    } catch (error) {
      console.error("Error fetching intents:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIntents();
  }, [fetchIntents]);

  const now = Date.now();
  const pending = useMemo(
    () => intents.filter((i) => i.status === "PENDING" && new Date(i.expiresAt).getTime() >= now),
    [intents, now]
  );
  const approved = useMemo(() => intents.filter((i) => i.status === "APPROVED"), [intents]);
  const expired = useMemo(
    () =>
      intents.filter(
        (i) =>
          i.status === "DENIED" ||
          (i.status === "PENDING" && new Date(i.expiresAt).getTime() < now)
      ),
    [intents, now]
  );

  async function createIntent() {
    const parsedAmount = Math.round(parseFloat(amount || "0") * 100);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (!merchantText.trim()) {
      toast.error("Enter a merchant");
      return;
    }
    try {
      setCreating(true);
      const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();
      await api.post("/api/intents", {
        amount: parsedAmount,
        merchantText: merchantText.trim(),
        category,
        note: note.trim() || undefined,
        expiresAt,
      });
      setAmount("");
      setMerchantText("");
      setNote("");
      toast.success("Intent created -- matching charges will be pre-approved automatically");
      fetchIntents();
    } catch (error: any) {
      toast.error(error.message || "Failed to create intent");
    } finally {
      setCreating(false);
    }
  }

  async function cancelIntent(intent: Intent) {
    try {
      await api.delete(`/api/intents/${intent.id}`);
      setIntents((prev) => prev.filter((i) => i.id !== intent.id));
      toast.success("Intent cancelled");
    } catch (error: any) {
      toast.error(error.message || "Failed to cancel intent");
    }
  }

  function IntentRow({ intent, cancellable }: { intent: Intent; cancellable?: boolean }) {
    return (
      <div className="flex items-center justify-between gap-4 p-4">
        <div className="min-w-0 flex-1">
          <div className="font-semibold capitalize">{intent.merchantText}</div>
          <div className="text-sm text-muted-foreground mt-1">
            {intent.category}
            {intent.note && <> &middot; {intent.note}</>}
            {" · "}
            {intent.status === "PENDING"
              ? `Expires ${formatDateTime(intent.expiresAt)}`
              : `Expired ${formatDateTime(intent.expiresAt)}`}
          </div>
        </div>
        <Money cents={intent.amount} currency="EUR" className="font-semibold" />
        {cancellable && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => cancelIntent(intent)}
            title="Cancel intent"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex flex-col p-8 overflow-hidden">
        <div className="flex-shrink-0 mb-6 space-y-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex-1 min-h-0 overflow-hidden space-y-6">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-8 overflow-hidden">
      <PageHeader
        title="Intents"
        description="Pre-approve a purchase you're about to make so it doesn't get flagged"
      />

      <div className="flex-1 min-h-0 overflow-auto space-y-6 animate-in fade-in duration-300">
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg">New Intent</CardTitle>
            <CardDescription>
              &quot;I&apos;m about to spend ~€50 at Ikea&quot; -- a matching charge within 10% of
              the amount is approved automatically instead of landing in Pending.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label>Merchant</Label>
                <Input
                  placeholder="e.g. Ikea"
                  value={merchantText}
                  onChange={(e) => setMerchantText(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Amount (&euro;)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="50.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {EDITABLE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2 lg:col-span-2">
                <Label>Note (optional)</Label>
                <Input
                  placeholder="What's this for?"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Expires in</Label>
                <div className="flex gap-2">
                  {DURATIONS.map((d) => (
                    <Button
                      key={d.hours}
                      type="button"
                      variant={durationHours === d.hours ? "default" : "outline"}
                      size="sm"
                      className={
                        durationHours === d.hours
                          ? "bg-primary hover:bg-primary/90"
                          : "border-border/50"
                      }
                      onClick={() => setDurationHours(d.hours)}
                    >
                      {d.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            <Button
              onClick={createIntent}
              disabled={creating}
              className="mt-4 bg-primary hover:bg-primary/90"
            >
              Create Intent
            </Button>
          </CardContent>
        </Card>

        {intents.length === 0 ? (
          <EmptyState
            icon={Target}
            title="No intents yet"
            description="Create one before a purchase you know is coming, and the matching charge will skip the approval queue entirely."
          />
        ) : (
          <>
            <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  Pending <Badge variant="outline">{pending.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {pending.length === 0 ? (
                  <p className="px-6 pb-6 text-sm text-muted-foreground">No pending intents.</p>
                ) : (
                  <div className="divide-y divide-border/50">
                    {pending.map((intent) => (
                      <IntentRow key={intent.id} intent={intent} cancellable />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {approved.length > 0 && (
              <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    Approved <Badge variant="outline">{approved.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-border/50">
                    {approved.map((intent) => (
                      <IntentRow key={intent.id} intent={intent} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {expired.length > 0 && (
              <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2 text-muted-foreground">
                    Expired <Badge variant="outline">{expired.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-border/50 opacity-60">
                    {expired.map((intent) => (
                      <IntentRow key={intent.id} intent={intent} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
