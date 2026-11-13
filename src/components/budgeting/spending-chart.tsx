"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { BudgetEntry } from "@/lib/types";
import { formatMonthLabel, spendingByCategory, type SpendingRange } from "@/lib/budget";
import { formatMoney } from "@/lib/format";
import { useBalancesHidden } from "@/hooks/useBalancesHidden";
import { cn } from "@/lib/utils";

/** Which window the donut shows: all time, year to date, or the strip's month. */
export type SpendingChartMode = "all" | "ytd" | "month";

/**
 * Where the money went for the selected window: one donut slice per category
 * (expense + other entries), largest first, with a legend breakdown. All
 * time / year to date are picked here; a specific month comes from the
 * month strip above (selecting a month switches this chart to it).
 */
export function SpendingChart({
  entries,
  period,
  mode,
  onModeChange,
}: {
  entries: BudgetEntry[];
  period: string;
  mode: SpendingChartMode;
  onModeChange: (mode: SpendingChartMode) => void;
}) {
  const { hidden } = useBalancesHidden();
  const range: SpendingRange = mode === "month" ? (period as SpendingRange) : mode;

  const slices = spendingByCategory(entries, range);
  const total = slices.reduce((sum, s) => sum + s.cents, 0);
  const emptyText =
    mode === "all"
      ? "No spending recorded yet."
      : mode === "ytd"
        ? "No spending recorded this year yet."
        : `No spending recorded for ${formatMonthLabel(period, true)} yet.`;

  const pills: Array<{ id: SpendingChartMode; label: string }> = [
    { id: "all", label: "All time" },
    { id: "ytd", label: "Year to date" },
  ];

  return (
    <section className="flex flex-col rounded-xl border bg-card text-card-foreground shadow-sm lg:h-full lg:flex-1">
      <header className="flex flex-col gap-3 px-5 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide">Where the money went</h2>
        <div className="flex rounded-lg bg-muted p-1">
          {pills.map((p) => (
            <button
              key={p.id}
              onClick={() => onModeChange(p.id)}
              aria-pressed={mode === p.id}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                mode === p.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      {slices.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-5 pb-8 pt-4">
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-4 px-5 pb-5 pt-3 sm:flex-row sm:items-center">
          <div className="h-[220px] w-full sm:h-[260px] sm:w-1/2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="cents"
                  nameKey="name"
                  innerRadius="60%"
                  outerRadius="92%"
                  paddingAngle={2}
                  strokeWidth={2}
                >
                  {slices.map((s) => (
                    <Cell key={s.categoryId} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const slice = payload[0].payload as (typeof slices)[number];
                    const pct = total > 0 ? Math.round((slice.cents / total) * 100) : 0;
                    return (
                      <div className="rounded-xl border bg-popover p-3 shadow-xl">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: slice.color }} />
                          <span className="text-xs font-medium">{slice.name}</span>
                          <span className="ml-auto text-xs text-muted-foreground">{pct}%</span>
                        </div>
                        <p className="mt-1 text-xs font-semibold tabular-nums">
                          {formatMoney(slice.cents, hidden)}
                        </p>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <ul className="flex-1 space-y-1.5 overflow-y-auto">
            {slices.map((s) => (
              <li key={s.categoryId} className="flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="truncate">{s.name}</span>
                <span className="ml-auto shrink-0 tabular-nums">{formatMoney(s.cents, hidden)}</span>
              </li>
            ))}
            <li className="flex items-center gap-2 border-t pt-1.5 text-sm font-semibold">
              <span className="ml-auto text-muted-foreground">Total</span>
              <span className="tabular-nums">{formatMoney(total, hidden)}</span>
            </li>
          </ul>
        </div>
      )}
    </section>
  );
}
