"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PiggyBank, Check } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/app/StatCard";
import { EmptyState } from "@/components/app/EmptyState";
import { Money } from "@/components/app/Money";
import { BudgetProgressBar } from "@/components/app/BudgetProgressBar";
import { EDITABLE_CATEGORIES } from "@/lib/categories";

interface Budget {
  id: string;
  name: string;
  monthlyLimit: number; // cents
  spentThisMonth: number; // cents, computed server-side
}

interface Suggestion {
  category: string;
  median: number;
  p75: number;
  monthsAnalyzed: number;
  suggested: number;
  highVariance: boolean;
  lowConfidence: boolean;
  rationale: string;
}

const CATEGORY_ORDER = new Map<string, number>(
  EDITABLE_CATEGORIES.map((c, i) => [c, i])
);

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [acceptingAll, setAcceptingAll] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [budgetsRes, suggestionsRes] = await Promise.all([
        api.get<Budget[]>("/api/budgets"),
        api.get<{ suggestions: Suggestion[] }>("/api/budgets/suggestions"),
      ]);

      setBudgets(budgetsRes);
      setSuggestions(suggestionsRes.suggestions);
      setDrafts(
        Object.fromEntries(budgetsRes.map((b) => [b.id, (b.monthlyLimit / 100).toString()]))
      );
    } catch (error) {
      console.error("Error fetching budgets:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const suggestionByCategory = useMemo(
    () => new Map(suggestions.map((s) => [s.category, s])),
    [suggestions]
  );

  const sortedBudgets = useMemo(
    () =>
      [...budgets].sort(
        (a, b) => (CATEGORY_ORDER.get(a.name) ?? 99) - (CATEGORY_ORDER.get(b.name) ?? 99)
      ),
    [budgets]
  );

  async function saveLimit(budget: Budget, euros: string) {
    const parsed = Math.round(parseFloat(euros || "0") * 100);
    if (Number.isNaN(parsed) || parsed < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    try {
      setSavingId(budget.id);
      await api.put<Budget>(`/api/budgets/${budget.id}`, { monthlyLimit: parsed });
      setBudgets((prev) =>
        prev.map((b) => (b.id === budget.id ? { ...b, monthlyLimit: parsed } : b))
      );
      toast.success(`${budget.name} budget updated`);
    } catch (error: any) {
      toast.error(error.message || "Failed to update budget");
    } finally {
      setSavingId(null);
    }
  }

  async function acceptSuggestion(budget: Budget, suggestion: Suggestion) {
    setDrafts((prev) => ({ ...prev, [budget.id]: (suggestion.suggested / 100).toString() }));
    await saveLimit(budget, (suggestion.suggested / 100).toString());
  }

  async function acceptAll() {
    try {
      setAcceptingAll(true);
      const updated = await api.post<Budget[]>("/api/budgets/accept-all", { suggestions });
      setBudgets(updated);
      setDrafts(
        Object.fromEntries(updated.map((b) => [b.id, (b.monthlyLimit / 100).toString()]))
      );
      toast.success("Accepted all suggested budgets");
    } catch (error: any) {
      toast.error(error.message || "Failed to accept suggestions");
    } finally {
      setAcceptingAll(false);
    }
  }

  const totalBudgeted = budgets.reduce((sum, b) => sum + b.monthlyLimit, 0);
  const totalSpent = budgets.reduce((sum, b) => sum + b.spentThisMonth, 0);
  const overBudgetCount = budgets.filter(
    (b) => b.monthlyLimit > 0 && b.spentThisMonth > b.monthlyLimit
  ).length;

  const anyUnacceptedSuggestion = budgets.some((b) => {
    const s = suggestionByCategory.get(b.name);
    return s && s.suggested > 0 && s.suggested !== b.monthlyLimit;
  });

  if (loading) {
    return (
      <div className="h-full flex flex-col p-8 overflow-hidden">
        <div className="flex-shrink-0 mb-6 space-y-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex-1 min-h-0 overflow-hidden space-y-6">
          <div className="grid gap-6 md:grid-cols-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-8 overflow-hidden">
      <PageHeader
        title="Budgets"
        description="Set and manage your spending budgets by category"
        actions={
          anyUnacceptedSuggestion ? (
            <Button
              onClick={acceptAll}
              disabled={acceptingAll}
              className="bg-primary hover:bg-primary/90"
            >
              <Check className="mr-2 h-4 w-4" />
              Accept all suggestions
            </Button>
          ) : undefined
        }
      />

      {budgets.length === 0 ? (
        <EmptyState
          icon={PiggyBank}
          title="No categories yet"
          description="Import some transactions and budget suggestions will show up here, based on what you actually spend."
        />
      ) : (
        <div className="flex-1 min-h-0 overflow-auto space-y-6 animate-in fade-in duration-300">
          <div className="grid gap-6 md:grid-cols-3">
            <StatCard
              label="Total Budgeted"
              value={<Money cents={totalBudgeted} currency="EUR" />}
            />
            <StatCard
              label="Spent This Month"
              value={<Money cents={totalSpent} currency="EUR" />}
            />
            <StatCard
              label="Over Budget"
              value={overBudgetCount}
              intent={overBudgetCount > 0 ? "destructive" : "default"}
            />
          </div>

          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardContent className="p-0">
              <div className="divide-y divide-border/50">
                {sortedBudgets.map((budget) => {
                  const suggestion = suggestionByCategory.get(budget.name);
                  const spent = budget.spentThisMonth;
                  const hasSuggestion =
                    suggestion && suggestion.suggested > 0 && suggestion.suggested !== budget.monthlyLimit;

                  return (
                    <div key={budget.id} className="flex items-center gap-6 p-4">
                      <div className="w-40 flex-shrink-0">
                        <div className="font-semibold">{budget.name}</div>
                        <div className="text-sm text-muted-foreground mt-0.5">
                          <Money cents={spent} currency="EUR" /> spent
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <BudgetProgressBar spent={spent} limit={budget.monthlyLimit} />
                        {budget.monthlyLimit === 0 && (
                          <div className="text-xs text-muted-foreground mt-1">No limit set</div>
                        )}
                      </div>

                      {suggestion && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge
                              variant="outline"
                              className={
                                suggestion.highVariance
                                  ? "border-warning/50 text-warning bg-warning/10 flex-shrink-0"
                                  : suggestion.lowConfidence
                                    ? "border-dashed border-border/50 text-muted-foreground/70 flex-shrink-0"
                                    : "border-border/50 text-muted-foreground flex-shrink-0"
                              }
                            >
                              Suggests <Money cents={suggestion.suggested} className="ml-1" />
                              {suggestion.lowConfidence && (
                                <span className="ml-1 text-[10px] uppercase tracking-wide">
                                  limited data
                                </span>
                              )}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-64">{suggestion.rationale}</TooltipContent>
                        </Tooltip>
                      )}

                      {hasSuggestion && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-accent/50 hover:bg-accent/20 flex-shrink-0"
                          onClick={() => acceptSuggestion(budget, suggestion!)}
                          disabled={savingId === budget.id}
                        >
                          Accept
                        </Button>
                      )}

                      <div className="flex items-center gap-2 flex-shrink-0 w-36">
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          value={drafts[budget.id] ?? ""}
                          onChange={(e) =>
                            setDrafts((prev) => ({ ...prev, [budget.id]: e.target.value }))
                          }
                          className="h-8"
                        />
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => saveLimit(budget, drafts[budget.id] ?? "0")}
                          disabled={savingId === budget.id}
                          title="Save"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
