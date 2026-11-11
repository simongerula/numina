# Numina - Database Design

Local SQLite database (file `data/numina.db`, gitignored).

```
accounts ────< movements
budget_categories ────< budget_entries
```

The budgeting tables are a **separate data domain** from the ledger. The only
bridge is *savings*, which is **derived live** from deposit movements —
withdrawals and adjustments never appear in budgeting.

---

## Conventions

- **Money**: integer cents everywhere (`amount_cents`). Converted to dollars
  only at the UI edge.
- **Signs applied at write time**: `deposit` → positive, `withdraw` → negative,
  `adjustment` → as given (may be negative). Readers may simply `SUM`.
- **IDs**: `crypto.randomUUID()` text PKs.
- **Dates**: ISO `YYYY-MM-DD` strings (validated by Zod + regex).
- **Timestamps**: ISO 8601 strings (SQLite `TEXT`).

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

Budgeting (separate domain; applied by the same first-run migration, so
existing databases pick the tables up on next start):

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

## Derived values

| Metric | Formula |
|--------|---------|
| Account balance | `SUM(amount_cents)` for the account (SQL join at read time) |
| Monthly profit (delta) | `SUM(amount_cents)` filtered to the same `YYYY-MM` prefix |
| Balance over time | End-of-month cumulative balance per account + Total series (`lib/series.ts`) |
| Budget savings | `SUM(amount_cents)` of **deposit** movements per month (only ledger → budget link) |
| Budget spent / income | `SUM(amount_cents)` of `budget_entries` per month, kind `expense`+`other` / kind `income` (`lib/budget.ts`) |
| Spending breakdown | `budget_entries` grouped by `category_id` for the selected month (`lib/budget.ts`) |

All derived charts/tables compute from movement/budget-entry rows; there are no
persistent views to keep in sync.

---

## Safety properties

- Every statement is **prepared** with bound parameters - no interpolated SQL.
- Foreign keys are enforced (deleting an account cascades its movements; in the
  UI accounts are **hidden**, never hard-deleted — `DELETE` and
  `PATCH { archived: true }` archive, `PATCH { archived: false }` restores, and
  movements always stay intact).
- The only writers are the `/api/*` route handlers behind the localhost guard
  and Zod validation. Budget categories are archived, never hard-deleted, so
  entry history stays intact; budget entries hard-delete individually.
