import { describe, expect, it } from "vitest";
import { incomeBySource, monthStripSpent, spendingByCategory, untrackedCents } from "./expenses";
import type { BudgetEntry, BudgetMonth } from "./types";

const now = new Date();
const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-05`;
const lastYear = `${now.getFullYear() - 1}-02-10`;

let seq = 0;

function entry(overrides: Partial<BudgetEntry>): BudgetEntry {
  return {
    id: `entry-${++seq}`,
    kind: "income",
    category_id: null,
    category_name: null,
    category_color: null,
    date: thisMonth,
    amount_cents: 1000,
    note: "",
    ...overrides,
  };
}

describe("monthStripSpent", () => {
  function month(overrides: Partial<BudgetMonth>): BudgetMonth {
    return { period: thisMonth.slice(0, 7), saved: 0, spent: 0, income: 0, ...overrides };
  }

  it("adds a positive left-to-spend to spent", () => {
    // income 100, saved 60, spent 30 → left to spend 10 → strip spent 40
    expect(monthStripSpent(month({ income: 10000, saved: 6000, spent: 3000 }))).toBe(4000);
  });

  it("keeps spent unchanged when left to spend is zero", () => {
    expect(monthStripSpent(month({ income: 10000, saved: 6000, spent: 4000 }))).toBe(4000);
  });

  it("keeps spent unchanged when over budget", () => {
    expect(monthStripSpent(month({ income: 10000, saved: 6000, spent: 5000 }))).toBe(5000);
  });
});

describe("untrackedCents", () => {
  const deposits = [
    { period: "2026-11", cents: 6000 },
    { period: "2026-10", cents: 1000 },
  ];
  const incomeNov = entry({ kind: "income", date: "2026-11-03", amount_cents: 10000 });
  const spentNov = entry({ kind: "expense", date: "2026-11-04", amount_cents: 3000 });
  const incomeOct = entry({ kind: "income", date: "2026-10-03", amount_cents: 2000 });
  const spentOct = entry({ kind: "expense", date: "2026-10-04", amount_cents: 5000 });

  it("counts a month's positive leftover (income − saved − spent)", () => {
    // income 100, saved 60, spent 30 → 10 untracked
    expect(untrackedCents(deposits, [incomeNov, spentNov], "2026-11")).toBe(1000);
  });

  it("ignores months outside the window", () => {
    expect(untrackedCents(deposits, [incomeNov, spentNov, incomeOct, spentOct], "2026-11")).toBe(1000);
  });

  it("clamps each month at zero instead of netting overspend", () => {
    // Oct is over budget (20 − 10 − 50 → −40 → 0); only Nov's 10 counts.
    expect(untrackedCents(deposits, [incomeNov, spentNov, incomeOct, spentOct], "all")).toBe(1000);
  });

  it("returns zero when nothing is left over", () => {
    const income = entry({ kind: "income", date: "2026-11-03", amount_cents: 9000 });
    expect(untrackedCents(deposits, [income, spentNov], "2026-11")).toBe(0);
  });
});

describe("incomeBySource", () => {
  it("groups by trimmed, case-insensitive description, largest first", () => {
    const slices = incomeBySource(
      [
        entry({ note: "Salary", amount_cents: 5000 }),
        entry({ note: " salary ", amount_cents: 3000 }),
        entry({ note: "Freelance", amount_cents: 9000 }),
        entry({ note: "", amount_cents: 500 }),
      ],
      "all"
    );

    expect(slices.map((s) => [s.name, s.cents])).toEqual([
      ["Freelance", 9000],
      ["Salary", 8000],
      ["Uncategorized", 500],
    ]);
  });

  it("ignores non-income entries and dates outside the window", () => {
    const slices = incomeBySource(
      [
        entry({ note: "Salary", amount_cents: 1000 }),
        entry({ kind: "expense", note: "Rent", category_id: "c1", amount_cents: 2000 }),
        entry({ note: "Salary", amount_cents: 4000, date: lastYear }),
      ],
      "ytd"
    );

    expect(slices).toHaveLength(1);
    expect(slices[0]).toMatchObject({ name: "Salary", cents: 1000 });
  });

  it("colors slices from the palette in rank order", () => {
    const slices = incomeBySource(
      [entry({ note: "Salary", amount_cents: 100 }), entry({ note: "Gift", amount_cents: 200 })],
      "all"
    );

    expect(slices.map((s) => s.color)).toEqual(["#4f46e5", "#10b981"]);
  });
});

describe("spendingByCategory", () => {
  it("keeps expense + other entries and ignores income", () => {
    const slices = spendingByCategory(
      [
        entry({ kind: "expense", note: "Rent", category_id: "c1", category_name: "Rent", category_color: "#111111", amount_cents: 700 }),
        entry({ kind: "other", note: "Gift", category_id: "c2", category_name: "Gifts", category_color: "#222222", amount_cents: 300 }),
        entry({ kind: "income", note: "Salary", amount_cents: 5000 }),
      ],
      "all"
    );

    expect(slices.map((s) => [s.name, s.cents])).toEqual([
      ["Rent", 700],
      ["Gifts", 300],
    ]);
  });
});
