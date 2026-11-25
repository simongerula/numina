import Database from "better-sqlite3";
import { beforeAll, describe, expect, it, vi } from "vitest";

// Swap the real file-backed singleton for an in-memory database built from the
// same DDL, so tests exercise the SQL without ever touching data/numina.db.
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return {
    ...actual,
    getDb: () => {
      if (!testDb) throw new Error("test DB not initialised");
      return testDb;
    },
  };
});

let testDb: Database.Database | undefined;

beforeAll(() => {
  // Imported lazily so the factory above can grab SCHEMA_SQL from the real module.
  return (async () => {
    const actual = await import("@/lib/db");
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(actual.SCHEMA_SQL);
    testDb = db;
  })();
});

import {
  archiveAccount,
  createAccount,
  createBudgetCategory,
  createBudgetEntry,
  createBudgetEntryItem,
  createMovement,
  createSavingsGoal,
  deleteBudgetEntry,
  deleteBudgetEntryItem,
  deleteMovement,
  deleteSavingsGoal,
  listAccounts,
  listArchivedAccounts,
  listBudgetCategories,
  listBudgetEntries,
  listCompletedSavingsGoals,
  listMonthlyInflowByAccount,
  listMovements,
  listSavingsGoals,
  updateBudgetEntry,
  updateBudgetEntryItem,
  updateMovement,
  updateSavingsGoal,
} from "@/lib/db/queries";
import type { BudgetEntryCreate, MovementCreate } from "@/lib/schemas";
import { InputError } from "@/lib/server/guard";

function accountId(): string {
  return createAccount({ name: "Test Account", color: "#10b981" });
}

function addMovement(input: Omit<MovementCreate, "date" | "note"> & { date?: string }): string {
  return createMovement({ date: "2026-11-01", note: "", ...input });
}

function addBudgetEntry(
  input: Omit<BudgetEntryCreate, "date" | "note"> & { date?: string; note?: string }
): string {
  return createBudgetEntry({ date: "2026-11-01", note: "", ...input });
}

describe("accounts", () => {
  it("creates, lists, and computes a zero balance", () => {
    const id = accountId();
    const found = listAccounts().find((a) => a.id === id);
    expect(found).toBeDefined();
    expect(found?.balance).toBe(0);
  });

  it("archives instead of deleting — movements survive", () => {
    const id = accountId();
    addMovement({ account_id: id, type: "deposit", amount: 1000 });
    archiveAccount(id);

    expect(listAccounts().find((a) => a.id === id)).toBeUndefined();
    const archived = listArchivedAccounts().find((a) => a.id === id);
    expect(archived?.balance).toBe(1000);
  });
});

describe("movements — signed integer cents", () => {
  it("applies signs at write time: +deposit, −withdraw, adjustment as given", () => {
    const id = accountId();
    addMovement({ account_id: id, type: "deposit", amount: 50_000 });
    addMovement({ account_id: id, date: "2026-11-02", type: "withdraw", amount: 20_000 });
    addMovement({ account_id: id, date: "2026-11-03", type: "adjustment", amount: -500 });

    const balance = listAccounts().find((a) => a.id === id)?.balance;
    expect(balance).toBe(29_500); // 500.00 - 200.00 - 5.00 in cents
  });

  it("rejects unknown and archived accounts", () => {
    expect(() =>
      addMovement({
        account_id: "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0",
        type: "deposit",
        amount: 100,
      })
    ).toThrow(InputError);

    const id = accountId();
    archiveAccount(id);
    expect(() => addMovement({ account_id: id, type: "deposit", amount: 100 })).toThrow(InputError);
  });

  it("flips the stored sign when an edit changes the type without a new amount", () => {
    const id = accountId();
    const movementId = addMovement({ account_id: id, type: "deposit", amount: 10_000 });

    updateMovement(movementId, { type: "withdraw" });

    const stored = listMovements().find((m) => m.id === movementId);
    expect(stored?.amount_cents).toBe(-10_000);
  });

  it("deletes a movement and updates the balance", () => {
    const id = accountId();
    const movementId = addMovement({ account_id: id, type: "deposit", amount: 7_500 });
    deleteMovement(movementId);

    expect(listAccounts().find((a) => a.id === id)?.balance).toBe(0);
    expect(() => deleteMovement(movementId)).toThrow(InputError);
  });

  it("reports money in per account per month, ignoring withdrawals and negative adjustments", () => {
    const id = accountId();
    addMovement({ account_id: id, date: "2026-11-01", type: "deposit", amount: 5_000 });
    addMovement({ account_id: id, date: "2026-11-02", type: "withdraw", amount: 2_000 });
    addMovement({ account_id: id, date: "2026-11-03", type: "adjustment", amount: -500 });
    addMovement({ account_id: id, date: "2026-11-04", type: "adjustment", amount: 300 });

    const row = listMonthlyInflowByAccount().find(
      (r) => r.account_id === id && r.period === "2026-11"
    );
    expect(row?.cents).toBe(5_300); // 5000 deposit + 300 positive adjustment
  });
});

