import { describe, expect, it } from "vitest";
import {
  goalEtaMonths,
  goalMonthlyPaceCents,
  goalProgress,
  goalRemainingCents,
  goalSavedCents,
  type MonthlyInflow,
} from "./goals";
import type { SavingsGoal, SavingsGoalAllocation } from "./types";

let seq = 0;

function alloc(overrides: Partial<SavingsGoalAllocation>): SavingsGoalAllocation {
  return {
    account_id: `acc-${++seq}`,
    account_name: "Account",
    account_color: "#10b981",
    account_archived: 0,
    weight: 100,
    balance_cents: 0,
    ...overrides,
  };
}

function goal(
  overrides: Partial<SavingsGoal> & { allocations: SavingsGoalAllocation[] }
): SavingsGoal {
  return {
    id: "goal-1",
    name: "New car",
    target_cents: 100_000,
    color: "#4f46e5",
    sort_order: 0,
    completed: 0,
    completed_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const now = new Date();
/** "YYYY-MM" for `monthsAgo` months before the current month. */
function period(monthsAgo: number): string {
  const d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

describe("goalSavedCents", () => {
  it("weights each account's balance independently (A 100%, B 20%)", () => {
    const a = alloc({ account_id: "a", balance_cents: 50_000, weight: 100 });
    const b = alloc({ account_id: "b", balance_cents: 100_000, weight: 20 });
    expect(goalSavedCents(goal({ allocations: [a, b] }))).toBe(50_000 + 20_000);
  });

  it("rounds per allocation to whole cents", () => {
    const a = alloc({ balance_cents: 333, weight: 10 });
    expect(goalSavedCents(goal({ allocations: [a] }))).toBe(33); // 33.3 → 33
  });
});

describe("goalProgress / goalRemainingCents", () => {
  it("reports the fraction saved, clamped to 1", () => {
    const a = alloc({ balance_cents: 70_000, weight: 100 });
    expect(goalProgress(goal({ allocations: [a] }))).toBeCloseTo(0.7);
    expect(goalRemainingCents(goal({ allocations: [a] }))).toBe(30_000);
  });

  it("never exceeds 100% when the balance overshoots the target", () => {
    const a = alloc({ balance_cents: 250_000, weight: 100 });
    const g = goal({ allocations: [a] });
    expect(goalProgress(g)).toBe(1);
    expect(goalRemainingCents(g)).toBe(0);
  });
});

describe("goalMonthlyPaceCents / goalEtaMonths", () => {
  const a = alloc({ account_id: "a", weight: 100 });
  const b = alloc({ account_id: "b", weight: 50 });

  it("averages the last 6 months of weighted money in, ignoring older ones", () => {
    const monthlyInflow: MonthlyInflow[] = [];
    for (let i = 0; i < 6; i++) {
      monthlyInflow.push({ period: period(i), account_id: "a", cents: 1_000 });
    }
    monthlyInflow.push({ period: period(7), account_id: "a", cents: 9_999 }); // ignored: too old

    expect(goalMonthlyPaceCents(goal({ allocations: [a] }), monthlyInflow)).toBe(1_000);
  });

  it("applies each account's weight to its money in", () => {
    const monthlyInflow: MonthlyInflow[] = [];
    for (let i = 0; i < 6; i++) {
      monthlyInflow.push({ period: period(i), account_id: "a", cents: 1_000 }); // 100%
      monthlyInflow.push({ period: period(i), account_id: "b", cents: 1_000 }); // 50%
    }
    // (1000 + 500) × 6 / 6 = 1500 per month
    expect(goalMonthlyPaceCents(goal({ allocations: [a, b] }), monthlyInflow)).toBe(1_500);
  });

  it("estimates whole months to the target at the recent pace", () => {
    const monthlyInflow: MonthlyInflow[] = [];
    for (let i = 0; i < 6; i++) {
      monthlyInflow.push({ period: period(i), account_id: "a", cents: 1_000 });
    }
    // saved 70k, target 100k → 30k left at 1k/month = 30 months
    const g = goal({ allocations: [alloc({ account_id: "a", balance_cents: 70_000, weight: 100 })] });
    expect(goalEtaMonths(g, monthlyInflow)).toBe(30);
  });

  it("returns null when nothing is coming in, and 0 once the target is met", () => {
    const saved = goal({ allocations: [alloc({ account_id: "a", balance_cents: 10_000 })] });
    expect(goalEtaMonths(saved, [])).toBeNull();

    const reached = goal({ allocations: [alloc({ account_id: "a", balance_cents: 100_000 })] });
    expect(goalEtaMonths(reached, [])).toBe(0);
  });
});
