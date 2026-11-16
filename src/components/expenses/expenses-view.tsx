"use client";

import { useState } from "react";
import type { BudgetCategory, BudgetEntry } from "@/lib/types";
import { buildExpenseMonths, formatMonthLabel } from "@/lib/expenses";
import { currentPeriod } from "@/lib/series";
import { formatMoney } from "@/lib/format";
import { useBalancesHidden } from "@/hooks/useBalancesHidden";
import { MonthStrip } from "@/components/expenses/month-strip";
import { SpendingChart, type SpendingChartMode } from "@/components/expenses/spending-chart";
import { SavingsDonut } from "@/components/expenses/savings-donut";
import { ExpensesTable } from "@/components/expenses/expenses-table";
import { cn } from "@/lib/utils";

/**
 * Expenses view: month strip → spending breakdown + month summary →
 * income / expenses / other tables. Selected month drives summary, tables and
 * the summary card's savings donut (hidden until a strip month is picked);
 * the big donut shows all time or year to date until a strip month is picked.
 */
export function ExpensesView({
  deposits,
  savings,
  entries,
  expenseCategories,
  otherCategories,
  archivedExpenseCategories,
  archivedOtherCategories,
}: {
  deposits: Array<{ period: string; cents: number }>;
  savings: Array<{
    period: string;
    account_id: string;
    account_name: string;
    account_color: string;
    cents: number;
  }>;
  entries: BudgetEntry[];
  expenseCategories: BudgetCategory[];
  otherCategories: BudgetCategory[];
  archivedExpenseCategories: BudgetCategory[];
  archivedOtherCategories: BudgetCategory[];
}) {
  const [period, setPeriod] = useState(currentPeriod());
  // The donut shows all time until a month is picked on the strip.
  const [chartMode, setChartMode] = useState<SpendingChartMode>("all");
  const { hidden } = useBalancesHidden();

  const months = buildExpenseMonths(deposits, entries);
  // Fall back to the current month if the selection no longer has activity.
  const selectedPeriod = months.some((m) => m.period === period) ? period : currentPeriod();
  const selected = months.find((m) => m.period === selectedPeriod);
  const left = (selected?.income ?? 0) - (selected?.saved ?? 0) - (selected?.spent ?? 0);
  // The mini donut follows the big chart's scope: all time until a strip
  // month is picked, then that month's savings only.
  const savingsPeriod = chartMode === "month" ? selectedPeriod : null;

  return (
    <div className="space-y-6">
      <MonthStrip
        months={months}
        selected={selectedPeriod}
        onSelect={(p) => {
          setPeriod(p);
          setChartMode("month");
        }}
      />

      <div className="grid items-stretch gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 lg:flex">
          <SpendingChart entries={entries} period={selectedPeriod} mode={chartMode} onModeChange={setChartMode} />
        </div>
        <section className="flex flex-col rounded-xl border bg-card p-5 text-card-foreground shadow-sm">
          <div className="flex flex-1 flex-col justify-center gap-3">
            <SummaryRow label="Income" cents={selected?.income ?? 0} hidden={hidden} />
            <SummaryRow label="Savings" cents={selected?.saved ?? 0} hidden={hidden} tone="positive" />
            <SummaryRow label="Spent" cents={selected?.spent ?? 0} hidden={hidden} tone="negative" />
            <div className="border-t pt-3">
              <SummaryRow
                label="Left to spend"
                cents={left}
                hidden={hidden}
                tone={left >= 0 ? "positive" : "negative"}
                strong
              />
            </div>
          </div>
          {savingsPeriod && (
            <div className="mt-4 flex flex-1 flex-col border-t pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Savings · {formatMonthLabel(savingsPeriod, true)}
              </h3>
              <SavingsDonut deposits={savings} period={savingsPeriod} />
            </div>
          )}
        </section>
      </div>

      <ExpensesTable
        kind="income"
        period={selectedPeriod}
        entries={entries}
        categories={[]}
        archivedCategories={[]}
      />
      <ExpensesTable
        kind="expense"
        period={selectedPeriod}
        entries={entries}
        categories={expenseCategories}
        archivedCategories={archivedExpenseCategories}
      />
      <ExpensesTable
        kind="other"
        period={selectedPeriod}
        entries={entries}
        categories={otherCategories}
        archivedCategories={archivedOtherCategories}
      />
    </div>
  );
}

function SummaryRow({
  label,
  cents,
  hidden,
  tone,
  strong,
}: {
  label: string;
  cents: number;
  hidden: boolean;
  tone?: "positive" | "negative";
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn("text-sm text-muted-foreground", strong && "font-medium text-foreground")}>
        {label}
      </span>
      <span
        className={cn(
          "text-sm tabular-nums",
          strong && "text-base font-semibold",
          tone === "positive" && cents > 0 && "text-emerald-600",
          tone === "negative" && cents > 0 && "text-red-600"
        )}
      >
        {formatMoney(cents, hidden)}
      </span>
    </div>
  );
}
