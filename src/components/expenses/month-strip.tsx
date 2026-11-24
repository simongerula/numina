"use client";

import type { BudgetMonth } from "@/lib/types";
import { formatMonthLabel, monthStripSpent } from "@/lib/expenses";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useBalancesHidden } from "@/hooks/useBalancesHidden";
import { useCurrency } from "@/hooks/useCurrency";

/**
 * Selectable strip of months, newest first, each showing saved (deposits)
 * and spent for the month. Spent folds in any positive "left to spend"
 * (see `monthStripSpent`); the summary card and tables show the real figure.
 */
export function MonthStrip({
  months,
  selected,
  onSelect,
}: {
  months: BudgetMonth[];
  selected: string;
  onSelect: (period: string) => void;
}) {
  const { hidden } = useBalancesHidden();
  const { symbol } = useCurrency();

  if (months.length === 0) return null;

  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm">
      <h2 className="mb-3 px-1 text-sm font-semibold uppercase tracking-wide">Months</h2>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {months.map((m) => {
          const active = m.period === selected;
          const spent = monthStripSpent(m);
          return (
            <button
              key={m.period}
              onClick={() => onSelect(m.period)}
              aria-pressed={active}
              className={cn(
                "flex w-36 shrink-0 flex-col gap-1.5 rounded-xl border p-3 text-left transition-colors",
                active
                  ? "border-primary/60 bg-primary/5 shadow-sm"
                  : "border-border hover:border-primary/30 hover:bg-accent/40"
              )}
            >
              <span className={cn("text-sm font-semibold", active && "text-primary")}>
                {formatMonthLabel(m.period, true)}
              </span>
              <span className="flex flex-col gap-0.5 text-xs text-muted-foreground tabular-nums">
                <span>
                  Saved{" "}
                  <span className={cn("font-medium", m.saved > 0 && "text-emerald-600")}>
                    {formatMoney(m.saved, hidden, symbol)}
                  </span>
                </span>
                <span>
                  Spent{" "}
                  <span className={cn("font-medium", spent > 0 && "text-red-600")}>
                    {formatMoney(spent, hidden, symbol)}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
