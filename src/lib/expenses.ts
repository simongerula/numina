import type { BudgetEntry, BudgetMonth } from "@/lib/types";

/**
 * Pure (no DB) derived-data helpers for the expenses page, safe to import from
 * client components. Mirrors lib/series.ts conventions.
 */

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function formatMonthLabel(period: string, withYear = false): string {
  const m = Number(period.slice(5, 7)) - 1;
  const name = MONTH_NAMES[m] ?? period;
  return withYear ? `${name} '${period.slice(2, 4)}` : name;
}

/** The last `count` calendar periods ("YYYY-MM"), newest first. */
export function lastMonths(count: number, now = new Date()): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/**
 * Per-month overview, newest first: the last 12 calendar months, always
 * ending with the current month. Savings are the month's deposit totals
 * (the only link to the ledger); spent and income come from budget entries.
 */
export function buildExpenseMonths(
  deposits: Array<{ period: string; cents: number }>,
  entries: BudgetEntry[]
): BudgetMonth[] {
  const periods = lastMonths(12);

  const months = new Map<string, BudgetMonth>(
    periods.map((p) => [p, { period: p, saved: 0, spent: 0, income: 0 }])
  );

  // Savings: deposits only — withdrawals and adjustments never appear here.
  for (const d of deposits) {
    const m = months.get(d.period);
    if (m) m.saved += d.cents;
  }

  for (const e of entries) {
    const m = months.get(e.date.slice(0, 7));
    if (!m) continue;
    if (e.kind === "income") m.income += e.amount_cents;
    else m.spent += e.amount_cents;
  }

  return periods.map((p) => months.get(p) as BudgetMonth);
}

/**
 * Spent as shown on the month strip: the month's spent plus any positive
 * "left to spend" (income − saved − spent), so an under-budget month reads as
 * though the leftover was spent. Only the strip uses this; the summary card
 * and the tables keep showing the real spent figure.
 */
export function monthStripSpent(month: BudgetMonth): number {
  const left = month.income - month.saved - month.spent;
  return month.spent + Math.max(left, 0);
}

/** Donut chart window: all time (default), year to date, or one "YYYY-MM". */
export type SpendingRange = "all" | "ytd" | `${number}-${number}`;

/** True when a "YYYY-MM-DD" date falls inside the donut window. */
function rangeFilter(range: SpendingRange): (date: string) => boolean {
  if (range === "all") return () => true;
  const now = new Date();
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const yearStart = `${now.getFullYear()}-01`;
  return (date) => {
    const period = date.slice(0, 7);
    return range === "ytd" ? period >= yearStart && period <= current : period === range;
  };
}

/**
 * Positive per-month leftover (income − saved − spent) summed over a window:
 * the money that came in but was neither saved nor spent, so the donut can
 * surface it as an "Untracked" slice. Each month is clamped to zero before
 * summing, so an over-budget month never cancels another month's leftover —
 * matching the strip, where only a positive left-to-spend is folded in.
 */
export function untrackedCents(
  deposits: Array<{ period: string; cents: number }>,
  entries: BudgetEntry[],
  range: SpendingRange
): number {
  const inRange = rangeFilter(range);

  const months = new Map<string, { saved: number; spent: number; income: number }>();
  const get = (period: string) => {
    const m = months.get(period) ?? { saved: 0, spent: 0, income: 0 };
    months.set(period, m);
    return m;
  };

  for (const d of deposits) get(d.period).saved += d.cents;
  for (const e of entries) {
    const m = get(e.date.slice(0, 7));
    if (e.kind === "income") m.income += e.amount_cents;
    else m.spent += e.amount_cents;
  }

  let total = 0;
  for (const [period, m] of months) {
    if (!inRange(`${period}-01`)) continue;
    total += Math.max(m.income - m.saved - m.spent, 0);
  }
  return total;
}

/** Donut slice per category (expense + other) for the selected window, largest first. */
export function spendingByCategory(
  entries: BudgetEntry[],
  range: SpendingRange
): Array<{ categoryId: string; name: string; color: string; cents: number }> {
  const inRange = rangeFilter(range);

  const slices = new Map<string, { categoryId: string; name: string; color: string; cents: number }>();

  for (const e of entries) {
    if (e.kind === "income" || !inRange(e.date)) continue;
    const key = e.category_id ?? "uncategorized";
    const slice = slices.get(key) ?? {
      categoryId: key,
      name: e.category_name ?? "Uncategorized",
      color: e.category_color ?? "#94a3b8",
      cents: 0,
    };
    slice.cents += e.amount_cents;
    slices.set(key, slice);
  }

  return Array.from(slices.values()).sort((a, b) => b.cents - a.cents);
}

/** Income has no user-picked colors, so its slices cycle this fixed palette. */
const INCOME_COLORS = [
  "#4f46e5", "#10b981", "#f59e0b", "#8b5cf6", "#f97316", "#ec4899", "#06b6d4", "#84cc16",
];

/**
 * Income entries carry no category (the description is free text), so the
 * source is the entry's note. Empty notes fall under "Uncategorized"; notes
 * are merged case-insensitively, and slices get a stable palette color after
 * sorting largest first. Same window rules as `spendingByCategory`.
 */
export function incomeBySource(
  entries: BudgetEntry[],
  range: SpendingRange
): Array<{ source: string; name: string; color: string; cents: number }> {
  const inRange = rangeFilter(range);

  const sources = new Map<string, { source: string; name: string; cents: number }>();

  for (const e of entries) {
    if (e.kind !== "income" || !inRange(e.date)) continue;
    const name = e.note.trim() || "Uncategorized";
    const key = name.toLowerCase();
    const slice = sources.get(key) ?? { source: key, name, cents: 0 };
    slice.cents += e.amount_cents;
    sources.set(key, slice);
  }

  return Array.from(sources.values())
    .sort((a, b) => b.cents - a.cents)
    .map((s, i) => ({ ...s, color: INCOME_COLORS[i % INCOME_COLORS.length] }));
}

/**
 * Donut slice per ledger account for the month's savings: deposits only, one
 * slice per account, largest first. Only that month's ("YYYY-MM") deposits
 * are counted.
 */
export function savingsByAccount(
  deposits: Array<{
    period: string;
    account_id: string;
    account_name: string;
    account_color: string;
    cents: number;
  }>,
  period: string
): Array<{ accountId: string; name: string; color: string; cents: number }> {
  const slices = new Map<string, { accountId: string; name: string; color: string; cents: number }>();

  for (const d of deposits) {
    if (d.period !== period) continue;
    const slice = slices.get(d.account_id) ?? {
      accountId: d.account_id,
      name: d.account_name,
      color: d.account_color,
      cents: 0,
    };
    slice.cents += d.cents;
    slices.set(d.account_id, slice);
  }

  return Array.from(slices.values()).sort((a, b) => b.cents - a.cents);
}
