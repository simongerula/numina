import type { Account, BalancePoint, Movement } from "@/lib/types";

/**
 * Pure (no DB) derived-data helpers, safe to import from client components.
 */

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** End-of-month balance per account (in dollars) plus a "Total" series. */
export function buildMonthlySeries(
  accounts: Account[],
  movements: Movement[],
  showAll: boolean
): BalancePoint[] {
  const now = new Date();

  let keys: Array<{ year: number; monthIndex: number }>;
  if (showAll) {
    const seen = new Set(
      movements.map((m) => {
        const [y, mo] = m.date.split("-").map(Number);
        return `${y}-${mo}`;
      })
    );
    keys = Array.from(seen)
      .map((k) => {
        const [y, mo] = k.split("-").map(Number);
        return { year: y, monthIndex: mo - 1 };
      })
      .sort((a, b) => a.year - b.year || a.monthIndex - b.monthIndex);
  } else {
    keys = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      keys.push({ year: d.getFullYear(), monthIndex: d.getMonth() });
    }
  }

  return keys.map(({ year, monthIndex }) => {
    const endOfMonth = new Date(year, monthIndex + 1, 0, 23, 59, 59).getTime();
    const point: BalancePoint = { month: MONTH_NAMES[monthIndex], year, monthIndex };

    let total = 0;
    for (const account of accounts) {
      const balance = movements.reduce((sum, m) => {
        if (m.account_id !== account.id) return sum;
        const [y, mo, d] = m.date.split("-").map(Number);
        return new Date(y, mo - 1, d).getTime() <= endOfMonth ? sum + m.amount_cents : sum;
      }, 0);
      point[account.name] = balance / 100;
      total += balance;
    }
    point["Total"] = total / 100;
    return point;
  });
}

/** Signed cents an account changed during a "YYYY-MM" period. */
export function monthlyDelta(movements: Movement[], accountId: string, period: string): number {
  return movements.reduce(
    (sum, m) => (m.account_id === accountId && m.date.startsWith(period) ? sum + m.amount_cents : sum),
    0
  );
}

export function currentPeriod(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
