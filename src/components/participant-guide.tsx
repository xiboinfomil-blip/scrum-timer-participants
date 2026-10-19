'use client';

import { useEffect, useState } from 'react';
import { Paper } from '@mui/material';
import { PortalIcon } from './portal-icon';

const sections = [
  {
    id: 'acces', title: 'Ouvrir le bon espace', icon: 'people',
    paragraphs: [
      'Ouvrez le lien d’équipe fourni par votre scrum master. Sans ce lien, l’accueil ne présente aucun annuaire d’équipes. Si le lien est invalide, demandez un nouveau lien au scrum master.',
      'Il n’y a pas de compte personnel : toute personne possédant le lien accède aux données partagées de cette équipe et peut écrire pour n’importe quel participant, absent inclus. Choisir un nom ne vérifie pas votre identité.',
    ],
  },
  {
    id: 'notes', title: 'Préparer une note du jour', icon: 'notes',
    paragraphs: [
      'Dans « Notes du jour », recherchez un participant puis choisissez « Ajouter une note » ou « Voir / modifier ». Les listes sont paginées ; la recherche ignore les accents.',
      'Écrivez un point à partager, une idée ou un blocage. La barre de mise en forme propose le gras, l’italique, le texte barré, les listes à puces et numérotées, ainsi qu’annuler et rétablir. Puis choisissez « Enregistrer la note ». Le texte doit être non vide et compter au maximum 600 caractères Unicode, marqueurs de formatage inclus. Attendez le message « Note enregistrée et partagée avec l’équipe. » avant de considérer l’enregistrement comme confirmé.',
      'La note est visible et modifiable par toute l’équipe jusqu’au prochain minuit à Maurice (UTC+4). Les notes du jour ne constituent pas une archive et ne sont pas transférées automatiquement au lendemain.',
    ],
  },
  {
    id: 'brouillons', title: 'Garder la main sur son brouillon', icon: 'refresh',
    paragraphs: [
      'Le brouillon reste uniquement en mémoire dans cet onglet : fermer ou recharger la page peut le faire perdre. Passer entre Notes du jour, Statistiques et Bilan du jour, ou ouvrir ce guide depuis la barre de navigation, ne l’enregistre pas et ne le supprime pas.',
      'Si la version a changé, si la journée est passée ou si un enregistrement n’est pas confirmé, aucun nouvel envoi automatique n’est fait. Choisissez « Recharger pour comparer », lisez la version serveur, puis « Version examinée : conserver mon brouillon » avant de vérifier le texte et d’enregistrer explicitement.',
      '« Remplacer mon brouillon par cette version » demande confirmation. « Fermer » demande aussi confirmation si le texte a été modifié. « Actualiser » recharge les données, sans remplacer le brouillon ouvert.',
    ],
  },
  {
    id: 'statistiques', title: 'Lire les statistiques', icon: 'statistics',
    paragraphs: [
      'La vue « Statistiques » porte sur les cinq jours calendaires UTC, aujourd’hui inclus. Consultez les dailys terminés, les prises de parole, le temps total et le classement ; la recherche et la pagination permettent de retrouver une personne.',
      'Les moyennes utilisent les scores enregistrés, sans recalcul du barème. Seuls les passages avec un score, au moins une seconde mesurée et un budget positif entrent dans la moyenne. Les moyennes égales partagent le rang ; un tiret signifie qu’aucun score mesuré n’est disponible.',
      'Le score est un repère ludique, pas une mesure de productivité ou de qualité du travail. Les humeurs sont un contexte déclaré et ne participent pas au classement.',
    ],
  },
  {
    id: 'bilan', title: 'Retrouver le bilan du jour', icon: 'summary',
    paragraphs: [
      '« Bilan du jour » présente uniquement le daily terminé aujourd’hui à Maurice (UTC+4). Il apparaît après sa clôture par le scrum master ; un ancien bilan ne remplace jamais celui du jour.',
      'Ouvrez « Contexte du bilan et mesures » pour consulter les temps, les budgets et les humeurs archivées. Les statistiques et le bilan sont en lecture seule : les présences, les humeurs à choisir, le minuteur et la gestion d’équipe restent dans l’application du scrum master.',
    ],
  },
  {
    id: 'securite', title: 'Partager avec précaution et réagir aux erreurs', icon: 'help',
    paragraphs: [
      'Le lien donne accès aux données de l’équipe. Ne le publiez pas et évitez les données sensibles dans les notes. Cet espace est partagé, pas privé par participant.',
      'Si la connexion échoue, les données affichées peuvent être anciennes. Gardez votre onglet ouvert pour conserver votre brouillon, puis utilisez « Actualiser » ou « Réessayer ». Un enregistrement non confirmé nécessite une comparaison avant tout nouvel envoi.',
      'Ce guide peut être consulté sans charger de données d’équipe. Il n’envoie aucune note et ne demande aucune connexion personnelle.',
    ],
  },
] as const;

