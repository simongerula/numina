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
            A private, local-first money tracker. No cloud, no login, no telemetry.
          </p>
        </div>
      </header>

      <div className="grid items-stretch gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <BalanceChart accounts={accounts} movements={movements} />
        </div>
        <BalancesTable accounts={accounts} movements={movements} />
      </div>
      <Ledger accounts={accounts} movements={movements} />
    </main>
  );
}
