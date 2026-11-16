"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { savingsByAccount } from "@/lib/expenses";
import { formatMoney } from "@/lib/format";
import { useBalancesHidden } from "@/hooks/useBalancesHidden";

type SavingsDeposit = {
  period: string;
  account_id: string;
  account_name: string;
  account_color: string;
  cents: number;
};

/**
 * Mini donut for the month summary card: where one month's savings went, one
 * slice per ledger account. Only rendered when a month is picked on the strip
 * (the summary card shows a hint instead); the bigger spending breakdown
 * lives in the chart card next to it.
 */
export function SavingsDonut({
  deposits,
  period,
}: {
  deposits: SavingsDeposit[];
  /** "YYYY-MM" of the month to break down. */
  period: string;
}) {
  const { hidden } = useBalancesHidden();
  const slices = savingsByAccount(deposits, period);
  const total = slices.reduce((sum, s) => sum + s.cents, 0);

  if (slices.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-center text-xs text-muted-foreground">No savings recorded this month.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 items-center gap-3">
      <div className="h-[130px] w-1/2 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="cents"
              nameKey="name"
              innerRadius="62%"
              outerRadius="94%"
              paddingAngle={2}
              strokeWidth={2}
            >
              {slices.map((s) => (
                <Cell key={s.accountId} fill={s.color} />
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

      <ul className="flex-1 space-y-1 overflow-hidden text-xs">
        {slices.map((s) => (
          <li key={s.accountId} className="flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="truncate">{s.name}</span>
            <span className="ml-auto shrink-0 tabular-nums">{formatMoney(s.cents, hidden)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
