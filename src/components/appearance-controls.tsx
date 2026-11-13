'use client';

import { useAppearance } from '@/providers/design-provider';
import { PortalIcon } from './portal-icon';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

export function AppearanceControls() {
  const { theme, density, setTheme, setDensity } = useAppearance();
  return <DropdownMenu>
    <Tooltip><TooltipTrigger asChild><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Apparence"><PortalIcon name="appearance" className="size-5" /></Button></DropdownMenuTrigger></TooltipTrigger><TooltipContent>Apparence</TooltipContent></Tooltip>
    <DropdownMenuContent align="end">
      <DropdownMenuLabel>Thème</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={theme} onValueChange={value => { if (value === 'light' || value === 'dark') setTheme(value); }}>
        <DropdownMenuRadioItem value="light">Clair</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="dark">Sombre</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>Densité</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={density} onValueChange={value => { if (value === 'compact' || value === 'comfortable') setDensity(value); }}>
        <DropdownMenuRadioItem value="compact">Compacte</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="comfortable">Confortable</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}