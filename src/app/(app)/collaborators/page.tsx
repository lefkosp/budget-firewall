import { Users } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState } from "@/components/app/EmptyState";

export default function CollaboratorsPage() {
  return (
    <div className="h-full flex flex-col p-8 overflow-hidden">
      <PageHeader
        title="Collaborators"
        description="Manage shared budgets and spending with others"
      />
      <EmptyState
        icon={Users}
        title="Collaborators are coming"
        description="Invite an accountability buddy to approve or deny your pending transactions -- the same review flow you already use, just performed by someone else."
      />
    </div>
  );
}
