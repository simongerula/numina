import { BalanceChart } from "@/components/dashboard/balance-chart";
import { BalancesTable } from "@/components/dashboard/balances-table";
import { Ledger } from "@/components/dashboard/ledger";
import { MonthlyChangeRow } from "@/components/dashboard/monthly-change-row";
import { SavingsGoals } from "@/components/dashboard/savings-goals";
import { SettingsButton } from "@/components/dashboard/settings-button";
import {
  listAccounts,
  listArchivedAccounts,
  listCompletedSavingsGoals,
  listDepositTotalsByMonthByAccount,
  listMovements,
  listSavingsGoals,
} from "@/lib/db/queries";
import numinaIcon from "./icon.png";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const accounts = listAccounts();
  const hiddenAccounts = listArchivedAccounts();
  const movements = listMovements();
  const goals = listSavingsGoals();
  const completedGoals = listCompletedSavingsGoals();
  // Deposit history feeds the goals' "time to reach" estimate.
  const deposits = listDepositTotalsByMonthByAccount();

  return (
    <main className="mx-auto min-h-dvh max-w-6xl space-y-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src={numinaIcon.src}
            alt=""
            width={40}
            height={40}
            className="size-10 rounded-xl shadow-sm"
          />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Numina</h1>
            <p className="text-sm text-muted-foreground">
              A private, local-first money tracker. No cloud, no login, no telemetry.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/expenses"
            className="rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            Expenses
          </Link>
          <SettingsButton />
        </div>
      </header>

      {/* Definite row height on desktop so the chart card and accounts card match;
          the accounts list inside scrolls when it overflows. The chart card
          spans the first two columns; the table gets the (wider) third. */}
      <div className="grid items-stretch gap-6 lg:grid-cols-[1fr_1fr_1.3fr] lg:grid-rows-[400px]">
        <div className="lg:col-span-2 lg:flex">
          <BalanceChart accounts={accounts} movements={movements} />
        </div>
        <BalancesTable accounts={accounts} hiddenAccounts={hiddenAccounts} movements={movements} />
      </div>
      <MonthlyChangeRow accounts={accounts} movements={movements} />
      <SavingsGoals
        goals={goals}
        completedGoals={completedGoals}
        accounts={accounts}
        deposits={deposits}
      />
      <Ledger accounts={accounts} hiddenAccounts={hiddenAccounts} movements={movements} />
    </main>
  );
}
