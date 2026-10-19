'use client';

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';

export type DraftSnapshot = { base: { day: string; hint: string; revision: number }; draft: string };
function createWorkspace() {
  const drafts = new Map<string, DraftSnapshot>();
  let uncertain: readonly string[] = [];
  const listeners = new Set<() => void>();
  return {
    drafts,
    snapshot: () => uncertain,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    markUncertain(id: string) {
      if (uncertain.includes(id)) return;
      uncertain = [...uncertain, id]; listeners.forEach(listener => listener());
    },
    resolve(id: string) {
      uncertain = uncertain.filter(value => value !== id); listeners.forEach(listener => listener());
    },
  };
}
type Workspace = ReturnType<typeof createWorkspace>;
const Context = createContext<((token: string) => Workspace) | null>(null);
const EMPTY: readonly string[] = [];

// Root-layout lifetime only: never persist capabilities, notes or drafts to storage.
export function DraftProvider({ children }: { children: ReactNode }) {
  const [workspaces] = useState(() => new Map<string, Workspace>());
  const [getWorkspace] = useState(() => {
    return (token: string) => {
      let workspace = workspaces.get(token);
      if (!workspace) { workspace = createWorkspace(); workspaces.set(token, workspace); }
      return workspace;
    };
  });
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (![...workspaces.values()].some(workspace => [...workspace.drafts.values()].some(value => value.draft !== value.base.hint))) return;
      event.preventDefault(); event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [workspaces]);
  return <Context.Provider value={getWorkspace}>{children}</Context.Provider>;
}

export function useDraftWorkspace(token: string) {
  const getWorkspace = useContext(Context);
  if (!getWorkspace) throw new Error('DraftProvider required');
  const workspace = getWorkspace(token);
  const uncertain = useSyncExternalStore(workspace.subscribe, workspace.snapshot, () => EMPTY);
  return { workspace, uncertain };
}