"use client";

import { useSyncExternalStore } from "react";

const KEY = "numina.goals-visible";

/**
 * Display preference: show or hide the savings goals card on the dashboard.
 * Stored in localStorage (device-local, like every other preference) and
 * implemented as an external store to avoid hydration mismatches and cascading
 * renders. Defaults to visible when nothing has been stored.
 */

const listeners = new Set<() => void>();
let current: boolean | null = null; // null = not read yet

function getSnapshot(): boolean {
  if (current === null) {
    const stored = window.localStorage.getItem(KEY);
    current = stored === null ? true : stored === "1";
  }
  return current;
}

function getServerSnapshot(): boolean {
  return true;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

export function setGoalsVisible(value: boolean): void {
  current = value;
  try {
    window.localStorage.setItem(KEY, value ? "1" : "0");
  } catch {
    // Storage can be unavailable (privacy mode); state is kept in memory only.
  }
  listeners.forEach((notify) => notify());
}

export function useGoalsVisible() {
  const visible = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { visible, setVisible: setGoalsVisible, toggle: () => setGoalsVisible(!visible) };
}
