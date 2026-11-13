'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { ParticipantGuide } from './participant-guide';
import { ActionButton } from './ui';
import { PortalIcon } from './portal-icon';
import { AppearanceControls } from './appearance-controls';

type PortalView = 'notes' | 'statistics' | 'summary';
const NavigationContext = createContext<{ tab: PortalView; setTab: (tab: PortalView) => void; openGuide: () => void } | null>(null);

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
  const isHelp = pathname === '/help';
  const isHome = pathname === '/';
  return <NavigationContext.Provider value={{ tab, setTab, openGuide: () => setGuideOpen(true) }}>
    <header className={`portal-appbar relative border-b border-line bg-white/95 text-ink backdrop-blur-xl ${hasTeam || isHelp || isHome ? 'team-appbar' : ''}`}>
      <a href="#contenu" className="absolute left-3 top-2 z-50 -translate-y-24 rounded-xl bg-brand px-4 py-3 text-xs font-semibold text-white focus:translate-y-0">Aller au contenu</a>
      <div className="mx-auto flex min-h-18 w-full max-w-480 items-center gap-4 px-6 max-[1100px]:gap-2 max-[800px]:flex-wrap max-[800px]:gap-y-1 max-[800px]:px-3 max-[800px]:py-1">
        <Link href="/" aria-label="Accueil de l’espace participants Infomil Mauritius" className="flex min-h-11 shrink-0 items-center rounded-lg pr-4 min-[1101px]:border-r min-[1101px]:border-line max-[800px]:pr-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/infomil-logo.svg" alt="Infomil Mauritius" width={190} height={60} className="h-9 w-28 object-contain max-[800px]:h-7 max-[800px]:w-20" />
        </Link>
        <div className="min-w-0 shrink text-sm font-semibold text-ink max-[420px]:text-xs">Espace participants</div>
        {hasTeam && <nav aria-label="Vues de l’équipe" className="mx-auto min-w-0 max-w-150 flex-1 rounded-2xl border border-slate-200/70 bg-slate-50 p-1 max-[800px]:order-3 max-[800px]:max-w-none max-[800px]:basis-full">
          <div className="grid grid-cols-3 gap-1">{views.map(view => {
            const active = tab === view.id;
            return <Button variant="ghost" key={view.id} aria-pressed={active} onClick={() => setTab(view.id)} className={`relative flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl px-2 transition-colors max-[420px]:gap-1 ${active ? 'bg-white text-brand shadow-sm ring-1 ring-slate-200/80' : 'text-muted hover:bg-white hover:text-brand'}`}>
              <span aria-hidden="true" className="nav-view-icon"><PortalIcon name={view.icon} className="size-4" /></span>
              <span className="truncate text-xs font-semibold max-[420px]:text-[10px]">{view.label}</span>
            </Button>;
          })}</div>
        </nav>}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <AppearanceControls />
          {hasTeam ? <Button variant="ghost" aria-label="Guide d’utilisation" aria-haspopup="dialog" onClick={() => setGuideOpen(true)} className="min-w-11 px-3 text-xs text-muted max-[420px]:px-2"><PortalIcon name="help" className="size-5" /><span className="max-[420px]:sr-only">Guide</span></Button> : <Button asChild variant="ghost" className={`min-w-11 px-3 text-xs max-[420px]:px-2 ${isHelp ? 'bg-blue-50 text-brand' : 'text-muted'}`}><Link href="/help" aria-label="Guide d’utilisation" aria-current={isHelp ? 'page' : undefined}><PortalIcon name="help" className="size-5" /><span className="max-[420px]:sr-only">Guide</span></Link></Button>}
        </div>
      </div>
    </header>
    <main id="contenu" tabIndex={-1} className={`mx-auto min-h-[70vh] w-full px-4 py-6 sm:px-6 sm:py-8 ${hasTeam || isHelp || isHome ? 'team-main max-w-7xl' : 'max-w-6xl'}`}>{children}</main>
    <footer className="portal-footer mx-auto max-w-6xl px-4 py-6 text-xs leading-relaxed text-muted sm:px-6"><span className="font-semibold text-brand">Infomil Mauritius</span><span>Espace participants · Votre lien reste confidentiel.</span></footer>
    <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
      <DialogContent className="guide-modal" showCloseButton={false} onCloseAutoFocus={event => { if (!hasTeam) return; event.preventDefault(); const target = document.querySelector<HTMLElement>('.note-modal-tools button') ?? document.querySelector<HTMLElement>('.portal-appbar button[aria-label="Guide d’utilisation"]'); requestAnimationFrame(() => target?.focus({ preventScroll: true })); }}>
      <DialogHeader className="border-b border-line"><DialogTitle id="guide-dialog-title">Guide de l’espace participants</DialogTitle></DialogHeader>
      <div className="ui-dialog-body"><ParticipantGuide /></div>
      <DialogFooter><ActionButton onClick={() => setGuideOpen(false)}>Fermer le guide</ActionButton></DialogFooter>
      </DialogContent>
    </Dialog>
  </NavigationContext.Provider>;
}