import Link from "next/link";
import { BudgetView } from "@/components/budgeting/budget-view";
import {
  listArchivedBudgetCategories,
  listBudgetCategories,
  listBudgetEntries,
  listDepositTotalsByMonth,
} from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default function BudgetingPage() {
  const deposits = listDepositTotalsByMonth();
  const entries = listBudgetEntries();
  const expenseCategories = listBudgetCategories("expense");
  const otherCategories = listBudgetCategories("other");
  const archivedExpenseCategories = listArchivedBudgetCategories("expense");
  const archivedOtherCategories = listArchivedBudgetCategories("other");

  return (
    <main className="mx-auto min-h-dvh max-w-6xl space-y-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Budgeting</h1>
          <p className="text-sm text-muted-foreground">
            Where the money goes. Savings come straight from your ledger deposits.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          ← Dashboard
        </Link>
      </header>

      <BudgetView
        deposits={deposits}
        entries={entries}
        expenseCategories={expenseCategories}
        otherCategories={otherCategories}
        archivedExpenseCategories={archivedExpenseCategories}
        archivedOtherCategories={archivedOtherCategories}
      />
    </main>
  );
}
