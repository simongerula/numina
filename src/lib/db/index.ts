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
  `);

  return db;
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
