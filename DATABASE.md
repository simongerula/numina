# Numina - Database Design

Local SQLite database (file `data/numina.db`, gitignored). **The whole ledger
is that one file** — back it up by copying it, start over by deleting it.

```
accounts ────< movements            (the ledger: balances over time)
budget_categories ────< budget_entries   (the expenses page)
```

These are **two separate data domains**. The only bridge is *savings*, which
is derived live from deposit movements — withdrawals and adjustments never
appear on the expenses page.

---

## Conventions

- **Money**: integer cents everywhere (`amount_cents`). Converted to dollars
  only at the UI edge. No floats, no string amounts.
- **Signs applied at write time**: `deposit` → positive, `withdraw` → negative,
  `adjustment` → as given (may be negative). Readers simply `SUM(amount_cents)`.
- **Editing preserves this rule**: changing a movement's `type` without
  supplying a new amount re-derives the sign from the stored magnitude
  (a deposit edited into a withdrawal actually flips).
- **IDs**: `crypto.randomUUID()` text PKs.
- **Dates**: ISO `YYYY-MM-DD` strings (validated by Zod).
- **Timestamps**: ISO 8601 strings (SQLite `TEXT`).
- **Soft deletes**: accounts and categories are *archived* (never hard-deleted)
  so history stays intact. Budget entries and movements delete individually.

---

## Schema (applied at first run - `src/lib/db/index.ts`)

```sql
CREATE TABLE IF NOT EXISTS accounts (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL,             -- hex, for charts
  sort_order  INTEGER NOT NULL DEFAULT 0,
  archived    INTEGER NOT NULL DEFAULT 0, -- soft delete
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS movements (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date          TEXT NOT NULL,            -- YYYY-MM-DD
  type          TEXT NOT NULL CHECK (type IN ('deposit', 'withdraw', 'adjustment')),
  amount_cents  INTEGER NOT NULL,          -- signed per convention above
  note          TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_movements_account ON movements(account_id);
CREATE INDEX IF NOT EXISTS idx_movements_date ON movements(date);
```

Expenses (same first-run migration, so existing databases pick the tables up
on next start):

```sql
CREATE TABLE IF NOT EXISTS budget_categories (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('expense', 'other')),
  name        TEXT NOT NULL,
  color       TEXT NOT NULL,             -- hex, for charts
  sort_order  INTEGER NOT NULL DEFAULT 0,
  archived    INTEGER NOT NULL DEFAULT 0, -- soft delete; entries keep history
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS budget_entries (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('income', 'expense', 'other')),
  category_id   TEXT REFERENCES budget_categories(id), -- NULL for income
  date          TEXT NOT NULL,           -- YYYY-MM-DD
  amount_cents  INTEGER NOT NULL,        -- always positive; sign implied by kind
  note          TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_budget_entries_date ON budget_entries(date);
CREATE INDEX IF NOT EXISTS idx_budget_entries_category ON budget_entries(category_id);
```

On first run, empty `budget_categories` kinds are seeded with sensible
defaults — expenses: Rent, Power, Gas, Water, Internet, Groceries; other:
Coffee, Clothes, Tech, Fun. Seeding only fills an *empty* kind; user-created
categories are never overwritten.

Pragmas:

```sql
PRAGMA journal_mode = WAL;   -- concurrent reads with single writer
PRAGMA foreign_keys = ON;
```

---

## How the schema evolves (read before changing any table)

There is **no migration system yet**. The DDL is `CREATE TABLE IF NOT
EXISTS`, applied on every startup — it can create *new* tables, but it will
never alter existing ones. Practical consequences:

- Adding a **new table**: safe; existing databases pick it up on next start.
- Adding a **column to an existing table**: needs a migration step (e.g.
  `ALTER TABLE ... ADD COLUMN` guarded by a version marker). Open an issue /
  design it with the maintainer first.
- The DDL is exported as `SCHEMA_SQL` from `src/lib/db/index.ts` and reused
  by the test suite, so the tested schema and the real schema can't drift.

---

## Testing

`pnpm test` runs Vitest. The query-layer tests (`src/lib/db/queries.test.ts`)
build an **in-memory** SQLite database from `SCHEMA_SQL` and mock `getDb()`,
so they exercise the exact same SQL as production **without ever touching
`data/numina.db`**. Never point tests at the real file — it is user
financial data. CI runs lint, typecheck, and tests on every PR
(`.github/workflows/ci.yml`).

---

## Derived values

| Metric | Formula |
|--------|---------|
| Account balance | `SUM(amount_cents)` for the account (SQL join at read time) |
| Monthly profit (delta) | `SUM(amount_cents)` filtered to the same `YYYY-MM` prefix |
| Balance over time | End-of-month cumulative balance per account + Total series (`lib/series.ts`) |
| Expenses-page savings | `SUM(amount_cents)` of **deposit** movements per month (only ledger → expenses link) |
| Spent / income | `SUM(amount_cents)` of `budget_entries` per month, kind `expense`+`other` / kind `income` (`lib/expenses.ts`) |
| Spending breakdown | `budget_entries` grouped by `category_id` for the selected month (`lib/expenses.ts`) |

All derived charts/tables compute from movement/budget-entry rows; there are no
persistent views to keep in sync.

---

## Safety properties

- Every statement is **prepared** with bound parameters - no interpolated SQL.
- Foreign keys are enforced. In the UI accounts are hidden, never hard-deleted,
  so movements always stay intact; budget categories archive the same way and
  budget entries hard-delete individually.
- The only writers are the `/api/*` route handlers behind the localhost guard
  and Zod validation. Direct page reads (server components) go through
  `queries.ts` too — no component builds its own SQL.
