'use client';

import { useId, useState } from 'react';
import { Divider, IconButton, ListSubheader, Menu, MenuItem, Tooltip } from '@mui/material';
import { useAppearance } from '@/providers/design-provider';
import { PortalIcon } from './portal-icon';

export function AppearanceControls() {
  const { theme, density, setTheme, setDensity } = useAppearance();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const id = useId();
  const open = Boolean(anchor);

  return <>
    <Tooltip title="Apparence">
      <IconButton id={`${id}-trigger`} size="small" aria-label="Apparence" aria-haspopup="menu" aria-controls={open ? `${id}-menu` : undefined} aria-expanded={open ? 'true' : undefined} onClick={event => setAnchor(event.currentTarget)} sx={{ flexShrink: 0, width: 36, height: 36, color: 'text.secondary', borderRadius: 2 }}>
        <PortalIcon name="appearance" className="size-5" />
      </IconButton>
    </Tooltip>
    <Menu id={`${id}-menu`} anchorEl={anchor} open={open} onClose={() => setAnchor(null)} slotProps={{ list: { 'aria-labelledby': `${id}-trigger`, dense: true }, paper: { sx: { width: 240, maxWidth: 'calc(100vw - 24px)' } } }}>
      <ListSubheader component="li" role="presentation" disableSticky>Thème</ListSubheader>
      <MenuItem role="menuitemradio" aria-checked={theme === 'light'} selected={theme === 'light'} onClick={() => { setTheme('light'); setAnchor(null); }}>Clair</MenuItem>
      <MenuItem role="menuitemradio" aria-checked={theme === 'dark'} selected={theme === 'dark'} onClick={() => { setTheme('dark'); setAnchor(null); }}>Sombre</MenuItem>
      <Divider />
      <ListSubheader component="li" role="presentation" disableSticky>Densité</ListSubheader>
      <MenuItem role="menuitemradio" aria-checked={density === 'compact'} selected={density === 'compact'} onClick={() => { setDensity('compact'); setAnchor(null); }}>Compacte</MenuItem>
      <MenuItem role="menuitemradio" aria-checked={density === 'comfortable'} selected={density === 'comfortable'} onClick={() => { setDensity('comfortable'); setAnchor(null); }}>Confortable</MenuItem>
    </Menu>
  </>;
}