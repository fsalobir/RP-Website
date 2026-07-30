"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";

type WorldActionLockValue = {
  busy: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
};

const WorldActionLockContext = createContext<WorldActionLockValue | null>(null);

export function WorldActionLock({ children }: { children: ReactNode }) {
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      await action();
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  return (
    <WorldActionLockContext.Provider value={{ busy, run }}>
      {children}
    </WorldActionLockContext.Provider>
  );
}

export function useWorldActionLock() {
  const context = useContext(WorldActionLockContext);
  if (!context) throw new Error("Les actions mondiales doivent partager WorldActionLock.");
  return context;
}
