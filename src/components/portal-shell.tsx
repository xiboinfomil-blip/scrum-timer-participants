'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { AppBar, ButtonBase, Chip, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import { ParticipantGuide } from './participant-guide';
import { ActionButton } from './ui';
import { PortalIcon } from './portal-icon';

type PortalView = 'notes' | 'statistics' | 'summary';
const NavigationContext = createContext<{ tab: PortalView; setTab: (tab: PortalView) => void } | null>(null);

export function usePortalNavigation() {
  const context = useContext(NavigationContext);
  if (!context) throw new Error('La navigation nécessite PortalShell.');
  return context;
}

const views = [
  { id: 'notes', label: 'Notes du jour', icon: 'notes' },
  { id: 'statistics', label: 'Statistiques', icon: 'statistics' },
  { id: 'summary', label: 'Bilan du jour', icon: 'summary' },
] as const;

export function PortalShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [tab, setTab] = useState<PortalView>('notes');
  const [guideOpen, setGuideOpen] = useState(false);
  const hasTeam = pathname.startsWith('/t/');
  return <NavigationContext.Provider value={{ tab, setTab }}>
    <AppBar component="header" position="relative" color="transparent" elevation={0} className={`border-b border-line bg-white/95 text-ink backdrop-blur-xl ${hasTeam ? 'team-appbar' : ''}`}>
      <a href="#contenu" className="absolute left-3 top-2 z-50 -translate-y-24 rounded-xl bg-brand px-4 py-3 text-xs font-semibold text-white focus:translate-y-0">Aller au contenu</a>
      <div className="mx-auto flex min-h-18 w-full max-w-480 items-center gap-4 px-6 max-[1100px]:gap-2 max-[800px]:flex-wrap max-[800px]:gap-y-1 max-[800px]:px-3 max-[800px]:py-1">
        <Link href="/" aria-label="Accueil de l’espace participants Infomil Mauritius" className="flex min-h-11 shrink-0 items-center rounded-lg pr-4 min-[1101px]:border-r min-[1101px]:border-line max-[800px]:pr-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/infomil-logo.svg" alt="Infomil Mauritius" width={190} height={60} className="h-9 w-28 object-contain max-[800px]:h-7 max-[800px]:w-20" />
        </Link>
        <div className="min-w-0 shrink text-sm font-semibold text-ink max-[420px]:text-xs">Espace participants<p className="mt-0.5 text-[10px] font-normal text-muted max-[800px]:hidden">Le daily, côté équipe</p></div>
        {hasTeam && <nav aria-label="Vues de l’équipe" className="mx-auto min-w-0 max-w-150 flex-1 rounded-2xl border border-slate-200/70 bg-slate-50 p-1 max-[800px]:order-3 max-[800px]:max-w-none max-[800px]:basis-full">
          <div className="grid grid-cols-3 gap-1">{views.map(view => {
            const active = tab === view.id;
            return <ButtonBase key={view.id} aria-pressed={active} onClick={() => setTab(view.id)} className={`relative flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl px-2 transition-colors max-[420px]:gap-1 ${active ? 'bg-white text-brand shadow-sm ring-1 ring-slate-200/80' : 'text-muted hover:bg-white hover:text-brand'}`}>
              <span aria-hidden="true" className={`grid size-7 shrink-0 place-items-center rounded-lg max-[420px]:hidden ${active ? 'bg-brand text-white' : 'bg-slate-200/70 text-muted'}`}><PortalIcon name={view.icon} className="size-4" /></span>
              <span className="truncate text-xs font-semibold max-[420px]:text-[10px]">{view.label}</span>
              {active && <span aria-hidden="true" className="absolute inset-x-5 bottom-0 h-0.5 rounded-full bg-accent" />}
            </ButtonBase>;
          })}</div>
        </nav>}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {hasTeam ? <ButtonBase aria-label="Guide d’utilisation" aria-haspopup="dialog" onClick={() => setGuideOpen(true)} className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold text-muted hover:bg-blue-50 hover:text-brand max-[420px]:px-2"><PortalIcon name="help" className="size-5" /><span className="max-[420px]:sr-only">Guide</span></ButtonBase> : <ButtonBase component={Link} href="/help" aria-label="Guide d’utilisation" aria-current={pathname === '/help' ? 'page' : undefined} className={`flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold max-[420px]:px-2 ${pathname === '/help' ? 'bg-blue-50 text-brand' : 'text-muted hover:bg-blue-50 hover:text-brand'}`}><PortalIcon name="help" className="size-5" /><span className="max-[420px]:sr-only">Guide</span></ButtonBase>}
          <Chip size="small" variant="outlined" label="Accès partagé" className="shrink-0 border-line bg-blue-50 text-brand max-[1000px]:hidden" />
        </div>
      </div>
    </AppBar>
    <main id="contenu" tabIndex={-1} className={`mx-auto min-h-[70vh] w-full px-4 py-6 sm:px-6 sm:py-8 ${hasTeam ? 'team-main max-w-7xl' : 'max-w-6xl'}`}>{children}</main>
    <footer className="mx-auto max-w-6xl px-4 py-6 text-xs leading-relaxed text-muted sm:px-6"><span className="font-semibold text-brand">Infomil Mauritius</span> · Sans connexion personnelle. Le lien donne accès aux données partagées de l’équipe. Ne le publiez pas.</footer>
    <Dialog open={guideOpen} onClose={() => setGuideOpen(false)} fullWidth maxWidth="md" aria-labelledby="guide-dialog-title" scroll="paper">
      <DialogTitle id="guide-dialog-title" className="border-b border-line text-lg font-bold text-ink">Guide de l’espace participants</DialogTitle>
      <DialogContent dividers><ParticipantGuide /></DialogContent>
      <DialogActions><ActionButton onClick={() => setGuideOpen(false)}>Fermer le guide</ActionButton></DialogActions>
    </Dialog>
  </NavigationContext.Provider>;
}