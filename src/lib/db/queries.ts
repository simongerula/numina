import { getDb } from "@/lib/db";
import type {
  Account,
  AccountRow,
  BudgetCategory,
  BudgetCategoryRow,
  BudgetEntry,
  BudgetEntryItem,
  BudgetEntryItemRow,
  BudgetEntryRow,
  Movement,
  SavingsGoal,
  SavingsGoalRow,
} from "@/lib/types";
import type {
  AccountCreate,
  AccountUpdate,
  BudgetCategoryCreate,
  BudgetCategoryUpdate,
  BudgetEntryCreate,
  BudgetEntryItemCreate,
  BudgetEntryItemUpdate,
  BudgetEntryUpdate,
  MovementCreate,
  MovementUpdate,
  SavingsGoalCreate,
  SavingsGoalUpdate,
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
  } else if (type !== row.type) {
    // Type changed without a new amount — re-derive the sign from the stored
    // magnitude so a deposit edited into a withdrawal actually flips.
    const magnitude = Math.abs(row.amount_cents);
    if (type === "deposit") amountCents = magnitude;
    else if (type === "withdraw") amountCents = -magnitude;
    else amountCents = row.amount_cents; // adjustment keeps the signed value
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

/**
 * Same deposits as listDepositTotalsByMonth, but split per ledger account so
 * the budgeting view can show which account the savings went into (aggregate
 * client-side for all time or a single month). Deposits into archived
 * accounts still count — the money was saved there.
 */
export function listDepositTotalsByMonthByAccount(): Array<{
  period: string;
  account_id: string;
  account_name: string;
  account_color: string;
  cents: number;
}> {
  return getDb()
    .prepare(
      `SELECT strftime('%Y-%m', m.date) AS period, m.account_id,
              a.name AS account_name, a.color AS account_color,
              SUM(m.amount_cents) AS cents
       FROM movements m
       JOIN accounts a ON a.id = m.account_id
       WHERE m.type = 'deposit'
       GROUP BY period, m.account_id
       ORDER BY period DESC`
    )
    .all() as Array<{
    period: string;
    account_id: string;
    account_name: string;
    account_color: string;
    cents: number;
  }>;
}

/**
 * Money-in cents per month ("YYYY-MM") per account, across ALL history:
 * deposits plus positive adjustments. Withdrawals and negative adjustments are
 * ignored. Savings-goal pace uses this (not the deposit-only totals above) so
 * accounts funded mainly by adjustments still count, without money leaving the
 * accounts dragging the estimate down.
 */
export function listMonthlyInflowByAccount(): Array<{
  period: string;
  account_id: string;
  cents: number;
}> {
  return getDb()
    .prepare(
      `SELECT strftime('%Y-%m', m.date) AS period, m.account_id,
              SUM(CASE WHEN m.amount_cents > 0 THEN m.amount_cents ELSE 0 END) AS cents
       FROM movements m
       GROUP BY period, m.account_id
       ORDER BY period DESC`
    )
    .all() as Array<{ period: string; account_id: string; cents: number }>;
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
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT e.id, e.kind, e.category_id, e.date, e.amount_cents, e.note,
              c.name AS category_name, c.color AS category_color
       FROM budget_entries e
       LEFT JOIN budget_categories c ON c.id = e.category_id
       ORDER BY COALESCE(
                  (SELECT MAX(i.date) FROM budget_entry_items i WHERE i.entry_id = e.id),
                  e.date
                ) DESC,
                e.rowid DESC
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

  if (rows.length === 0) return [];

  // Attach each entry's sub-incomes in one query (the LIMIT above counts
  // entries, not the joined item rows). Placeholders are literal "?" marks,
  // never interpolated values.
  const placeholders = rows.map(() => "?").join(", ");
  const itemRows = db
    .prepare(
      `SELECT id, entry_id, date, note, amount_cents
       FROM budget_entry_items
       WHERE entry_id IN (${placeholders})
       ORDER BY date, rowid`
    )
    .all(...rows.map((r) => r.id)) as BudgetEntryItemRow[];

  const itemsByEntry = new Map<string, BudgetEntryItem[]>();
  for (const item of itemRows) {
    const list = itemsByEntry.get(item.entry_id);
    if (list) list.push(item);
    else itemsByEntry.set(item.entry_id, [item]);
  }

  return rows.map((r) => ({
    ...r,
    kind: r.kind as BudgetEntry["kind"],
    items: itemsByEntry.get(r.id) ?? [],
  }));
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
  // An income line may carry sub-incomes; changing it into an expense/other
  // entry would orphan them, so require the item list to be emptied first.
  if (kind !== "income" && current.kind === "income") {
    const items = db
      .prepare(`SELECT COUNT(*) AS n FROM budget_entry_items WHERE entry_id = ?`)
      .get(id) as { n: number };
    if (items.n > 0) throw new InputError("Remove sub-incomes before changing this entry's type");
  }
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

// ---------------------------------------------------------------------------
// Sub-incomes (budget entry items)
// ---------------------------------------------------------------------------

function assertIncomeEntry(db: ReturnType<typeof getDb>, entryId: string): void {
  const entry = db.prepare(`SELECT kind FROM budget_entries WHERE id = ?`).get(entryId) as
    | { kind: string }
    | undefined;
  if (!entry) throw new InputError("Entry not found");
  if (entry.kind !== "income") throw new InputError("Sub-incomes are only for income entries");
}

export function createBudgetEntryItem(entryId: string, data: BudgetEntryItemCreate): string {
  const db = getDb();
  assertIncomeEntry(db, entryId);

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO budget_entry_items (id, entry_id, date, note, amount_cents, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, entryId, data.date, data.note ?? "", data.amount, new Date().toISOString());

  return id;
}

export function updateBudgetEntryItem(
  entryId: string,
  itemId: string,
  data: BudgetEntryItemUpdate
): void {
  const db = getDb();
  const current = db
    .prepare(`SELECT * FROM budget_entry_items WHERE id = ? AND entry_id = ?`)
    .get(itemId, entryId) as BudgetEntryItemRow | undefined;
  if (!current) throw new InputError("Sub-income not found");

  db.prepare(
    `UPDATE budget_entry_items SET date = ?, note = ?, amount_cents = ? WHERE id = ?`
  ).run(
    data.date ?? current.date,
    data.note ?? current.note,
    data.amount ?? current.amount_cents,
    itemId
  );
}

export function deleteBudgetEntryItem(entryId: string, itemId: string): void {
  const result = getDb()
    .prepare(`DELETE FROM budget_entry_items WHERE id = ? AND entry_id = ?`)
    .run(itemId, entryId);
  if (result.changes === 0) throw new InputError("Sub-income not found");
}

// ---------------------------------------------------------------------------
// Savings goals
// ---------------------------------------------------------------------------

/** Active goals with their account allocations and each account's balance. */
export function listSavingsGoals(): SavingsGoal[] {
  return savingsGoalRows(0);
}

/** Completed/archived goals, same shape as `listSavingsGoals`. */
export function listCompletedSavingsGoals(): SavingsGoal[] {
  return savingsGoalRows(1);
}

function savingsGoalRows(completed: 0 | 1): SavingsGoal[] {
  const rows = getDb()
    .prepare(
      `SELECT g.id, g.name, g.target_cents, g.color, g.sort_order,
              g.completed, g.completed_at, g.created_at,
              ga.account_id, ga.weight,
              a.name AS account_name, a.color AS account_color,
              a.archived AS account_archived,
              COALESCE(
                (SELECT SUM(m.amount_cents) FROM movements m WHERE m.account_id = a.id), 0
              ) AS balance_cents
       FROM savings_goals g
       LEFT JOIN savings_goal_accounts ga ON ga.goal_id = g.id
       LEFT JOIN accounts a ON a.id = ga.account_id
       WHERE g.completed = ?
       ORDER BY g.sort_order, g.created_at`
    )
    .all(completed) as Array<{
    id: string;
    name: string;
    target_cents: number;
    color: string;
    sort_order: number;
    completed: number;
    completed_at: string | null;
    created_at: string;
    account_id: string | null;
    weight: number | null;
    account_name: string | null;
    account_color: string | null;
    account_archived: number | null;
    balance_cents: number | null;
  }>;

  // One row per allocation (LEFT JOIN), collapsed into goals in insertion order.
  const byId = new Map<string, SavingsGoal>();
  for (const r of rows) {
    let goal = byId.get(r.id);
    if (!goal) {
      goal = {
        id: r.id,
        name: r.name,
        target_cents: r.target_cents,
        color: r.color,
        sort_order: r.sort_order,
        completed: r.completed,
        completed_at: r.completed_at,
        created_at: r.created_at,
        allocations: [],
      };
      byId.set(r.id, goal);
    }
    if (r.account_id && r.account_name) {
      goal.allocations.push({
        account_id: r.account_id,
        account_name: r.account_name,
        account_color: r.account_color ?? "#94a3b8",
        account_archived: r.account_archived ?? 0,
        weight: r.weight ?? 100,
        balance_cents: r.balance_cents ?? 0,
      });
    }
  }
  return Array.from(byId.values());
}

export function createSavingsGoal(data: SavingsGoalCreate): string {
  const db = getDb();
  const sortOrder =
    data.sort_order ??
    (
      db.prepare(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM savings_goals`).get() as {
        next: number;
      }
    ).next;

  const id = crypto.randomUUID();
  const run = db.transaction(() => {
    db.prepare(
      `INSERT INTO savings_goals (id, name, target_cents, color, sort_order, completed, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)`
    ).run(id, data.name.trim(), data.target, data.color, sortOrder, new Date().toISOString());

    const insertAllocation = db.prepare(
      `INSERT INTO savings_goal_accounts (goal_id, account_id, weight) VALUES (?, ?, ?)`
    );
    for (const allocation of data.allocations) {
      assertActiveAccount(db, allocation.account_id);
      insertAllocation.run(id, allocation.account_id, allocation.weight);
    }
  });
  run();

  return id;
}

export function updateSavingsGoal(id: string, data: SavingsGoalUpdate): void {
  const db = getDb();
  const current = db.prepare(`SELECT * FROM savings_goals WHERE id = ?`).get(id) as
    | SavingsGoalRow
    | undefined;
  if (!current) throw new InputError("Goal not found");

  const target = data.target ?? current.target_cents;

  // Completing is only allowed once the goal is funded: mirrors the UI gate
  // (and lib/goals.ts `goalSavedCents`) so the rule holds on the write path too.
  if (data.completed === true && current.completed === 0 && savedCentsForGoal(db, id) < target) {
    throw new InputError("Goal hasn't reached its target yet");
  }

  const completed = data.completed === undefined ? current.completed : data.completed ? 1 : 0;
  // Stamp completion once; clearing it when restored (or left untouched).
  const completedAt =
    data.completed === undefined
      ? current.completed_at
      : data.completed
        ? (current.completed_at ?? new Date().toISOString())
        : null;

  db.prepare(
    `UPDATE savings_goals
     SET name = ?, target_cents = ?, color = ?, sort_order = ?, completed = ?, completed_at = ?
     WHERE id = ?`
  ).run(
    data.name?.trim() ?? current.name,
    target,
    data.color ?? current.color,
    data.sort_order ?? current.sort_order,
    completed,
    completedAt,
    id
  );
}

/** Permanent removal: goals carry no history, so their allocations cascade away. */
export function deleteSavingsGoal(id: string): void {
  const result = getDb().prepare(`DELETE FROM savings_goals WHERE id = ?`).run(id);
  if (result.changes === 0) throw new InputError("Goal not found");
}

/** Goals may only draw from active accounts; archived money is not re-goaled. */
function assertActiveAccount(db: ReturnType<typeof getDb>, accountId: string): void {
  const account = db.prepare(`SELECT id FROM accounts WHERE id = ? AND archived = 0`).get(accountId);
  if (!account) throw new InputError("Account not found");
}

/** Weighted saved cents for a goal — mirrors lib/goals.ts `goalSavedCents`. */
function savedCentsForGoal(db: ReturnType<typeof getDb>, goalId: string): number {
  const rows = db
    .prepare(
      `SELECT ga.weight,
              COALESCE(
                (SELECT SUM(m.amount_cents) FROM movements m WHERE m.account_id = ga.account_id), 0
              ) AS balance_cents
       FROM savings_goal_accounts ga
       WHERE ga.goal_id = ?`
    )
    .all(goalId) as Array<{ weight: number; balance_cents: number }>;

  return rows.reduce((sum, r) => sum + Math.round((r.balance_cents * r.weight) / 100), 0);
}

