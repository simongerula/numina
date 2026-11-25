/** Money formatting. All values arrive in integer cents.
 *  `symbol` comes from the currency setting (see `hooks/useCurrency.ts`);
 *  amounts are always stored and computed as cents — only the display changes. */

export function formatMoney(cents: number, hidden = false, symbol = "$"): string {
  if (hidden) return "••••";
  const sign = cents < 0 ? "-" : "";
  return `${sign}${symbol}${(Math.abs(cents) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatSignedMoney(cents: number, hidden = false, symbol = "$"): string {
  if (hidden) return "••••";
  return `${cents >= 0 ? "+" : "-"}${symbol}${(Math.abs(cents) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** "2026-07" → "Jul 2026" */
export function formatPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[m - 1]} ${y}`;
}

/** "2026-11-05" → "05 Nov 2026" */
export function formatDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${String(d).padStart(2, "0")} ${names[m - 1]} ${y}`;
}

/** Typed money → integer cents, or null when not a usable money value (>2dp, NaN).
 *  Tolerates the currency symbols users may paste from the UI. Zero is rejected
 *  unless `allowZero` is set — most amounts must be positive, but an income
 *  line's own "default" amount may be 0 when the line is all sub-incomes. */
export function centsFromInput(raw: string, { allowZero = false } = {}): number | null {
  const cleaned = raw.replace(/[$€£¥₹,\s]/g, "");
  if (cleaned === "") return null; // blank, "$", or spaces is not zero
  const n = Number(cleaned);
  if (!Number.isFinite(n) || (n === 0 && !allowZero)) return null;
  const cents = Math.round(n * 100);
  return Math.abs(n * 100 - cents) > 1e-6 ? null : cents; // reject > 2dp
}
