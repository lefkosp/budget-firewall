export default function BudgetsPage() {
  return (
    <div className="h-full flex flex-col p-8 overflow-hidden">
      <div className="flex-shrink-0 mb-6">
        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
          Budgets
        </h1>
        <p className="text-muted-foreground mt-2">
          Set and manage your spending budgets by category
        </p>
      </div>
      <div className="flex-1 overflow-auto">
        <p className="text-muted-foreground">Budgets page coming soon...</p>
      </div>
    </div>
  );
}


