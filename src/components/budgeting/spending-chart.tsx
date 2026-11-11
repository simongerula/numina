"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { BudgetEntry } from "@/lib/types";
import { spendingByCategory } from "@/lib/budget";
import { formatMoney } from "@/lib/format";
import { useBalancesHidden } from "@/hooks/useBalancesHidden";

/**
 * Where the money went for the selected month: one donut slice per category
 * (expense + other entries), largest first, with a legend breakdown.
 */
export function SpendingChart({ entries, period }: { entries: BudgetEntry[]; period: string }) {
  const { hidden } = useBalancesHidden();
  const slices = spendingByCategory(entries, period);
  const total = slices.reduce((sum, s) => sum + s.cents, 0);

  return (
    <section className="flex flex-col rounded-xl border bg-card text-card-foreground shadow-sm lg:h-full lg:flex-1">
      <header className="flex items-center justify-between px-5 pt-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide">Where the money went</h2>
      </header>

      {slices.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-5 pb-8 pt-4">
          <p className="text-sm text-muted-foreground">
            No spending recorded for this month yet.
          </p>
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
