import type { Metadata } from 'next';
import { ParticipantGuide } from '@/components/participant-guide';

export const metadata: Metadata = {
  title: 'Guide d’utilisation · Espace participants · Infomil',
  description: 'Préparer les notes partagées, conserver un brouillon et consulter les statistiques et le bilan du jour.',
};

export default function HelpPage() {
  return <article aria-labelledby="guide-heading" className="space-y-5">
    <header className="border-l-4 border-accent pl-4"><p className="text-[10px] font-bold uppercase tracking-widest text-brand">Le guide de l’espace participants</p><h1 id="guide-heading" className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">Des notes partagées, un daily bien préparé.</h1><p className="mt-2 text-xs text-muted">Accessible sans lien d’équipe · aucune donnée d’équipe chargée</p></header>
    <ParticipantGuide />
  </article>;
}