describe("budget entries", () => {
  it("income needs no category; expense requires one of its own kind", () => {
    expect(() => addBudgetEntry({ kind: "income", amount: 100 })).not.toThrow();

    expect(() => addBudgetEntry({ kind: "expense", amount: 100 })).toThrow(InputError);

    const categoryId = createBudgetCategory({ kind: "expense", name: "Food", color: "#f97316" });
    expect(() =>
      addBudgetEntry({ kind: "expense", category_id: categoryId, amount: 250 })
    ).not.toThrow();

    // An "other" category cannot back an "expense" entry.
    const otherId = createBudgetCategory({ kind: "other", name: "Fun", color: "#f59e0b" });
    expect(() =>
      addBudgetEntry({ kind: "expense", category_id: otherId, amount: 250 })
    ).toThrow(InputError);
  });

  it("updates an income line's own amount to 0 (its total is all sub-incomes)", () => {
    const entryId = addBudgetEntry({ kind: "income", amount: 1000, note: "Marketplace" });
    updateBudgetEntry(entryId, { amount: 0 });
    expect(listBudgetEntries().find((e) => e.id === entryId)?.amount_cents).toBe(0);
  });

  it("keeps seeded and user categories separate per kind", () => {
    const expenses = listBudgetCategories("expense");
    const others = listBudgetCategories("other");
    expect(expenses.every((c) => c.kind === "expense")).toBe(true);
    expect(others.every((c) => c.kind === "other")).toBe(true);
  });
});

describe("sub-incomes (budget entry items)", () => {
  it("attaches sub-incomes to an income entry and lists them", () => {
    const entryId = addBudgetEntry({ kind: "income", amount: 1000, note: "Marketplace" });
    createBudgetEntryItem(entryId, { date: "2026-11-03", note: "sold shoes", amount: 300 });
    createBudgetEntryItem(entryId, { date: "2026-11-05", note: "sold table", amount: 200 });

    const found = listBudgetEntries().find((e) => e.id === entryId);
    expect(found?.items.map((i) => [i.note, i.amount_cents])).toEqual([
      ["sold shoes", 300],
      ["sold table", 200],
    ]);
  });

  it("only allows sub-incomes on income entries", () => {
    const categoryId = createBudgetCategory({ kind: "expense", name: "Food", color: "#f97316" });
    const expenseId = addBudgetEntry({ kind: "expense", category_id: categoryId, amount: 100 });
    expect(() =>
      createBudgetEntryItem(expenseId, { date: "2026-11-03", note: "x", amount: 100 })
    ).toThrow(InputError);

    expect(() =>
      createBudgetEntryItem("0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0", {
        date: "2026-11-03",
        note: "x",
        amount: 100,
      })
    ).toThrow(InputError);
  });

  it("updates and deletes a sub-income, scoped to its parent", () => {
    const entryId = addBudgetEntry({ kind: "income", amount: 1000, note: "Marketplace" });
    const itemId = createBudgetEntryItem(entryId, { date: "2026-11-03", note: "sold shoes", amount: 300 });

    updateBudgetEntryItem(entryId, itemId, { amount: 350, note: "sold boots" });
    let found = listBudgetEntries().find((e) => e.id === entryId);
    expect(found?.items[0]).toMatchObject({ note: "sold boots", amount_cents: 350 });

    deleteBudgetEntryItem(entryId, itemId);
    found = listBudgetEntries().find((e) => e.id === entryId);
    expect(found?.items).toEqual([]);
    expect(() => deleteBudgetEntryItem(entryId, itemId)).toThrow(InputError);
  });

  it("removes sub-incomes when the parent entry is deleted (cascade)", () => {
    const entryId = addBudgetEntry({ kind: "income", amount: 1000, note: "Marketplace" });
    createBudgetEntryItem(entryId, { date: "2026-11-03", note: "sold shoes", amount: 300 });
    deleteBudgetEntry(entryId);
    expect(listBudgetEntries().find((e) => e.id === entryId)).toBeUndefined();
  });

  it("refuses to turn an income line with sub-incomes into another kind", () => {
    const entryId = addBudgetEntry({ kind: "income", amount: 1000, note: "Marketplace" });
    createBudgetEntryItem(entryId, { date: "2026-11-03", note: "sold shoes", amount: 300 });
    const categoryId = createBudgetCategory({ kind: "expense", name: "Food", color: "#f97316" });

    expect(() => updateBudgetEntry(entryId, { kind: "expense", category_id: categoryId })).toThrow(
      InputError
    );
  });
});

