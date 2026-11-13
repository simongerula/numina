import type { BudgetEntry, BudgetMonth } from "@/lib/types";

/**
 * Pure (no DB) derived-data helpers for budgeting, safe to import from
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
export function buildBudgetMonths(
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

/** Donut chart window: all time (default), year to date, or one "YYYY-MM". */
export type SpendingRange = "all" | "ytd" | `${number}-${number}`;

/** Donut slice per category (expense + other) for the selected window, largest first. */
export function spendingByCategory(
  entries: BudgetEntry[],
  range: SpendingRange
): Array<{ categoryId: string; name: string; color: string; cents: number }> {
  const now = new Date();
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const inRange = (date: string): boolean => {
    if (range === "all") return true;
    const period = date.slice(0, 7);
    if (range === "ytd") return period >= `${now.getFullYear()}-01` && period <= current;
    return period === range;
  };

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
