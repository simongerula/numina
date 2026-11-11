// Shared types for the local-first app.

export interface Account {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  balance: number; // in cents, derived
}

export interface Movement {
  id: string;
  account_id: string;
  date: string; // YYYY-MM-DD
  type: "deposit" | "withdraw" | "adjustment";
  amount_cents: number; // signed for adjustment, positive otherwise
  note: string;
  account_name: string;
  account_color: string;
}

export interface AccountRow {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  archived: number;
}

export interface MovementRow {
  id: string;
  account_id: string;
  date: string;
  type: string;
  amount_cents: number;
  note: string;
}

/** One month in the balance-over-time series. Keys are account names. */
export interface BalancePoint {
  month: string; // "Jan"
  year: number;
  monthIndex: number; // 0-11
  [accountName: string]: string | number;
}

// ---------------------------------------------------------------------------
// Budgeting — a separate data domain. Only "savings" bridges it to the ledger,
// derived live from deposit movements.
// ---------------------------------------------------------------------------

export type BudgetCategoryKind = "expense" | "other";

export interface BudgetCategory {
  id: string;
  kind: BudgetCategoryKind;
  name: string;
  color: string;
  sort_order: number;
}

export type BudgetEntryKind = "income" | "expense" | "other";

export interface BudgetEntry {
  id: string;
  kind: BudgetEntryKind;
  category_id: string | null; // NULL for income (free text)
  category_name: string | null;
  category_color: string | null;
  date: string; // YYYY-MM-DD
  amount_cents: number; // positive; sign is implied by kind
  note: string;
}

export interface BudgetCategoryRow {
  id: string;
  kind: string;
  name: string;
  color: string;
  sort_order: number;
  archived: number;
}

export interface BudgetEntryRow {
  id: string;
  kind: string;
  category_id: string | null;
  date: string;
  amount_cents: number;
  note: string;
}

/** One month in the budget overview strip (all values signed cents). */
export interface BudgetMonth {
  period: string; // "YYYY-MM"
  saved: number; // deposit movements for the month
  spent: number; // expense + other budget entries for the month
  income: number; // income budget entries for the month
}
