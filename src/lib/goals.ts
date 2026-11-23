import type { SavingsGoal } from "@/lib/types";
import { lastMonths } from "@/lib/expenses";

/**
 * Pure (no DB) derived-data helpers for savings goals, safe to import from
 * client components. Mirrors lib/series.ts / lib/expenses.ts conventions.
 *
 * A goal counts each linked account's *balance* at its allocation weight:
 * account A 100% + account B 20% draws on all of A and a fifth of B. Nothing
 * about progress is stored — it recomputes from the ledger every render.
 */

/**
 * A month's money-in total for one account: deposits plus positive
 * adjustments (withdrawals and negative adjustments excluded).
 * Shape matches `listMonthlyInflowByAccount` in queries.ts.
 */
export interface MonthlyInflow {
  period: string; // "YYYY-MM"
  account_id: string;
  cents: number;
}

/** Weighted cents counted toward the goal from linked account balances. */
export function goalSavedCents(goal: SavingsGoal): number {
  return goal.allocations.reduce(
    (sum, a) => sum + Math.round((a.balance_cents * a.weight) / 100),
    0
  );
}

/** Fraction of the target saved, clamped to 0..1 (targets are validated > 0). */
export function goalProgress(goal: SavingsGoal): number {
  if (goal.target_cents <= 0) return 0;
  return Math.min(Math.max(goalSavedCents(goal) / goal.target_cents, 0), 1);
}

/** Cents still needed; 0 once the target is met. */
export function goalRemainingCents(goal: SavingsGoal): number {
  return Math.max(goal.target_cents - goalSavedCents(goal), 0);
}

/**
 * Average monthly money-in to the goal's accounts over the last `months`
 * calendar months, each weighted by its allocation. Money in = deposits plus
 * positive adjustments; withdrawals and negative adjustments are ignored, so
 * the pace tracks how much you're putting in, not market swings or spending.
 * Returns 0 when nothing came in over the window.
 */
export function goalMonthlyPaceCents(
  goal: SavingsGoal,
  monthlyInflow: MonthlyInflow[],
  months = 6
): number {
  const periods = new Set(lastMonths(months));

  // Money in per linked account over the window, then weighted like progress.
  const inflowByAccount = new Map<string, number>();
  for (const m of monthlyInflow) {
    if (!periods.has(m.period)) continue;
    inflowByAccount.set(m.account_id, (inflowByAccount.get(m.account_id) ?? 0) + m.cents);
  }

  let total = 0;
  for (const a of goal.allocations) {
    const inflow = inflowByAccount.get(a.account_id);
    if (inflow === undefined) continue;
    total += Math.round((inflow * a.weight) / 100);
  }
  return total / months;
}

/**
 * Estimated whole months to reach the target at the recent money-in pace.
 * 0 when already there, null when nothing is coming in (unknown).
 */
export function goalEtaMonths(
  goal: SavingsGoal,
  monthlyInflow: MonthlyInflow[],
  months = 6
): number | null {
  const remaining = goalRemainingCents(goal);
  if (remaining === 0) return 0;
  const rate = goalMonthlyPaceCents(goal, monthlyInflow, months);
  if (rate <= 0) return null;
  return Math.ceil(remaining / rate);
}
