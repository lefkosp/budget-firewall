"use client";

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, X } from "lucide-react";
import { api } from "@/lib/api";
import { Money } from "@/components/app/Money";
import { StatusBadge } from "@/components/app/StatusBadge";
import { CategoryBadge } from "@/components/app/CategoryBadge";
import { FlagChips } from "@/components/app/FlagChips";
import type { Transaction } from "@/app/(app)/transactions/page";

interface Approval {
  id: string;
  decision: "APPROVED" | "DENIED";
  note?: string;
  createdAt: string;
}

interface TransactionDrawerProps {
  transaction: Transaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCategoryChange?: (transaction: Transaction, category: string) => void;
  onApprove?: (transaction: Transaction, note?: string) => void | Promise<void>;
  onDeny?: (transaction: Transaction, note?: string) => void | Promise<void>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="text-sm font-medium">{children}</div>
    </div>
  );
}

const NEEDS_DECISION = new Set(["PENDING", "VIOLATION"]);

export function TransactionDrawer({
  transaction,
  open,
  onOpenChange,
  onCategoryChange,
  onApprove,
  onDeny,
}: TransactionDrawerProps) {
  const [history, setHistory] = useState<Approval[]>([]);
  const [note, setNote] = useState("");
  const [deciding, setDeciding] = useState(false);

  useEffect(() => {
    if (!open || !transaction) {
      setHistory([]);
      setNote("");
      return;
    }
    api
      .get<Approval[]>(`/api/transactions/${transaction.id}/approvals`)
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [open, transaction]);

  async function decide(action: "approve" | "deny") {
    if (!transaction) return;
    try {
      setDeciding(true);
      await (action === "approve" ? onApprove?.(transaction, note) : onDeny?.(transaction, note));
      setNote("");
      const fresh = await api.get<Approval[]>(`/api/transactions/${transaction.id}/approvals`);
      setHistory(fresh);
    } finally {
      setDeciding(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        {transaction && (
          <>
            <SheetHeader>
              <SheetTitle>
                {transaction.merchantNameNormalized || transaction.rawDescription}
              </SheetTitle>
              <SheetDescription>{transaction.rawDescription}</SheetDescription>
            </SheetHeader>

            <div className="px-4 pb-4">
              <div className="flex items-center justify-between py-4">
                <Money
                  cents={transaction.amount}
                  currency={transaction.currency}
                  variant={transaction.amount < 0 ? "spend" : "income"}
                  signDisplay={transaction.amount >= 0}
                  className="text-2xl font-bold"
                />
                <StatusBadge status={transaction.approvalStatus} />
              </div>
              {transaction.matchedIntentId && (
                <div className="text-xs text-muted-foreground -mt-2 mb-2">
                  Approved via intent
                </div>
              )}

              <Separator />

              <Field label="Date">
                {new Date(transaction.bookedAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </Field>
              <Field label="Category">
                <CategoryBadge
                  category={transaction.computedCategory}
                  editable={Boolean(onCategoryChange)}
                  onSelect={(category) => onCategoryChange?.(transaction, category)}
                />
              </Field>
              <Field label="Type">{transaction.transactionType || "-"}</Field>
              <Field label="Product">{transaction.product || "-"}</Field>
              <Field label="Account">{transaction.account.name}</Field>
              {transaction.balance !== undefined && (
                <Field label="Balance after">
                  <Money cents={transaction.balance} currency={transaction.currency} />
                </Field>
              )}

              {(transaction.isGambling || transaction.isCrypto || transaction.isBlacklisted) && (
                <>
                  <Separator className="my-2" />
                  <FlagChips
                    isGambling={transaction.isGambling}
                    isCrypto={transaction.isCrypto}
                    isBlacklisted={transaction.isBlacklisted}
                    className="py-2"
                  />
                </>
              )}

              {(onApprove || onDeny) && NEEDS_DECISION.has(transaction.approvalStatus) && (
                <>
                  <Separator className="my-2" />
                  <div className="py-2 space-y-3">
                    <Input
                      placeholder="Add a note (optional)"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        className="flex-1 bg-success hover:bg-success/90 text-success-foreground"
                        onClick={() => decide("approve")}
                        disabled={deciding}
                      >
                        <Check className="mr-2 h-4 w-4" />
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1 border-destructive/50 hover:bg-destructive/20 hover:text-destructive"
                        onClick={() => decide("deny")}
                        disabled={deciding}
                      >
                        <X className="mr-2 h-4 w-4" />
                        Deny
                      </Button>
                    </div>
                  </div>
                </>
              )}

              {history.length > 0 && (
                <>
                  <Separator className="my-2" />
                  <div className="py-2 space-y-2">
                    <div className="text-sm text-muted-foreground">Approval history</div>
                    {history.map((a) => (
                      <div key={a.id} className="flex items-start justify-between gap-2 text-sm">
                        <div>
                          <span
                            className={
                              a.decision === "APPROVED" ? "text-success" : "text-destructive"
                            }
                          >
                            {a.decision === "APPROVED" ? "Approved" : "Denied"}
                          </span>
                          {a.note && <span className="text-muted-foreground"> &mdash; {a.note}</span>}
                        </div>
                        <span className="text-muted-foreground whitespace-nowrap">
                          {new Date(a.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
