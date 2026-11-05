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
