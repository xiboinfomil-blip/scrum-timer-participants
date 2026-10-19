'use client';

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
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

// Match ScrumTimer's design tokens without a runtime dependency on its app.
function makeTheme(mode: AppearanceTheme, density: AppearanceDensity) {
  const dark = mode === 'dark';
  const comfortable = density === 'comfortable';
  const paper = dark ? '#182638' : '#ffffff';
  const border = dark ? '#3a5068' : '#e3ebf4';
  return createTheme({
  cssVariables: true,
  palette: {
    mode,
    primary: dark ? { main: '#91c7ff', dark: '#64adf5', light: '#c4e2ff', contrastText: '#102438' } : { main: '#205f9d', dark: '#164b80', light: '#eaf2fc', contrastText: '#ffffff' },
    secondary: { main: '#ec8b23', contrastText: '#193752' },
    success: { main: dark ? '#7ddbb0' : '#147d52' }, error: { main: dark ? '#ffaaa4' : '#b94b43' },
    warning: { main: dark ? '#f8c17e' : '#9b6015' }, info: { main: dark ? '#91c7ff' : '#205f9d' },
    background: { default: dark ? '#101a28' : '#f7f9fc', paper },
    text: { primary: dark ? '#e8f0fa' : '#193752', secondary: dark ? '#b5c5d8' : '#65798d' }, divider: border,
    ...(dark ? { action: { active: '#b5c5d8', hover: '#91c7ff14', selected: '#91c7ff26', disabled: '#a6b6ca80', disabledBackground: '#91c7ff12' } } : {}),
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: 13, button: { textTransform: 'none', fontWeight: 650, letterSpacing: 0 },
    h5: { fontWeight: 750, letterSpacing: '-.035em' }, h6: { fontWeight: 700, letterSpacing: '-.025em' },
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true, size: 'small', type: 'button' }, styleOverrides: {
      root: { minHeight: 44, borderRadius: 10, paddingInline: 16, fontSize: comfortable ? 15 : 14, transition: 'background-color 180ms ease, box-shadow 180ms ease' },
      contained: { '&.MuiButton-colorPrimary': { background: dark ? 'linear-gradient(125deg, #91c7ff, #b2dbff)' : 'linear-gradient(125deg, #205f9d, #3278b8)', boxShadow: 'none' } },
      outlined: { borderColor: border, backgroundColor: paper },
    } },
    MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { root: { backgroundImage: 'none' }, rounded: { borderRadius: 12, border: `1px solid ${border}`, boxShadow: 'none' } } },
    MuiInputBase: { styleOverrides: { root: { fontSize: comfortable ? 14 : 13 }, input: { minWidth: 0 } } },
    MuiOutlinedInput: { styleOverrides: { root: { backgroundColor: paper, borderRadius: 10, minHeight: 48 }, notchedOutline: { borderColor: border } } },
    MuiChip: { styleOverrides: { root: { borderRadius: 9, fontWeight: 650, fontSize: 11 }, sizeSmall: { height: 25 } } },
    MuiAlert: { styleOverrides: { root: { borderRadius: 14, fontSize: 12, alignItems: 'center' } } },
    MuiCssBaseline: { styleOverrides: { '@media (prefers-reduced-motion: reduce)': { '*, *::before, *::after': { animationDuration: '0s !important', transitionDuration: '0s !important', scrollBehavior: 'auto !important' } } } },
  },
  });
}

export function DesignProvider({ children }: { children: ReactNode }) {
  const appearance = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const theme = useMemo(() => makeTheme(appearance.theme, appearance.density), [appearance.theme, appearance.density]);
  const value = useMemo(() => ({ ...appearance, setTheme, setDensity }), [appearance]);

  useEffect(() => {
    document.documentElement.dataset.theme = appearance.theme;
    document.documentElement.dataset.density = appearance.density;
  }, [appearance]);

  return <AppRouterCacheProvider options={{ enableCssLayer: true }}><AppearanceContext.Provider value={value}><ThemeProvider theme={theme}><CssBaseline />{children}</ThemeProvider></AppearanceContext.Provider></AppRouterCacheProvider>;
}