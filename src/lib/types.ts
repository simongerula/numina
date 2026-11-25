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

/**
 * A dated sub-income hanging off an income entry: "sold shoes", "$x". The line
 * shows its own amount plus every item, and takes the latest item's date.
 */
export interface BudgetEntryItem {
  id: string;
  entry_id: string;
  date: string; // YYYY-MM-DD
  note: string; // free-text description
  amount_cents: number; // positive; income
}

export interface BudgetEntry {
  id: string;
  kind: BudgetEntryKind;
  category_id: string | null; // NULL for income (free text)
  category_name: string | null;
  category_color: string | null;
  date: string; // YYYY-MM-DD — the entry's own date; income lines display the latest item date instead
  amount_cents: number; // non-negative; income may be 0 (all sub-incomes) — the entry's own "default" amount
  note: string;
  items: BudgetEntryItem[]; // sub-incomes (empty for expense/other)
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

export interface BudgetEntryItemRow {
  id: string;
  entry_id: string;
  date: string;
  note: string;
  amount_cents: number;
}

/** One month in the budget overview strip (all values signed cents). */
export interface BudgetMonth {
  period: string; // "YYYY-MM"
  saved: number; // deposit movements for the month
  spent: number; // expense + other budget entries for the month
  income: number; // income budget entries for the month
}

// ---------------------------------------------------------------------------
// Savings goals — a target amount fed by one or more accounts, each counted at
// an independent weight (percent of that account's balance). Progress is
// derived live from account balances; nothing about it is stored.
// ---------------------------------------------------------------------------

export interface SavingsGoalAllocation {
  account_id: string;
  account_name: string;
  account_color: string;
  account_archived: number; // 0/1 — the account may since have been hidden
  weight: number; // percent of the account's balance, 1..100
  balance_cents: number; // the account's current balance
}

export interface SavingsGoal {
  id: string;
  name: string;
  target_cents: number; // positive
  color: string; // hex, for the card accent
  sort_order: number;
  completed: number; // 0 active, 1 completed/archived (soft)
  completed_at: string | null; // ISO when completed, else null
  created_at: string;
  allocations: SavingsGoalAllocation[];
}

export interface SavingsGoalRow {
  id: string;
  name: string;
  target_cents: number;
  color: string;
  sort_order: number;
  completed: number;
  completed_at: string | null;
  created_at: string;
}
