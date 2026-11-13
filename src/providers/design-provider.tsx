'use client';

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import '@/app/appearance.css';
import '@/app/usability.css';

export type AppearanceTheme = 'light' | 'dark';
export type AppearanceDensity = 'compact' | 'comfortable';
type Preferences = { theme: AppearanceTheme; density: AppearanceDensity };
type AppearanceContextValue = Preferences & {
  setTheme: (theme: AppearanceTheme) => void;
  setDensity: (density: AppearanceDensity) => void;
};

// This key contains appearance only: never route identifiers or application data.
const STORAGE_KEY = 'scrum-participants-appearance';
const defaults: Preferences = { theme: 'light', density: 'compact' };
let preferences = defaults;
let restored = false;
const listeners = new Set<() => void>();
const AppearanceContext = createContext<AppearanceContextValue | null>(null);

function parsePreferences(value: string | null): Preferences {
  try {
    const parsed: unknown = value ? JSON.parse(value) : null;
    if (!parsed || typeof parsed !== 'object') return defaults;
    const candidate = parsed as Record<string, unknown>;
    return {
      theme: candidate.theme === 'dark' ? 'dark' : 'light',
      density: candidate.density === 'comfortable' ? 'comfortable' : 'compact',
    };
  } catch { return defaults; }
}

function publish(next: Preferences) {
  if (next.theme === preferences.theme && next.density === preferences.density) return;
  preferences = next;
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!restored) {
    restored = true;
    try { publish(parsePreferences(window.localStorage.getItem(STORAGE_KEY))); } catch { /* Storage may be denied. Keep in-memory preferences. */ }
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) publish(parsePreferences(event.newValue));
  };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(listener); window.removeEventListener('storage', onStorage); };
}

function changePreferences(change: Partial<Preferences>) {
  const next = { ...preferences, ...change };
  publish(next);
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* Preferences still work for this page session. */ }
}

const getSnapshot = () => preferences;
const getServerSnapshot = () => defaults;
const setTheme = (theme: AppearanceTheme) => changePreferences({ theme });
const setDensity = (density: AppearanceDensity) => changePreferences({ density });

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error('L’apparence nécessite DesignProvider.');
  return context;
}

export function DesignProvider({ children }: { children: ReactNode }) {
  const appearance = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const value = useMemo(() => ({ ...appearance, setTheme, setDensity }), [appearance]);

  useEffect(() => {
    document.documentElement.dataset.theme = appearance.theme;
    document.documentElement.dataset.density = appearance.density;
  }, [appearance]);

  return <AppearanceContext.Provider value={value}><TooltipProvider delayDuration={350}>{children}</TooltipProvider></AppearanceContext.Provider>;
}