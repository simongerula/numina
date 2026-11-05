import { BalanceChart } from "@/components/dashboard/balance-chart";
import { BalancesTable } from "@/components/dashboard/balances-table";
import { Ledger } from "@/components/dashboard/ledger";
import { listAccounts, listMovements } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const accounts = listAccounts();
  const movements = listMovements();

  return (
    <main className="mx-auto min-h-dvh max-w-6xl space-y-6 px-4 py-8">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Numina</h1>
          <p className="text-sm text-muted-foreground">
            Your private, local money tracker — nothing leaves this machine.
          </p>
        </div>
      </header>

      <BalanceChart accounts={accounts} movements={movements} />
      <BalancesTable accounts={accounts} movements={movements} />
      <Ledger accounts={accounts} movements={movements} />
    </main>
  );
}
