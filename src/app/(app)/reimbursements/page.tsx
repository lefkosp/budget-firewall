"use client";

import { useCallback, useEffect, useState } from "react";
import { HandCoins, Link2, X, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState } from "@/components/app/EmptyState";
import { Money } from "@/components/app/Money";
import { cn } from "@/lib/utils";

/** A P2P inflow ("Transfer from ...") with how much of it is already linked. GET /api/reimbursements/inflows */
interface P2PInflow {
  id: string;
  bookedAt: string;
  amount: number; // cents
  counterpartyName: string | null;
  rawDescription: string;
  linkedAmount: number;
  remainingAmount: number;
}

/** GET /api/reimbursements/inflows/:id/suggestions */
interface Suggestion {
  transactionId: string;
  bookedAt: string;
  amount: number;
  merchantNameNormalized: string;
  rawDescription: string;
  computedCategory: string;
  suggestedAmount: number;
  daysBefore: number;
  exactAmountMatch: boolean;
}

interface LinkedTransactionSummary {
  id: string;
  merchantNameNormalized: string;
  rawDescription: string;
  counterpartyName: string | null;
  amount: number;
  bookedAt: string;
}

/** GET /api/reimbursements/links?transactionId=... */
interface Link {
  id: string;
  expenseTransactionId: string;
  reimbursementTransactionId: string;
  linkedAmount: number;
  createdAt: string;
  expense: LinkedTransactionSummary;
  reimbursement: LinkedTransactionSummary;
}

