import { getDb } from "@/lib/db";
import type { Account, AccountRow, BudgetCategory, BudgetCategoryRow, BudgetEntry, BudgetEntryRow, Movement } from "@/lib/types";
import type {
  AccountCreate,
  AccountUpdate,
  BudgetCategoryCreate,
  BudgetCategoryUpdate,
  BudgetEntryCreate,
  BudgetEntryUpdate,
  MovementCreate,
  MovementUpdate,
} from "@/lib/schemas";
import { InputError } from "@/lib/server/guard";

/**
 * Data-access layer. Everything SQL lives here; UI components and route
 * handlers only ever call these typed functions.
 */

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export function listAccounts(): Account[] {
  return accountRows(0);
}

/** Hidden (archived) accounts, same shape as `listAccounts`. Movements are kept. */
export function listArchivedAccounts(): Account[] {
  return accountRows(1);
}

function accountRows(archived: 0 | 1): Account[] {
  const rows = getDb()
    .prepare(
      `SELECT a.id, a.name, a.color, a.sort_order,
              COALESCE(SUM(m.amount_cents), 0) AS balance
       FROM accounts a
       LEFT JOIN movements m ON m.account_id = a.id
       WHERE a.archived = ?
       GROUP BY a.id
       ORDER BY a.sort_order, a.name`
    )
    .all(archived) as Array<{ id: string; name: string; color: string; sort_order: number; balance: number }>;

  return rows.map((r) => ({ ...r, balance: r.balance ?? 0 }));
}

