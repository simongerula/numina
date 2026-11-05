import { getDb } from "@/lib/db";
import type { Account, Movement } from "@/lib/types";
import type { AccountCreate, AccountUpdate, MovementCreate, MovementUpdate } from "@/lib/schemas";
import { InputError } from "@/lib/server/guard";

/**
 * Data-access layer. Everything SQL lives here; UI components and route
 * handlers only ever call these typed functions.
 */

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export function listAccounts(): Account[] {
  const rows = getDb()
    .prepare(
      `SELECT a.id, a.name, a.color, a.sort_order,
              COALESCE(SUM(m.amount_cents), 0) AS balance
       FROM accounts a
       LEFT JOIN movements m ON m.account_id = a.id
       WHERE a.archived = 0
       GROUP BY a.id
       ORDER BY a.sort_order, a.name`
    )
    .all() as Array<{ id: string; name: string; color: string; sort_order: number; balance: number }>;

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
  const current = db.prepare(`SELECT * FROM accounts WHERE id = ? AND archived = 0`).get(id);
  if (!current) throw new InputError("Account not found");

  db.prepare(
    `UPDATE accounts SET name = ?, color = ?, sort_order = ? WHERE id = ?`
  ).run(
    data.name?.trim() ?? (current as { name: string }).name,
    data.color ?? (current as { color: string }).color,
    data.sort_order ?? (current as { sort_order: number }).sort_order,
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

