'use client';

import type { ReactNode } from 'react';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';

// Match ScrumTimer's design tokens without a runtime dependency on its app.
const theme = createTheme({
  cssVariables: true,
  palette: {
    primary: { main: '#205f9d', dark: '#164b80', light: '#eaf2fc' },
    secondary: { main: '#ec8b23', contrastText: '#193752' },
    success: { main: '#147d52' }, error: { main: '#b94b43' },
    background: { default: '#f7f9fc', paper: '#ffffff' },
    text: { primary: '#193752', secondary: '#65798d' }, divider: '#e3ebf4',
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: 13, button: { textTransform: 'none', fontWeight: 650, letterSpacing: 0 },
    h5: { fontWeight: 750, letterSpacing: '-.035em' }, h6: { fontWeight: 700, letterSpacing: '-.025em' },
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true, size: 'small', type: 'button' }, styleOverrides: {
      root: { minHeight: 38, borderRadius: 8, paddingInline: 12, fontSize: 12, transition: 'background-color 180ms ease, box-shadow 180ms ease' },
      contained: { '&.MuiButton-colorPrimary': { background: 'linear-gradient(125deg, #205f9d, #3278b8)', boxShadow: '0 4px 12px #205f9d18', '&:hover': { boxShadow: '0 6px 18px #205f9d30' } } },
      outlined: { borderColor: '#dce6f1', backgroundColor: '#ffffff' },
    } },
    MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { root: { backgroundImage: 'none' }, rounded: { borderRadius: 12, border: '1px solid #e3ebf4', boxShadow: 'none' } } },
    MuiInputBase: { styleOverrides: { root: { fontSize: 13 }, input: { minWidth: 0 } } },
    MuiOutlinedInput: { styleOverrides: { root: { backgroundColor: '#ffffff', borderRadius: 8, minHeight: 38 }, notchedOutline: { borderColor: '#dce6f1' } } },
    MuiChip: { styleOverrides: { root: { borderRadius: 9, fontWeight: 650, fontSize: 11 }, sizeSmall: { height: 25 } } },
    MuiAlert: { styleOverrides: { root: { borderRadius: 14, fontSize: 12, alignItems: 'center' } } },
    MuiCssBaseline: { styleOverrides: { '@media (prefers-reduced-motion: reduce)': { '*, *::before, *::after': { animationDuration: '0s !important', transitionDuration: '0s !important', scrollBehavior: 'auto !important' } } } },
  },
});

export function DesignProvider({ children }: { children: ReactNode }) {
  return <AppRouterCacheProvider options={{ enableCssLayer: true }}><ThemeProvider theme={theme}><CssBaseline />{children}</ThemeProvider></AppRouterCacheProvider>;
}