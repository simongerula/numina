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

/**
 * Per-month overview, newest first: every month that has activity plus the
 * current month. Savings are the month's deposit totals (the only link to
 * the ledger); spent and income come from budget entries.
 */
export function buildBudgetMonths(
  deposits: Array<{ period: string; cents: number }>,
  entries: BudgetEntry[]
): BudgetMonth[] {
  const now = new Date();
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const months = new Map<string, BudgetMonth>();
  const bucket = (period: string): BudgetMonth => {
    let m = months.get(period);
    if (!m) {
      m = { period, saved: 0, spent: 0, income: 0 };
      months.set(period, m);
    }
    return m;
  };

  // Savings: deposits only — withdrawals and adjustments never appear here.
  for (const d of deposits) bucket(d.period).saved += d.cents;

  for (const e of entries) {
    const b = bucket(e.date.slice(0, 7));
    if (e.kind === "income") b.income += e.amount_cents;
    else b.spent += e.amount_cents;
  }

  bucket(current); // the series always ends "now"

  return Array.from(months.values()).sort((a, b) => b.period.localeCompare(a.period));
}

/** Donut slice per category (expense + other) for one month, largest first. */
export function spendingByCategory(
  entries: BudgetEntry[],
  period: string
): Array<{ categoryId: string; name: string; color: string; cents: number }> {
  const slices = new Map<string, { categoryId: string; name: string; color: string; cents: number }>();

  for (const e of entries) {
    if (e.kind === "income" || !e.date.startsWith(period)) continue;
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
