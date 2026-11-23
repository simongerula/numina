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

/** A month's deposit total for one account (as returned by the ledger). */
export interface GoalDeposit {
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
 * Average monthly cents deposited into the goal's accounts over the last
 * `months` calendar months, each weighted by its allocation. Deposits only —
 * withdrawals and adjustments never count as saving. Returns 0 when there is
 * no deposit history to average.
 */
export function goalMonthlySavingsCents(
  goal: SavingsGoal,
  deposits: GoalDeposit[],
  months = 6
): number {
  const periods = new Set(lastMonths(months));
  const weightByAccount = new Map(goal.allocations.map((a) => [a.account_id, a.weight]));

  let total = 0;
  for (const d of deposits) {
    if (!periods.has(d.period)) continue;
    const weight = weightByAccount.get(d.account_id);
    if (weight === undefined) continue;
    total += Math.round((d.cents * weight) / 100);
  }
  return total / months;
}

/**
 * Estimated whole months to reach the target at the recent saving pace.
 * 0 when already there, null when the pace is zero or negative (unknown).
 */
export function goalEtaMonths(
  goal: SavingsGoal,
  deposits: GoalDeposit[],
  months = 6
): number | null {
  const remaining = goalRemainingCents(goal);
  if (remaining === 0) return 0;
  const rate = goalMonthlySavingsCents(goal, deposits, months);
  if (rate <= 0) return null;
  return Math.ceil(remaining / rate);
}
