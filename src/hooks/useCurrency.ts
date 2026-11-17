"use client";

import { useSyncExternalStore } from "react";

const KEY = "numina.currency";

/**
 * Display currency. Purely cosmetic — amounts are always stored and computed
 * as integer cents; this only swaps the symbol shown at the UI edge. Stored in
 * localStorage (device-local, like every other preference) and implemented as
 * an external store to avoid hydration mismatches and cascading renders.
 */

export type Currency = { code: string; symbol: string; name: string };

export const CURRENCIES: Currency[] = [
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "CHF", symbol: "CHF", name: "Swiss Franc" },
  { code: "CAD", symbol: "CA$", name: "Canadian Dollar" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar" },
  { code: "NZD", symbol: "NZ$", name: "New Zealand Dollar" },
  { code: "JPY", symbol: "JP¥", name: "Japanese Yen" },
  { code: "CNY", symbol: "CN¥", name: "Chinese Yuan" },
  { code: "INR", symbol: "₹", name: "Indian Rupee" },
  { code: "SEK", symbol: "kr", name: "Swedish Krona" },
  { code: "NOK", symbol: "kr", name: "Norwegian Krone" },
  { code: "BRL", symbol: "R$", name: "Brazilian Real" },
];

export const DEFAULT_CURRENCY = "USD";

const listeners = new Set<() => void>();
let current: string | null = null; // null = not read yet

function isKnown(code: unknown): code is string {
  return typeof code === "string" && CURRENCIES.some((c) => c.code === code);
}

function getSnapshot(): string {
  if (current === null) {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(KEY);
    } catch {
      // Storage can be unavailable (privacy mode); fall through to the default.
    }
    current = isKnown(stored) ? stored : DEFAULT_CURRENCY;
  }
  return current;
}

function getServerSnapshot(): string {
  return DEFAULT_CURRENCY;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

export function setCurrency(code: string): void {
  current = isKnown(code) ? code : DEFAULT_CURRENCY;
  try {
    window.localStorage.setItem(KEY, current);
  } catch {
    // Storage can be unavailable (privacy mode); state is kept in memory only.
  }
  listeners.forEach((notify) => notify());
}

export function useCurrency() {
  const currency = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const symbol = (CURRENCIES.find((c) => c.code === currency) ?? CURRENCIES[0]).symbol;
  return { currency, symbol, setCurrency };
}
