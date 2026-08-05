import { PiggyBank } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState } from "@/components/app/EmptyState";

export default function BudgetsPage() {
  return (
    <div className="h-full flex flex-col p-8 overflow-hidden">
      <PageHeader
        title="Budgets"
        description="Set and manage your spending budgets by category"
      />
      <EmptyState
        icon={PiggyBank}
        title="Budgets are coming"
        description="Once categorization is in place, you'll get suggested budgets based on what you actually spend -- review and accept them instead of typing numbers in from scratch."
      />
    </div>
  );
}
