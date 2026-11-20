import { describe, expect, it } from "vitest";
import { incomeBySource, spendingByCategory } from "./expenses";
import type { BudgetEntry } from "./types";

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
