import type { Metadata } from 'next';
import { ParticipantGuide } from '@/components/participant-guide';
import { PortalIcon } from '@/components/portal-icon';

export const metadata: Metadata = {
  title: 'Guide d’utilisation · Espace participants · Infomil',
  description: 'Préparer les notes partagées, conserver un brouillon et consulter les statistiques et le bilan du jour.',
};

export default function HelpPage() {
  return <article aria-labelledby="guide-heading" className="help-page">
    <div className="help-breadcrumb"><span>Espace participants</span><span aria-hidden="true">/</span><span className="font-semibold text-ink">Guide d’utilisation</span></div>
    <header className="help-hero">
      <div className="help-hero-copy"><p className="help-eyebrow"><span /> VOS REPÈRES, TOUT SIMPLEMENT</p><h1 id="guide-heading">Des notes partagées,<br className="hidden sm:block" /> un daily bien préparé.</h1><p className="help-hero-description">De la première note au bilan de l’équipe, retrouvez l’essentiel pour avancer ensemble, en toute sérénité.</p><a href="#guide-notes" className="help-start-link">Préparer ma première note<PortalIcon name="arrow" className="size-4" /></a><p className="help-access"><PortalIcon name="shield" className="size-4" />Accessible sans lien d’équipe · aucune donnée d’équipe chargée</p></div>
      <div className="help-illustration" aria-hidden="true"><div className="help-illustration-orbit" /><div className="help-example-note"><span className="help-example-eyebrow"><span /> PRÊT POUR LE DAILY</span><div className="help-example-person"><span>É</span><div><strong>Ma note du jour</strong><small>Un peu de clarté pour l’équipe</small></div><PortalIcon name="notes" className="size-5" /></div><div className="help-example-lines"><span /><span /><span /></div><div className="help-example-saved"><span><PortalIcon name="check" className="size-3.5" /></span>Une idée partagée, un pas de plus.</div></div><div className="help-example-badge"><PortalIcon name="spark" className="size-4" />Simplement, ensemble.</div></div>
    </header>
    <div className="help-quick-facts" aria-label="L’essentiel en un coup d’œil">{[
      { icon: 'people', title: 'Un lien, toute l’équipe', text: 'Pas de compte personnel à créer.' },
      { icon: 'notes', title: 'Des idées à partager', text: 'Les notes se préparent à plusieurs.' },
      { icon: 'summary', title: 'Des repères pour avancer', text: 'Les résultats se consultent simplement.' },
    ].map(fact => <div key={fact.title}><span className="help-fact-icon"><PortalIcon name={fact.icon as 'people' | 'notes' | 'summary'} className="size-5" /></span><p><strong>{fact.title}</strong><span>{fact.text}</span></p></div>)}</div>
    <ParticipantGuide variant="page" />
    <aside className="help-bottom-note"><span className="help-fact-icon"><PortalIcon name="help" className="size-5" /></span><div><p className="help-bottom-title">Besoin d’un nouveau lien ?</p><p>Votre scrum master est votre point de contact pour retrouver l’accès à l’équipe. Aucun compte ni annuaire n’est nécessaire.</p></div></aside>
  </article>;
}