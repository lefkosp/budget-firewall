import { Target } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState } from "@/components/app/EmptyState";

export default function IntentsPage() {
  return (
    <div className="h-full flex flex-col p-8 overflow-hidden">
      <PageHeader
        title="Intents"
        description="Pre-approve transactions before they occur"
      />
      <EmptyState
        icon={Target}
        title="Intents are coming"
        description="Declare a purchase ahead of time and it'll match automatically on import, skipping the pending-approval queue entirely."
      />
    </div>
  );
}
