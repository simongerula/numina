import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/**
 * Local SQLite database singleton.
 * The data file lives in ./data/ (gitignored) so nothing is ever persisted
 * in the repository. All statements are prepared and parameterized.
 */

const DATA_DIR = path.join(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "numina.db");

declare global {
  var __numinaDb: Database.Database | undefined;
}

function createDatabase(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      color       TEXT NOT NULL,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      archived    INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS movements (
      id            TEXT PRIMARY KEY,
      account_id    TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      date          TEXT NOT NULL, -- YYYY-MM-DD
      type          TEXT NOT NULL CHECK (type IN ('deposit', 'withdraw', 'adjustment')),
      amount_cents  INTEGER NOT NULL, -- signed for 'adjustment', positive otherwise
      note          TEXT NOT NULL DEFAULT '',
      created_at    TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_movements_account ON movements(account_id);
    CREATE INDEX IF NOT EXISTS idx_movements_date ON movements(date);

    -- Budgeting is a separate data domain from the ledger. Only "savings"
    -- bridges the two, and it is derived live from deposit movements.
    CREATE TABLE IF NOT EXISTS budget_categories (
      id          TEXT PRIMARY KEY,
      kind        TEXT NOT NULL CHECK (kind IN ('expense', 'other')),
      name        TEXT NOT NULL,
      color       TEXT NOT NULL,             -- hex, for charts
      sort_order  INTEGER NOT NULL DEFAULT 0,
      archived    INTEGER NOT NULL DEFAULT 0, -- soft delete: entries keep history
      created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS budget_entries (
      id            TEXT PRIMARY KEY,
      kind          TEXT NOT NULL CHECK (kind IN ('income', 'expense', 'other')),
      category_id   TEXT REFERENCES budget_categories(id), -- NULL for income (free text)
      date          TEXT NOT NULL,           -- YYYY-MM-DD
      amount_cents  INTEGER NOT NULL,        -- always positive; sign comes from kind
      note          TEXT NOT NULL DEFAULT '',
      created_at    TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_budget_entries_date ON budget_entries(date);
    CREATE INDEX IF NOT EXISTS idx_budget_entries_category ON budget_entries(category_id);
  `);

  seedBudgetCategories(db);

  return db;
}

/**
 * One-time seeds so a fresh (or newly migrated) database has usable
 * categories: Groceries belongs to Expenses, generic picks to Other.
 * Only inserts when a kind has no categories at all.
 */
const SEED_CATEGORIES: Record<"expense" | "other", Array<{ name: string; color: string }>> = {
  expense: [
    { name: "Rent", color: "#f97316" },
    { name: "Power", color: "#f59e0b" },
    { name: "Gas", color: "#ec4899" },
    { name: "Water", color: "#06b6d4" },
    { name: "Internet", color: "#8b5cf6" },
    { name: "Groceries", color: "#10b981" },
  ],
  other: [
    { name: "Coffee", color: "#84cc16" },
    { name: "Clothes", color: "#ec4899" },
    { name: "Tech", color: "#4f46e5" },
    { name: "Fun", color: "#f59e0b" },
  ],
};

function seedBudgetCategories(db: Database.Database): void {
  for (const [kind, categories] of Object.entries(SEED_CATEGORIES) as Array<
    ["expense" | "other", Array<{ name: string; color: string }>]
  >) {
    const count = db
      .prepare(`SELECT COUNT(*) AS n FROM budget_categories WHERE kind = ?`)
      .get(kind) as { n: number };
    if (count.n > 0) continue;

    const now = new Date().toISOString();
    const insert = db.prepare(
      `INSERT INTO budget_categories (id, kind, name, color, sort_order, archived, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)`
    );
    categories.forEach((c, i) => insert.run(crypto.randomUUID(), kind, c.name, c.color, i, now));
  }
}

const globalStore = globalThis as unknown as { __numinaDb?: Database.Database };

export function getDb(): Database.Database {
  if (!globalStore.__numinaDb) {
    globalStore.__numinaDb = createDatabase();
  }
  return globalStore.__numinaDb;
}

/** All values are stored in cents to avoid floating-point money. */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function toDollars(cents: number): number {
  return cents / 100;
}

export function newId(): string {
  return crypto.randomUUID();
}
