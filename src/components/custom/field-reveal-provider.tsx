"use client";

import { createContext, useContext, useRef, useCallback } from "react";

// Registry of rich-text (BadhiyaBox) fields keyed by their form path. Each field
// registers a function that selects + scrolls to the Nth match of a query inside
// its editor. The FindReplaceBar calls reveal() to highlight the current match.

type RevealFn = (query: string, caseSensitive: boolean, occurrence: number) => void;

interface FieldRevealCtx {
  register: (path: string, fn: RevealFn) => void;
  unregister: (path: string) => void;
  reveal: (path: string, query: string, caseSensitive: boolean, occurrence: number) => boolean;
}

const FieldRevealContext = createContext<FieldRevealCtx | null>(null);

export function FieldRevealProvider({ children }: { children: React.ReactNode }) {
  const map = useRef<Map<string, RevealFn>>(new Map());

  const register = useCallback((path: string, fn: RevealFn) => { map.current.set(path, fn); }, []);
  const unregister = useCallback((path: string) => { map.current.delete(path); }, []);
  const reveal = useCallback((path: string, query: string, caseSensitive: boolean, occurrence: number) => {
    const fn = map.current.get(path);
    if (!fn) return false;
    fn(query, caseSensitive, occurrence);
    return true;
  }, []);

  return (
    <FieldRevealContext.Provider value={{ register, unregister, reveal }}>
      {children}
    </FieldRevealContext.Provider>
  );
}

export const useFieldReveal = () => useContext(FieldRevealContext);
