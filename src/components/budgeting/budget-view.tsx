"use client";

import { useState } from "react";
import type { BudgetCategory, BudgetEntry } from "@/lib/types";
import { buildBudgetMonths } from "@/lib/budget";
import { currentPeriod } from "@/lib/series";
import { formatMoney } from "@/lib/format";
import { useBalancesHidden } from "@/hooks/useBalancesHidden";
import { MonthStrip } from "@/components/budgeting/month-strip";
import { SpendingChart } from "@/components/budgeting/spending-chart";
import { BudgetTable } from "@/components/budgeting/budget-table";
import { cn } from "@/lib/utils";

/**
 * Budgeting view: month strip → spending breakdown + month summary →
 * income / expenses / other tables. Selected month drives chart and tables.
 */
export function BudgetView({
  deposits,
  entries,
  expenseCategories,
  otherCategories,
  archivedExpenseCategories,
  archivedOtherCategories,
}: {
  deposits: Array<{ period: string; cents: number }>;
  entries: BudgetEntry[];
  expenseCategories: BudgetCategory[];
  otherCategories: BudgetCategory[];
  archivedExpenseCategories: BudgetCategory[];
  archivedOtherCategories: BudgetCategory[];
}) {
  const [period, setPeriod] = useState(currentPeriod());
  const { hidden } = useBalancesHidden();

  const months = buildBudgetMonths(deposits, entries);
  // Fall back to the current month if the selection no longer has activity.
  const selectedPeriod = months.some((m) => m.period === period) ? period : currentPeriod();
  const selected = months.find((m) => m.period === selectedPeriod);
  const left = (selected?.income ?? 0) - (selected?.saved ?? 0) - (selected?.spent ?? 0);

  return (
    <div className="space-y-6">
      <MonthStrip months={months} selected={selectedPeriod} onSelect={setPeriod} />

      <div className="grid items-stretch gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 lg:flex">
          <SpendingChart entries={entries} period={selectedPeriod} />
        </div>
        <section className="flex flex-col justify-center gap-3 rounded-xl border bg-card p-5 text-card-foreground shadow-sm">
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
        </section>
      </div>

      <BudgetTable
        kind="income"
        period={selectedPeriod}
        entries={entries}
        categories={[]}
        archivedCategories={[]}
      />
      <BudgetTable
        kind="expense"
        period={selectedPeriod}
        entries={entries}
        categories={expenseCategories}
        archivedCategories={archivedExpenseCategories}
      />
      <BudgetTable
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
