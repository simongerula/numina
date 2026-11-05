"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Account, Movement } from "@/lib/types";
import { buildMonthlySeries, type ChartRange } from "@/lib/series";
import { useBalancesHidden } from "@/hooks/useBalancesHidden";
import { cn } from "@/lib/utils";

const ranges: Array<{ id: ChartRange; label: string }> = [
  { id: "6m", label: "6 months" },
  { id: "1y", label: "1 year" },
  { id: "all", label: "All" },
];

/** Balance-over-time chart with a selectable date range. */
export function BalanceChart({ accounts, movements }: { accounts: Account[]; movements: Movement[] }) {
  const [range, setRange] = useState<ChartRange>("6m");
  const { hidden } = useBalancesHidden();
  const monthlyData = buildMonthlySeries(accounts, movements, range);

  const tickFormatter = (v: number) => (hidden ? "•••" : `$${(v / 1000).toFixed(0)}k`);

  return (
    <section className="rounded-xl border bg-card text-card-foreground shadow-sm">
      <header className="flex flex-col gap-3 px-5 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide">
          Account performance over time
        </h2>
        <div className="flex rounded-lg bg-muted p-1">
          {ranges.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                range === r.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>
      <div className="h-[280px] px-5 pb-5 pt-3 sm:h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={monthlyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              tickFormatter={tickFormatter}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="rounded-xl border bg-popover p-3 shadow-xl">
                    <p className="mb-2 text-xs font-semibold text-muted-foreground">{label}</p>
                    {payload.map((entry, i) => (
                      <div key={i} className="flex items-center gap-2 py-0.5">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
                        <span className="text-xs text-muted-foreground">{entry.name}</span>
                        <span className="ml-auto text-xs font-semibold">
                          {hidden
                            ? "••••"
                            : `$${Number(entry.value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              }}
            />
            {accounts.map((account) => (
              <Line
                key={account.id}
                type="monotone"
                dataKey={account.name}
                stroke={account.color}
                strokeWidth={1.5}
                dot={false}
              />
            ))}
            <Line
              type="monotone"
              dataKey="Total"
              stroke="#f97316"
              strokeWidth={3}
              strokeDasharray="8 4"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
