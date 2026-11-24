import { describe, expect, it } from "vitest";
import {
  accountCreateSchema,
  budgetEntryCreateSchema,
  budgetEntryItemCreateSchema,
  movementCreateSchema,
  savingsGoalCreateSchema,
} from "./schemas";

const baseMovement = {
  account_id: "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0",
  date: "2026-11-16",
  amount: 1500,
  note: "",
};

describe("movementCreateSchema", () => {
  it("accepts a valid deposit", () => {
    const parsed = movementCreateSchema.safeParse({
      ...baseMovement,
      type: "deposit",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a valid withdrawal", () => {
    const parsed = movementCreateSchema.safeParse({
      ...baseMovement,
      type: "withdraw",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects zero or negative deposit/withdraw amounts", () => {
    for (const type of ["deposit", "withdraw"] as const) {
      for (const amount of [0, -100]) {
        const parsed = movementCreateSchema.safeParse({ ...baseMovement, type, amount });
        expect(parsed.success, `${type} ${amount}`).toBe(false);
      }
    }
  });

  it("accepts nonzero adjustments, including negative", () => {
    for (const amount of [1, -1, 999999]) {
      const parsed = movementCreateSchema.safeParse({ ...baseMovement, type: "adjustment", amount });
      expect(parsed.success, `${amount}`).toBe(true);
    }
  });

  it("rejects zero adjustments", () => {
    const parsed = movementCreateSchema.safeParse({ ...baseMovement, type: "adjustment", amount: 0 });
    expect(parsed.success).toBe(false);
  });

  it("rejects fractional amounts — money is whole cents", () => {
    const parsed = movementCreateSchema.safeParse({ ...baseMovement, type: "deposit", amount: 10.5 });
    expect(parsed.success).toBe(false);
  });

  it("rejects absurdly large amounts", () => {
    const parsed = movementCreateSchema.safeParse({
      ...baseMovement,
      type: "deposit",
      amount: 1_000_000_000_01,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects unknown movement types", () => {
    const parsed = movementCreateSchema.safeParse({ ...baseMovement, type: "transfer" });
    expect(parsed.success).toBe(false);
  });
});

describe("dateStr (via movementCreateSchema)", () => {
  it("accepts real dates", () => {
    const parsed = movementCreateSchema.safeParse({ ...baseMovement, type: "deposit", date: "2024-02-29" });
    expect(parsed.success).toBe(true); // 2024 is a leap year
  });

  it("rejects impossible rollover dates", () => {
    for (const date of ["2026-02-30", "2026-02-31", "2023-02-29", "2026-04-31", "2026-13-01"]) {
      const parsed = movementCreateSchema.safeParse({ ...baseMovement, type: "deposit", date });
      expect(parsed.success, `${date}`).toBe(false);
    }
  });

  it("rejects malformed formats", () => {
    for (const date of ["2026/11/16", "16-11-2026", "2026-1-1", "yesterday", ""]) {
      const parsed = movementCreateSchema.safeParse({ ...baseMovement, type: "deposit", date });
      expect(parsed.success, `${date}`).toBe(false);
    }
  });
});

describe("accountCreateSchema", () => {
  it("accepts a valid account", () => {
    expect(accountCreateSchema.safeParse({ name: "Savings", color: "#10b981" }).success).toBe(true);
  });

  it("rejects bad colors and empty names", () => {
    expect(accountCreateSchema.safeParse({ name: "Savings", color: "red" }).success).toBe(false);
    expect(accountCreateSchema.safeParse({ name: "  ", color: "#10b981" }).success).toBe(false);
  });
});

describe("budgetEntryCreateSchema", () => {
  const catId = "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0";

  it("rejects income entries that carry a category", () => {
    const parsed = budgetEntryCreateSchema.safeParse({
      kind: "income",
      category_id: catId,
      date: "2026-11-16",
      amount: 100,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects expense entries without a category", () => {
    const parsed = budgetEntryCreateSchema.safeParse({
      kind: "expense",
      date: "2026-11-16",
      amount: 100,
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts an expense with a category and income without one", () => {
    expect(
      budgetEntryCreateSchema.safeParse({
        kind: "expense",
        category_id: catId,
        date: "2026-11-16",
        amount: 100,
      }).success
    ).toBe(true);
    expect(
      budgetEntryCreateSchema.safeParse({
        kind: "income",
        date: "2026-11-16",
        amount: 100,
      }).success
    ).toBe(true);
  });
});

describe("budgetEntryItemCreateSchema", () => {
  const base = { date: "2026-11-16", amount: 500, note: "sold shoes" };

  it("accepts a dated sub-income", () => {
    expect(budgetEntryItemCreateSchema.safeParse(base).success).toBe(true);
  });

  it("requires a positive amount", () => {
    for (const amount of [0, -100]) {
      expect(budgetEntryItemCreateSchema.safeParse({ ...base, amount }).success).toBe(false);
    }
  });

  it("rejects invalid dates", () => {
    expect(budgetEntryItemCreateSchema.safeParse({ ...base, date: "2026-02-31" }).success).toBe(false);
  });

  it("defaults a missing note to empty", () => {
    const parsed = budgetEntryItemCreateSchema.safeParse({ date: "2026-11-16", amount: 500 });
    expect(parsed.success && parsed.data.note).toBe("");
  });
});

describe("savingsGoalCreateSchema", () => {
  const accA = "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0";
  const accB = "1a2b3c4d-5e6f-7081-92a3-b4c5d6e7f809";
  const base = { name: "New car", target: 100_000, color: "#4f46e5" };

  it("accepts weighted allocations", () => {
    const parsed = savingsGoalCreateSchema.safeParse({
      ...base,
      allocations: [
        { account_id: accA, weight: 100 },
        { account_id: accB, weight: 20 },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("requires at least one account", () => {
    expect(savingsGoalCreateSchema.safeParse({ ...base, allocations: [] }).success).toBe(false);
  });

  it("rejects duplicate accounts in one goal", () => {
    const parsed = savingsGoalCreateSchema.safeParse({
      ...base,
      allocations: [
        { account_id: accA, weight: 100 },
        { account_id: accA, weight: 50 },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects weights outside 1–100", () => {
    for (const weight of [0, 101, -5, 50.5]) {
      const parsed = savingsGoalCreateSchema.safeParse({
        ...base,
        allocations: [{ account_id: accA, weight }],
      });
      expect(parsed.success, `${weight}`).toBe(false);
    }
  });

  it("rejects a zero or negative target", () => {
    for (const target of [0, -100]) {
      const parsed = savingsGoalCreateSchema.safeParse({
        ...base,
        target,
        allocations: [{ account_id: accA, weight: 100 }],
      });
      expect(parsed.success, `${target}`).toBe(false);
    }
  });
});
