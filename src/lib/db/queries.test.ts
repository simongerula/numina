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
  createMovement,
  deleteMovement,
  listAccounts,
  listArchivedAccounts,
  listBudgetCategories,
  listMovements,
  updateMovement,
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
  input: Omit<BudgetEntryCreate, "date" | "note"> & { date?: string }
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

  it("keeps seeded and user categories separate per kind", () => {
    const expenses = listBudgetCategories("expense");
    const others = listBudgetCategories("other");
    expect(expenses.every((c) => c.kind === "expense")).toBe(true);
    expect(others.every((c) => c.kind === "other")).toBe(true);
  });
});