const takeaways = [
  'Le lien d’équipe est votre accès. Gardez-le dans un endroit sûr.',
  '600 caractères maximum. Un enregistrement n’est confirmé qu’après le message de succès.',
  'Votre brouillon reste dans cet onglet. Comparez avant de renvoyer une version incertaine.',
  'Les scores sont des repères ludiques, jamais une évaluation du travail.',
  'Le bilan du jour suit l’heure de Maurice, pas une ancienne session.',
  'En cas de doute, gardez l’onglet ouvert pour préserver votre brouillon.',
] as const;

export function ParticipantGuide({ variant = 'dialog' }: { variant?: 'page' | 'dialog' }) {
  const [active, setActive] = useState('guide-acces');
  useEffect(() => {
    const syncHash = () => setActive(window.location.hash.slice(1) || 'guide-acces');
    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, []);
  return <div className={`participant-guide guide-${variant}`}>
    <aside className="guide-sidebar"><nav aria-label="Sommaire du guide" className="guide-navigation"><p className="guide-nav-eyebrow">DANS CE GUIDE</p>
      {sections.map((section, index) => <a key={section.id} href={`#guide-${section.id}`} aria-current={active === `guide-${section.id}` ? 'location' : undefined} onClick={() => setActive(`guide-${section.id}`)} className="guide-nav-link"><span aria-hidden="true" className="guide-nav-number">{String(index + 1).padStart(2, '0')}</span><span>{section.title}</span><PortalIcon name="arrow" className="guide-nav-arrow" /></a>)}
    </nav><div className="guide-sidebar-tip"><span className="help-fact-icon"><PortalIcon name="shield" className="size-5" /></span><p className="font-semibold text-ink">Partagé, pas personnel.</p><p>Le lien ouvre l’espace de toute l’équipe. Évitez les informations sensibles dans vos notes.</p></div></aside>
    <div className="guide-sections"><p className="guide-intro">Préparez vos idées et retrouvez les repères de votre daily. Ici, seules les notes sont modifiables ; les statistiques et le bilan se consultent en lecture seule.</p>
    {sections.map((section, index) => <Paper key={section.id} component="section" id={`guide-${section.id}`} aria-labelledby={`guide-${section.id}-title`} className="guide-section">
      <header className="guide-section-header"><span aria-hidden="true" className="guide-section-icon"><PortalIcon name={section.icon} className="size-5" /></span><div className="min-w-0 flex-1"><p className="guide-section-eyebrow">REPÈRE {String(index + 1).padStart(2, '0')}</p><h2 id={`guide-${section.id}-title`}>{section.title}</h2></div><span className="guide-section-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span></header>
      <div className="guide-section-prose">{section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</div><div className="guide-takeaway"><PortalIcon name="check" className="size-4 shrink-0" /><p>{takeaways[index]}</p></div>
    </Paper>)}
    </div>
  </div>;
}