function displayName(tx: LinkedTransactionSummary) {
  return tx.counterpartyName || tx.merchantNameNormalized || tx.rawDescription;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ReimbursementsPage() {
  const [inflows, setInflows] = useState<P2PInflow[]>([]);
  const [loading, setLoading] = useState(true);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion[]>>({});
  const [suggestionsLoading, setSuggestionsLoading] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, Link[]>>({});
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({});
  const [linking, setLinking] = useState<string | null>(null);

  const fetchInflows = useCallback(async () => {
    try {
      setLoading(true);
      const result = await api.get<P2PInflow[]>("/api/reimbursements/inflows");
      setInflows(result);
    } catch (error) {
      console.error("Error fetching P2P inflows:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInflows();
  }, [fetchInflows]);

  async function fetchLinks(inflowId: string) {
    try {
      const result = await api.get<Link[]>(`/api/reimbursements/links?transactionId=${inflowId}`);
      setLinks((prev) => ({ ...prev, [inflowId]: result }));
    } catch (error) {
      console.error("Error fetching reimbursement links:", error);
    }
  }

  useEffect(() => {
    // Every inflow's existing links, so "already linked" amounts are visible
    // without an extra click -- only the suggestion search is lazy.
    inflows.forEach((inflow) => fetchLinks(inflow.id));
  }, [inflows]);

  async function toggleExpanded(inflow: P2PInflow) {
    const next = expanded === inflow.id ? null : inflow.id;
    setExpanded(next);
    if (next && !suggestions[inflow.id]) {
      try {
        setSuggestionsLoading(inflow.id);
        const result = await api.get<Suggestion[]>(
          `/api/reimbursements/inflows/${inflow.id}/suggestions`
        );
        setSuggestions((prev) => ({ ...prev, [inflow.id]: result }));
        const drafts: Record<string, string> = {};
        for (const s of result) {
          drafts[`${inflow.id}:${s.transactionId}`] = (s.suggestedAmount / 100).toFixed(2);
        }
        setAmountDrafts((prev) => ({ ...prev, ...drafts }));
      } catch (error: any) {
        toast.error(error.message || "Failed to load suggestions");
      } finally {
        setSuggestionsLoading(null);
      }
    }
  }

  async function linkSuggestion(inflow: P2PInflow, suggestion: Suggestion) {
    const draftKey = `${inflow.id}:${suggestion.transactionId}`;
    const euros = parseFloat(amountDrafts[draftKey] ?? "0");
    const amount = Math.round(euros * 100);
    if (Number.isNaN(amount) || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }

    try {
      setLinking(draftKey);
      await api.post("/api/reimbursements/links", {
        expenseTransactionId: suggestion.transactionId,
        reimbursementTransactionId: inflow.id,
        amount,
      });
      toast.success("Linked -- Net Spend will reflect this");
      await Promise.all([fetchInflows(), fetchLinks(inflow.id)]);
      setSuggestions((prev) => {
        const rest = { ...prev };
        delete rest[inflow.id];
        return rest;
      });
    } catch (error: any) {
      toast.error(error.message || "Failed to link");
    } finally {
      setLinking(null);
    }
  }

  async function unlink(inflowId: string, link: Link) {
    try {
      await api.delete(`/api/reimbursements/links/${link.id}`);
      toast.success("Unlinked");
      await Promise.all([fetchInflows(), fetchLinks(inflowId)]);
    } catch (error: any) {
      toast.error(error.message || "Failed to unlink");
    }
  }

  if (loading) {
    return (
      <div className="h-full flex flex-col p-8 overflow-hidden">
        <div className="flex-shrink-0 mb-6 space-y-2">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="flex-1 min-h-0 overflow-hidden space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-8 overflow-hidden">
      <PageHeader
        title="Reimbursements"
        description="Money someone sent you back via Revolut transfer -- link it to the expense it repaid so Net Spend stops double-counting it."
      />

      <div className="flex-1 min-h-0 overflow-auto space-y-4 animate-in fade-in duration-300">
        {inflows.length === 0 ? (
          <EmptyState
            icon={HandCoins}
            title="No P2P transfers yet"
            description="When someone pays you back via a Revolut transfer (not a pocket/vault move), it'll show up here so you can link it to whatever it reimbursed."
          />
        ) : (
          inflows.map((inflow) => {
            const isFullyLinked = inflow.remainingAmount === 0;
            const inflowLinks = links[inflow.id] ?? [];
            const isExpanded = expanded === inflow.id;

            return (
              <Card key={inflow.id} className="border-border/50 bg-card/50 backdrop-blur-sm">
                <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">
                      {inflow.counterpartyName || inflow.rawDescription}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {formatDate(inflow.bookedAt)}
                    </div>
                  </div>
                  <Money cents={inflow.amount} currency="EUR" variant="income" className="font-semibold" />
                  {isFullyLinked ? (
                    <Badge variant="secondary" className="bg-success/15 text-success border-transparent">
                      Fully linked
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-warning/50 text-warning">
                      <Money cents={inflow.remainingAmount} currency="EUR" className="text-warning" /> unlinked
                    </Badge>
                  )}
                  {!isFullyLinked && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-border/50 shrink-0"
                      onClick={() => toggleExpanded(inflow)}
                    >
                      <Link2 className="h-4 w-4" />
                      Find match
                      <ChevronDown
                        className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-180")}
                      />
                    </Button>
                  )}
                </CardHeader>

                {inflowLinks.length > 0 && (
                  <CardContent className="pt-0 pb-4">
                    <div className="text-xs font-medium text-muted-foreground mb-2">
                      Reimburses
                    </div>
                    <div className="space-y-2">
                      {inflowLinks.map((link) => (
                        <div
                          key={link.id}
                          className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background/50 px-3 py-2 text-sm"
                        >
                          <span className="text-muted-foreground truncate">
                            {displayName(link.expense)}
                          </span>
                          <div className="flex items-center gap-2">
                            <Money cents={link.linkedAmount} currency="EUR" className="font-medium" />
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => unlink(inflow.id, link)}
                              title="Unlink"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}

                {isExpanded && (
                  <CardContent className="pt-0">
                    {suggestionsLoading === inflow.id ? (
                      <div className="space-y-2">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                      </div>
                    ) : (suggestions[inflow.id]?.length ?? 0) === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">
                        No candidate expenses found in the 30 days before this transfer.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {suggestions[inflow.id]!.map((s) => {
                          const draftKey = `${inflow.id}:${s.transactionId}`;
                          return (
                            <div
                              key={s.transactionId}
                              className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background/50 px-3 py-2"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium truncate">
                                  {s.merchantNameNormalized || s.rawDescription}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {formatDate(s.bookedAt)} &middot; {s.daysBefore}d before &middot;{" "}
                                  <Money cents={Math.abs(s.amount)} currency="EUR" />
                                  {s.exactAmountMatch && (
                                    <Badge variant="outline" className="ml-2 text-[10px] py-0">
                                      exact match
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={amountDrafts[draftKey] ?? ""}
                                onChange={(e) =>
                                  setAmountDrafts((prev) => ({ ...prev, [draftKey]: e.target.value }))
                                }
                                className="w-24 h-8"
                              />
                              <Button
                                size="sm"
                                className="bg-primary hover:bg-primary/90 shrink-0"
                                disabled={linking === draftKey}
                                onClick={() => linkSuggestion(inflow, s)}
                              >
                                Link
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