export function createAccount(data: AccountCreate): string {
  const id = crypto.randomUUID();
  const db = getDb();
  const sortOrder =
    data.sort_order ??
    (db.prepare(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM accounts`).get() as { next: number })
      .next;

  db.prepare(
    `INSERT INTO accounts (id, name, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?)`
  ).run(id, data.name.trim(), data.color, sortOrder, new Date().toISOString());

  return id;
}

export function updateAccount(id: string, data: AccountUpdate): void {
  const db = getDb();
  // No archived filter here: hidden accounts can still be restored or renamed.
  const current = db.prepare(`SELECT * FROM accounts WHERE id = ?`).get(id) as AccountRow | undefined;
  if (!current) throw new InputError("Account not found");

  db.prepare(
    `UPDATE accounts SET name = ?, color = ?, sort_order = ?, archived = ? WHERE id = ?`
  ).run(
    data.name?.trim() ?? current.name,
    data.color ?? current.color,
    data.sort_order ?? current.sort_order,
    data.archived === undefined ? current.archived : data.archived ? 1 : 0,
    id
  );
}

export function archiveAccount(id: string): void {
  const db = getDb();
  const result = db.prepare(`UPDATE accounts SET archived = 1 WHERE id = ?`).run(id);
  if (result.changes === 0) throw new InputError("Account not found");
}

// ---------------------------------------------------------------------------
// Movements
// ---------------------------------------------------------------------------

export function listMovements(opts: { limit?: number } = {}): Movement[] {
  const limit = Math.min(opts.limit ?? 1000, 1000);
  const rows = getDb()
    .prepare(
      `SELECT m.id, m.account_id, m.date, m.type, m.amount_cents, m.note,
              a.name AS account_name, a.color AS account_color
       FROM movements m
       JOIN accounts a ON a.id = m.account_id
       ORDER BY m.date DESC, m.rowid DESC
       LIMIT ?`
    )
    .all(limit) as Array<{
    id: string;
    account_id: string;
    date: string;
    type: string;
    amount_cents: number;
    note: string;
    account_name: string;
    account_color: string;
  }>;

  return rows.map((r) => ({
    ...r,
    type: r.type as Movement["type"],
    toString: undefined,
  }));
}

export function createMovement(data: MovementCreate): string {
  const db = getDb();

  const account = db
    .prepare(`SELECT id FROM accounts WHERE id = ? AND archived = 0`)
    .get(data.account_id);
  if (!account) throw new InputError("Account not found");

  let signed: number;
  if (data.type === "deposit") signed = data.amount;
  else if (data.type === "withdraw") signed = -data.amount;
  else signed = data.amount; // adjustment: nonzero enforced by schema, signed as given

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO movements (id, account_id, date, type, amount_cents, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, data.account_id, data.date, data.type, signed, data.note ?? "", new Date().toISOString());

  return id;
}

export function updateMovement(id: string, data: MovementUpdate): void {
  const db = getDb();
  const current = db.prepare(`SELECT * FROM movements WHERE id = ?`).get(id);
  if (!current) throw new InputError("Movement not found");
  const row = current as { account_id: string; date: string; type: Movement["type"]; amount_cents: number; note: string };
  const accountId = data.account_id ?? row.account_id;
  const date = data.date ?? row.date;
  const type = data.type ?? row.type;
  const note = data.note ?? row.note;

  let amountCents: number;
  if (data.amount !== undefined) {
    if (type === "deposit") amountCents = data.amount;
    else if (type === "withdraw") amountCents = -data.amount;
    else amountCents = data.amount; // adjustment: signed as given
  } else {
    amountCents = row.amount_cents;
  }

  if (accountId !== row.account_id) {
    const account = db
      .prepare(`SELECT id FROM accounts WHERE id = ? AND archived = 0`)
      .get(accountId);
    if (!account) throw new InputError("Account not found");
  }

  db.prepare(
    `UPDATE movements SET account_id = ?, date = ?, type = ?, amount_cents = ?, note = ? WHERE id = ?`
  ).run(accountId, date, type, amountCents, note, id);
}

export function deleteMovement(id: string): void {
  const result = getDb().prepare(`DELETE FROM movements WHERE id = ?`).run(id);
  if (result.changes === 0) throw new InputError("Movement not found");
}

/**
 * Savings for budgeting: total deposit cents per month ("YYYY-MM"), across
 * ALL history (not capped like listMovements). Withdrawals and adjustments
 * never appear in budgeting.
 */
export function listDepositTotalsByMonth(): Array<{ period: string; cents: number }> {
  return getDb()
    .prepare(
      `SELECT strftime('%Y-%m', date) AS period, SUM(amount_cents) AS cents
       FROM movements
       WHERE type = 'deposit'
       GROUP BY period
       ORDER BY period DESC`
    )
    .all() as Array<{ period: string; cents: number }>;
}

// ---------------------------------------------------------------------------
// Budget categories
// ---------------------------------------------------------------------------

export function listBudgetCategories(kind: "expense" | "other"): BudgetCategory[] {
  const rows = getDb()
    .prepare(
      `SELECT id, kind, name, color, sort_order
       FROM budget_categories
       WHERE kind = ? AND archived = 0
       ORDER BY sort_order, name`
    )
    .all(kind) as Array<{ id: string; kind: string; name: string; color: string; sort_order: number }>;

  return rows.map((r) => ({ ...r, kind: r.kind as BudgetCategory["kind"] }));
}

/** All categories including archived ones (name only), for history display. */
export function listArchivedBudgetCategories(kind: "expense" | "other"): BudgetCategory[] {
  const rows = getDb()
    .prepare(
      `SELECT id, kind, name, color, sort_order
       FROM budget_categories
       WHERE kind = ? AND archived = 1
       ORDER BY sort_order, name`
    )
    .all(kind) as Array<{ id: string; kind: string; name: string; color: string; sort_order: number }>;

  return rows.map((r) => ({ ...r, kind: r.kind as BudgetCategory["kind"] }));
}

export function createBudgetCategory(data: BudgetCategoryCreate): string {
  const db = getDb();
  const sortOrder =
    data.sort_order ??
    (
      db
        .prepare(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM budget_categories WHERE kind = ?`)
        .get(data.kind) as { next: number }
    ).next;

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO budget_categories (id, kind, name, color, sort_order, archived, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`
  ).run(id, data.kind, data.name.trim(), data.color, sortOrder, new Date().toISOString());

  return id;
}

export function updateBudgetCategory(id: string, data: BudgetCategoryUpdate): void {
  const db = getDb();
  const current = db.prepare(`SELECT * FROM budget_categories WHERE id = ?`).get(id) as
    | BudgetCategoryRow
    | undefined;
  if (!current) throw new InputError("Category not found");

  db.prepare(
    `UPDATE budget_categories SET name = ?, color = ?, sort_order = ?, archived = ? WHERE id = ?`
  ).run(
    data.name?.trim() ?? current.name,
    data.color ?? current.color,
    data.sort_order ?? current.sort_order,
    data.archived === undefined ? current.archived : data.archived ? 1 : 0,
    id
  );
}

export function archiveBudgetCategory(id: string): void {
  const db = getDb();
  const result = db.prepare(`UPDATE budget_categories SET archived = 1 WHERE id = ?`).run(id);
  if (result.changes === 0) throw new InputError("Category not found");
}

// ---------------------------------------------------------------------------
// Budget entries
// ---------------------------------------------------------------------------

export function listBudgetEntries(opts: { limit?: number } = {}): BudgetEntry[] {
  const limit = Math.min(opts.limit ?? 1000, 1000);
  const rows = getDb()
    .prepare(
      `SELECT e.id, e.kind, e.category_id, e.date, e.amount_cents, e.note,
              c.name AS category_name, c.color AS category_color
       FROM budget_entries e
       LEFT JOIN budget_categories c ON c.id = e.category_id
       ORDER BY e.date DESC, e.rowid DESC
       LIMIT ?`
    )
    .all(limit) as Array<{
    id: string;
    kind: string;
    category_id: string | null;
    date: string;
    amount_cents: number;
    note: string;
    category_name: string | null;
    category_color: string | null;
  }>;

  return rows.map((r) => ({ ...r, kind: r.kind as BudgetEntry["kind"] }));
}

export function createBudgetEntry(data: BudgetEntryCreate): string {
  const db = getDb();
  const categoryId = validateEntryCategory(db, data.kind, data.category_id ?? null);

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO budget_entries (id, kind, category_id, date, amount_cents, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, data.kind, categoryId, data.date, data.amount, data.note ?? "", new Date().toISOString());

  return id;
}

export function updateBudgetEntry(id: string, data: BudgetEntryUpdate): void {
  const db = getDb();
  const current = db.prepare(`SELECT * FROM budget_entries WHERE id = ?`).get(id) as
    | BudgetEntryRow
    | undefined;
  if (!current) throw new InputError("Entry not found");

  const kind = data.kind ?? (current.kind as BudgetEntry["kind"]);
  const categoryId = validateEntryCategory(db, kind, data.category_id === undefined ? current.category_id : data.category_id ?? null);

  db.prepare(
    `UPDATE budget_entries SET kind = ?, category_id = ?, date = ?, amount_cents = ?, note = ? WHERE id = ?`
  ).run(
    kind,
    categoryId,
    data.date ?? current.date,
    data.amount ?? current.amount_cents,
    data.note ?? current.note,
    id
  );
}

export function deleteBudgetEntry(id: string): void {
  const result = getDb().prepare(`DELETE FROM budget_entries WHERE id = ?`).run(id);
  if (result.changes === 0) throw new InputError("Entry not found");
}

/** Income takes no category; expense/other must reference an active one of the same kind. */
function validateEntryCategory(
  db: ReturnType<typeof getDb>,
  kind: BudgetEntry["kind"],
  categoryId: string | null
): string | null {
  if (kind === "income") {
    if (categoryId) throw new InputError("Income entries have no category");
    return null;
  }
  if (!categoryId) throw new InputError("Category is required");
  const category = db
    .prepare(`SELECT id FROM budget_categories WHERE id = ? AND kind = ? AND archived = 0`)
    .get(categoryId, kind);
  if (!category) throw new InputError("Category not found");
  return categoryId;
}

