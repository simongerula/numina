"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Account, Movement } from "@/lib/types";
import { buildMonthlySeries } from "@/lib/series";
import { useBalancesHidden } from "@/hooks/useBalancesHidden";
import { cn } from "@/lib/utils";

const views = ["line", "bar"] as const;
type View = (typeof views)[number];

/** Balance-over-time chart, ported from doBudget's ChartsCard. */
export function BalanceChart({ accounts, movements }: { accounts: Account[]; movements: Movement[] }) {
  const [view, setView] = useState<View>("line");
  const [showAll, setShowAll] = useState(false);
  const { hidden } = useBalancesHidden();
  const monthlyData = buildMonthlySeries(accounts, movements, showAll);

  const tickFormatter = (v: number) => (hidden ? "•••" : `$${(v / 1000).toFixed(0)}k`);

  return (
    <section className="rounded-xl border bg-card text-card-foreground shadow-sm">
      <header className="flex flex-col gap-3 px-5 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide">
          {showAll ? "Account performance over time" : "Last 6 months"}
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-muted p-1">
            {views.map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                  view === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {v}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowAll(!showAll)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
              showAll ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            All
          </button>
        </div>
      </header>
      <div className="h-[280px] px-5 pb-5 pt-3 sm:h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          {view === "line" ? (
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
          ) : (
            <BarChart data={monthlyData}>
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
              {accounts.map((account, i) => (
                <Bar
                  key={account.id}
                  dataKey={account.name}
                  stackId="a"
                  fill={account.color}
                  radius={i === accounts.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                  maxBarSize={40}
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </section>
  );
}
