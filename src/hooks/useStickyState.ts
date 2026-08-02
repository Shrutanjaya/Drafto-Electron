"use client";

import { useCallback, useState } from "react";

// A drop-in replacement for useState whose value survives component
// unmount/remount within the app session. The main workspace tabs (Radix Tabs)
// unmount inactive tab content, which reset transient UI state — the chosen
// Splitter/Nav view, the open nav section — every time the user switched tabs
// and came back. Backing the state with a module-level store keeps it stable
// across those remounts without persisting to disk (it resets on app reload).
const store = new Map<string, unknown>();

export function useStickyState<T>(key: string, initial: T): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => (store.has(key) ? (store.get(key) as T) : initial));
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        store.set(key, resolved);
        return resolved;
      });
    },
    [key],
  );
  return [value, set];
}
