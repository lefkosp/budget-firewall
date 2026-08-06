import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Money } from "@/components/app/Money";
import { StatusBadge } from "@/components/app/StatusBadge";
import { CategoryBadge } from "@/components/app/CategoryBadge";
import { FlagChips } from "@/components/app/FlagChips";
import type { Transaction } from "@/app/(app)/transactions/page";

interface TransactionDrawerProps {
  transaction: Transaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCategoryChange?: (transaction: Transaction, category: string) => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="text-sm font-medium">{children}</div>
    </div>
  );
}

/** Transaction detail view. Approval/note actions land once those APIs exist. */
export function TransactionDrawer({
  transaction,
  open,
  onOpenChange,
  onCategoryChange,
}: TransactionDrawerProps) {
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
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
