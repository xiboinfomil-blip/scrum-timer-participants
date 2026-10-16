'use client';

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
      'Écrivez un point à partager, une idée ou un blocage, puis choisissez « Enregistrer la note ». Le texte doit être non vide et compter au maximum 600 caractères Unicode. Attendez le message « Note enregistrée et partagée avec l’équipe. » avant de considérer l’enregistrement comme confirmé.',
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

export function ParticipantGuide() {
  return <div className="space-y-4 text-sm leading-relaxed text-muted">
    <p className="max-w-2xl">Préparez vos idées et retrouvez les repères de votre daily. Ici, seules les notes sont modifiables ; les statistiques et le bilan se consultent en lecture seule.</p>
    <nav aria-label="Sommaire du guide" className="grid grid-cols-2 gap-2 rounded-2xl border border-line bg-slate-50 p-2 sm:grid-cols-3">
      {sections.map((section, index) => <a key={section.id} href={`#guide-${section.id}`} className="flex min-h-11 min-w-0 items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-brand hover:bg-blue-50"><span aria-hidden="true" className="text-[10px] text-muted">{String(index + 1).padStart(2, '0')}</span>{section.title}</a>)}
    </nav>
    {sections.map((section, index) => <Paper key={section.id} component="section" id={`guide-${section.id}`} aria-labelledby={`guide-${section.id}-title`} className="scroll-mt-4 p-4 sm:p-5">
      <header className="mb-3 flex items-center gap-3"><span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-brand"><PortalIcon name={section.icon} className="size-5" /></span><div><p className="text-[10px] font-bold uppercase tracking-widest text-muted">Repère {String(index + 1).padStart(2, '0')}</p><h2 id={`guide-${section.id}-title`} className="text-base font-bold tracking-tight text-ink sm:text-lg">{section.title}</h2></div></header>
      <div className="space-y-3">{section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</div>
    </Paper>)}
  </div>;
}