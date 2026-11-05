"use client";

import { useSyncExternalStore } from "react";

const KEY = "numina.balances-hidden";

/**
 * Privacy toggle: hides all monetary values (chart, tables, ledger) with a
 * single click. Stored in localStorage so nothing sensitive persists remotely.
 * Implemented as an external store to avoid hydration mismatches and
 * cascading setState-in-effect renders.
 */

const listeners = new Set<() => void>();
let current: boolean | null = null; // null = not read yet

function getSnapshot(): boolean {
  if (current === null) {
    current = window.localStorage.getItem(KEY) === "1";
  }
  return current;
}

function getServerSnapshot(): boolean {
  return false;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

export function setBalancesHidden(value: boolean): void {
  current = value;
  try {
    window.localStorage.setItem(KEY, value ? "1" : "0");
  } catch {
    // Storage can be unavailable (privacy mode); state is kept in memory only.
  }
  listeners.forEach((notify) => notify());
}

export function useBalancesHidden() {
  const hidden = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { hidden, toggle: () => setBalancesHidden(!hidden) };
}
