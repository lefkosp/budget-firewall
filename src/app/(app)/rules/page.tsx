"use client";

import { useCallback, useEffect, useState } from "react";
import { X, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/app/PageHeader";

type RuleType = "MERCHANT_BLACKLIST" | "GAMBLING" | "CRYPTO" | "APPROVAL_THRESHOLD";

interface Rule {
  id: string;
  type: RuleType;
  config: Record<string, any>;
  enabled: boolean;
}

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [thresholdDraft, setThresholdDraft] = useState("");
  const [newMerchant, setNewMerchant] = useState("");
  const [reevaluating, setReevaluating] = useState(false);

  const fetchRules = useCallback(async () => {
    try {
      setLoading(true);
      const result = await api.get<Rule[]>("/api/rules");
      setRules(result);
      const threshold = result.find((r) => r.type === "APPROVAL_THRESHOLD");
      setThresholdDraft(threshold ? ((threshold.config.amountCents ?? 0) / 100).toString() : "");
    } catch (error) {
      console.error("Error fetching rules:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const gamblingRule = rules.find((r) => r.type === "GAMBLING");
  const cryptoRule = rules.find((r) => r.type === "CRYPTO");
  const thresholdRule = rules.find((r) => r.type === "APPROVAL_THRESHOLD");
  const blacklistRule = rules.find((r) => r.type === "MERCHANT_BLACKLIST");
  const blacklist: string[] = blacklistRule?.config.merchants || [];

  async function toggleRule(rule: Rule, enabled: boolean) {
    try {
      const updated = await api.put<Rule>(`/api/rules/${rule.id}`, { enabled });
      setRules((prev) => prev.map((r) => (r.id === rule.id ? updated : r)));
    } catch (error: any) {
      toast.error(error.message || "Failed to update rule");
    }
  }

  async function saveThreshold() {
    if (!thresholdRule) return;
    const parsed = Math.round(parseFloat(thresholdDraft || "0") * 100);
    if (Number.isNaN(parsed) || parsed < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    try {
      const updated = await api.put<Rule>(`/api/rules/${thresholdRule.id}`, {
        config: { amountCents: parsed },
      });
      setRules((prev) => prev.map((r) => (r.id === thresholdRule.id ? updated : r)));
      toast.success("Approval threshold updated");
    } catch (error: any) {
      toast.error(error.message || "Failed to update threshold");
    }
  }

  async function addToBlacklist() {
    const merchant = newMerchant.trim();
    if (!merchant) return;
    try {
      const updated = await api.post<Rule>("/api/rules/blacklist", { merchant });
      setRules((prev) => {
        const exists = prev.some((r) => r.id === updated.id);
        return exists ? prev.map((r) => (r.id === updated.id ? updated : r)) : [...prev, updated];
      });
      setNewMerchant("");
      toast.success(`Added "${merchant}" to the blacklist`);
    } catch (error: any) {
      toast.error(error.message || "Failed to add merchant");
    }
  }

  async function removeFromBlacklist(merchant: string) {
    try {
      const updated = await api.delete<Rule>(`/api/rules/blacklist/${encodeURIComponent(merchant)}`);
      setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (error: any) {
      toast.error(error.message || "Failed to remove merchant");
    }
  }

  async function reevaluate() {
    try {
      setReevaluating(true);
      const result = await api.post<{ evaluated: number }>("/api/rules/reevaluate");
      toast.success(
        `Re-evaluated ${result.evaluated} transaction${result.evaluated === 1 ? "" : "s"} against your current rules`
      );
    } catch (error: any) {
      toast.error(error.message || "Failed to re-evaluate");
    } finally {
      setReevaluating(false);
    }
  }

  if (loading) {
    return (
      <div className="h-full flex flex-col p-8 overflow-hidden">
        <div className="flex-shrink-0 mb-6 space-y-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex-1 min-h-0 overflow-hidden space-y-6">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-8 overflow-hidden">
      <PageHeader
        title="Rules"
        description="Control what gets flagged and what needs your approval"
        actions={
          <Button
            variant="outline"
            className="border-border/50 hover:bg-accent/20"
            onClick={reevaluate}
            disabled={reevaluating}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${reevaluating ? "animate-spin" : ""}`} />
            Re-evaluate all transactions
          </Button>
        }
      />

      <div className="flex-1 min-h-0 overflow-auto space-y-6 animate-in fade-in duration-300">
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg">Flags</CardTitle>
            <CardDescription>
              Charges matching these are flagged as violations, whether or not they need approval.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {gamblingRule && (
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Gambling</div>
                  <div className="text-sm text-muted-foreground">
                    Betting sites and known gambling merchants
                  </div>
                </div>
                <Switch
                  checked={gamblingRule.enabled}
                  onCheckedChange={(checked) => toggleRule(gamblingRule, checked)}
                />
              </div>
            )}
            {cryptoRule && (
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Crypto</div>
                  <div className="text-sm text-muted-foreground">
                    Exchanges and known crypto merchants
                  </div>
                </div>
                <Switch
                  checked={cryptoRule.enabled}
                  onCheckedChange={(checked) => toggleRule(cryptoRule, checked)}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg">Approval Threshold</CardTitle>
            <CardDescription>
              Spending at or above this amount needs approval before it&apos;s neutral.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {thresholdRule && (
              <div className="flex items-center gap-4">
                <Switch
                  checked={thresholdRule.enabled}
                  onCheckedChange={(checked) => toggleRule(thresholdRule, checked)}
                />
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">&euro;</span>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={thresholdDraft}
                    onChange={(e) => setThresholdDraft(e.target.value)}
                    className="w-32"
                    disabled={!thresholdRule.enabled}
                  />
                  <Button variant="outline" size="sm" onClick={saveThreshold} className="border-border/50">
                    Save
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg">Merchant Blacklist</CardTitle>
            <CardDescription>
              Any charge whose merchant name contains one of these is always a violation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Add a merchant..."
                value={newMerchant}
                onChange={(e) => setNewMerchant(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addToBlacklist();
                }}
              />
              <Button onClick={addToBlacklist} className="bg-primary hover:bg-primary/90">
                Add
              </Button>
            </div>
            {blacklist.length === 0 ? (
              <p className="text-sm text-muted-foreground">No merchants blacklisted.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {blacklist.map((merchant) => (
                  <Badge
                    key={merchant}
                    variant="outline"
                    className="border-destructive/50 text-destructive bg-destructive/10 gap-1 pr-1"
                  >
                    {merchant}
                    <button
                      onClick={() => removeFromBlacklist(merchant)}
                      className="ml-1 rounded-full hover:bg-destructive/20 p-0.5"
                      title={`Remove ${merchant}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