describe("savings goals", () => {
  it("creates a goal with weighted allocations and derives each account's balance", () => {
    const a = accountId();
    const b = accountId();
    addMovement({ account_id: a, type: "deposit", amount: 50_000 });

    const id = createSavingsGoal({
      name: "New car",
      target: 1_000_000,
      color: "#4f46e5",
      allocations: [
        { account_id: a, weight: 100 },
        { account_id: b, weight: 20 },
      ],
    });

    const found = listSavingsGoals().find((g) => g.id === id);
    expect(found?.name).toBe("New car");
    expect(found?.completed).toBe(0);
    expect(found?.allocations).toHaveLength(2);

    const allocA = found?.allocations.find((x) => x.account_id === a);
    expect(allocA?.weight).toBe(100);
    expect(allocA?.balance_cents).toBe(50_000);
  });

  it("refuses unknown or archived accounts (and rolls the goal back)", () => {
    const before = listSavingsGoals().length;

    expect(() =>
      createSavingsGoal({
        name: "Bad",
        target: 100,
        color: "#4f46e5",
        allocations: [
          { account_id: "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0", weight: 100 },
        ],
      })
    ).toThrow(InputError);
    expect(listSavingsGoals().length).toBe(before);

    const archived = accountId();
    archiveAccount(archived);
    expect(() =>
      createSavingsGoal({
        name: "Hidden",
        target: 100,
        color: "#10b981",
        allocations: [{ account_id: archived, weight: 100 }],
      })
    ).toThrow(InputError);
  });

  it("refuses to complete a goal before it reaches its target", () => {
    const account = accountId();
    const id = createSavingsGoal({
      name: "Almost there",
      target: 10_000,
      color: "#f97316",
      allocations: [{ account_id: account, weight: 100 }],
    });

    // Nothing saved yet → cannot complete.
    expect(() => updateSavingsGoal(id, { completed: true })).toThrow(InputError);

    // Halfway → still cannot complete.
    addMovement({ account_id: account, type: "deposit", amount: 5_000 });
    expect(() => updateSavingsGoal(id, { completed: true })).toThrow(InputError);

    // Fully funded → completes.
    addMovement({ account_id: account, type: "deposit", amount: 5_000 });
    expect(() => updateSavingsGoal(id, { completed: true })).not.toThrow();
    expect(listCompletedSavingsGoals().find((g) => g.id === id)?.completed).toBe(1);
  });

  it("updates a goal's name, target, and color", () => {
    const account = accountId();
    const id = createSavingsGoal({
      name: "Old name",
      target: 1_000,
      color: "#4f46e5",
      allocations: [{ account_id: account, weight: 100 }],
    });

    updateSavingsGoal(id, { name: "New name", target: 2_500, color: "#10b981" });

    const found = listSavingsGoals().find((g) => g.id === id);
    expect(found?.name).toBe("New name");
    expect(found?.target_cents).toBe(2_500);
    expect(found?.color).toBe("#10b981");
    // Allocations are untouched by a metadata edit.
    expect(found?.allocations).toHaveLength(1);
  });

  it("completes (archives), restores, and permanently deletes", () => {
    const account = accountId();
    const id = createSavingsGoal({
      name: "Trip",
      target: 500_000,
      color: "#10b981",
      allocations: [{ account_id: account, weight: 100 }],
    });
    // Only funded goals may be completed (see the gate test above).
    addMovement({ account_id: account, type: "deposit", amount: 500_000 });

    updateSavingsGoal(id, { completed: true });
    expect(listSavingsGoals().find((g) => g.id === id)).toBeUndefined();
    const archived = listCompletedSavingsGoals().find((g) => g.id === id);
    expect(archived?.completed).toBe(1);
    expect(archived?.completed_at).not.toBeNull();

    updateSavingsGoal(id, { completed: false });
    expect(listSavingsGoals().find((g) => g.id === id)).toBeDefined();

    deleteSavingsGoal(id);
    expect(listSavingsGoals().find((g) => g.id === id)).toBeUndefined();
    expect(() => updateSavingsGoal(id, { completed: true })).toThrow(InputError);
    expect(() => deleteSavingsGoal(id)).toThrow(InputError);
  });
});
