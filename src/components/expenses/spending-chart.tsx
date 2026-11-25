"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { BudgetEntry } from "@/lib/types";
import { formatMonthLabel, incomeBySource, spendingByCategory, untrackedCents, type SpendingRange } from "@/lib/expenses";
import { formatMoney } from "@/lib/format";
import { useBalancesHidden } from "@/hooks/useBalancesHidden";
import { useCurrency } from "@/hooks/useCurrency";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Which window the donut shows: all time, year to date, or the strip's month. */
export type SpendingChartMode = "all" | "ytd" | "month";

/** One donut/legend slice, whichever direction the money moved. */
type Slice = { id: string; name: string; color: string; cents: number };

/** Gray for the "Untracked" slice: money in that was neither saved nor spent. */
const UNTRACKED_COLOR = "#9ca3af";

/**
 * Money flow for the selected window, as a horizontally scrollable card: one
 * panel for where the money went (one donut slice per category, expense +
 * other entries, plus an "Untracked" slice for positive leftover that was
 * neither saved nor spent) and one for where the money came from (income
 * entries, one slice per description). Both panels share the all time / year
 * to date pills; a specific month comes from the month strip above (selecting a
 * month switches both panels to it).
 */
export function SpendingChart({
  deposits,
  entries,
  period,
  mode,
  onModeChange,
}: {
  deposits: Array<{ period: string; cents: number }>;
  entries: BudgetEntry[];
  period: string;
  mode: SpendingChartMode;
  onModeChange: (mode: SpendingChartMode) => void;
}) {
  const [panel, setPanel] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  const range: SpendingRange = mode === "month" ? (period as SpendingRange) : mode;

  // Categories first, then fold in the window's positive leftover as its own
  // slice, ranked with the rest by size. Savings stay out: this donut is where
  // spent money went plus what was left untracked.
  const spendingSlices = spendingByCategory(entries, range).map(
    (s): Slice => ({ id: s.categoryId, name: s.name, color: s.color, cents: s.cents })
  );
  const untracked = untrackedCents(deposits, entries, range);
  if (untracked > 0) {
    spendingSlices.push({ id: "untracked", name: "Untracked", color: UNTRACKED_COLOR, cents: untracked });
    spendingSlices.sort((a, b) => b.cents - a.cents);
  }

  const emptyText = (noun: string) =>
    mode === "all"
      ? `No ${noun} recorded yet.`
      : mode === "ytd"
        ? `No ${noun} recorded this year yet.`
        : `No ${noun} recorded for ${formatMonthLabel(period, true)} yet.`;

  const panels = [
    {
      title: "Where the money went",
      slices: spendingSlices,
      empty: emptyText("spending"),
    },
    {
      title: "Where the money came from",
      slices: incomeBySource(entries, range).map(
        (s): Slice => ({ id: s.source, name: s.name, color: s.color, cents: s.cents })
      ),
      empty: emptyText("income"),
    },
  ];

  // Scrolling can settle between panels; clamp so the header always has a title.
  const current = Math.min(Math.max(panel, 0), panels.length - 1);

  const goTo = (index: number) => {
    const track = trackRef.current;
    if (!track) return;
    const next = Math.max(0, Math.min(panels.length - 1, index));
    track.scrollTo({ left: next * track.clientWidth, behavior: "smooth" });
    setPanel(next);
  };

  const handleScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    const index = Math.round(track.scrollLeft / Math.max(track.clientWidth, 1));
    setPanel(Math.max(0, Math.min(panels.length - 1, index)));
  };

  const pills: Array<{ id: SpendingChartMode; label: string }> = [
    { id: "all", label: "All time" },
    { id: "ytd", label: "Year to date" },
  ];

  return (
    <section className="flex flex-col rounded-xl border bg-card text-card-foreground shadow-sm lg:h-full lg:flex-1">
      <header className="flex flex-col gap-3 px-5 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-1">
          {/* The hidden sizer keeps the arrows still while the title changes. */}
          <h2 className="grid min-w-0 text-sm font-semibold uppercase tracking-wide">
            <span className="col-start-1 row-start-1 invisible" aria-hidden>
              Where the money came from
            </span>
            <span className="col-start-1 row-start-1">{panels[current].title}</span>
          </h2>
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => goTo(current - 1)}
              disabled={current === 0}
              aria-label="Show previous chart"
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => goTo(current + 1)}
              disabled={current === panels.length - 1}
              aria-label="Show next chart"
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
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

      <div
        ref={trackRef}
        onScroll={handleScroll}
        className="flex flex-1 snap-x snap-mandatory overflow-x-auto scrollbar-none"
      >
        {panels.map((p) => (
          <div
            key={p.title}
            role="group"
            aria-label={p.title}
            className="flex w-full shrink-0 snap-start flex-col px-5 pb-5 pt-3"
          >
            <DonutPanel slices={p.slices} emptyText={p.empty} />
          </div>
        ))}
      </div>

      {panels.length > 1 && (
        <div className="flex justify-center gap-1.5 pb-4" aria-hidden>
          {panels.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              aria-label={`Show panel ${i + 1}`}
              className={cn(
                "h-2 rounded-full transition-all",
                current === i ? "w-4 bg-primary" : "w-2 bg-muted-foreground/40 hover:bg-muted-foreground"
              )}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/** One panel: the donut plus its legend and total, or an empty hint. */
function DonutPanel({ slices, emptyText }: { slices: Slice[]; emptyText: string }) {
  const { hidden } = useBalancesHidden();
  const { symbol } = useCurrency();
  const total = slices.reduce((sum, s) => sum + s.cents, 0);

  if (slices.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-8">
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-center">
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
                <Cell key={s.id} fill={s.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const slice = payload[0].payload as Slice;
                const pct = total > 0 ? Math.round((slice.cents / total) * 100) : 0;
                return (
                  <div className="rounded-xl border bg-popover p-3 shadow-xl">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: slice.color }} />
                      <span className="text-xs font-medium">{slice.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{pct}%</span>
                    </div>
                    <p className="mt-1 text-xs font-semibold tabular-nums">
                      {formatMoney(slice.cents, hidden, symbol)}
                    </p>
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {/* Ten rows (text-sm leading-5 plus the 1.5 gap) before it starts scrolling. */}
        <ul className="max-h-64 space-y-1.5 overflow-y-auto scrollbar-none">
          {slices.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="truncate">{s.name}</span>
              <span className="ml-auto shrink-0 tabular-nums">{formatMoney(s.cents, hidden, symbol)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-1.5 flex items-center gap-2 border-t pt-1.5 text-sm font-semibold">
          <span className="ml-auto text-muted-foreground">Total</span>
          <span className="tabular-nums">{formatMoney(total, hidden, symbol)}</span>
        </div>
      </div>
    </div>
  );
}
