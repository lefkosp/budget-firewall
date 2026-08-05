import { ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState } from "@/components/app/EmptyState";

export default function RulesPage() {
  return (
    <div className="h-full flex flex-col p-8 overflow-hidden">
      <PageHeader
        title="Rules"
        description="Manage your spending rules and restrictions"
      />
      <EmptyState
        icon={ShieldAlert}
        title="Rules are coming"
        description="The rules engine already runs on every import -- this page will let you see and edit the blacklist, thresholds, and toggles instead of them being invisible."
      />
    </div>
  );
}
