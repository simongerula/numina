/** Money formatting. All values arrive in integer cents. */

export function formatMoney(cents: number, hidden = false): string {
  if (hidden) return "••••";
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatSignedMoney(cents: number, hidden = false): string {
  if (hidden) return "••••";
  return `${cents >= 0 ? "+" : "-"}$${(Math.abs(cents) / 100).toLocaleString(undefined, {
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

/** Typed dollars → integer cents, or null when not a usable money value (>2dp, 0, NaN). */
export function centsFromInput(raw: string): number | null {
  const n = Number(raw.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n === 0) return null;
  const cents = Math.round(n * 100);
  return Math.abs(n * 100 - cents) > 1e-6 ? null : cents; // reject > 2dp
}
