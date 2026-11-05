# Numina — Database Design

Local SQLite database (file `data/numina.db`, gitignored).

```
accounts ────< movements
```

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

## Schema (applied at first run — `src/lib/db/index.ts`)

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

All derived charts/tables compute from movement rows; there are no persistent
views to keep in sync.

---

## Safety properties

- Every statement is **prepared** with bound parameters — no interpolated SQL.
- Foreign keys are enforced (deleting an account cascades its movements; in the
  UI accounts are archived, never hard-deleted).
- The only writers are the `/api/*` route handlers behind the localhost guard
  and Zod validation.
