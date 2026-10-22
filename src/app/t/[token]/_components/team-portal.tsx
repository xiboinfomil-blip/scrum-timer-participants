'use client';
import { useState } from 'react';
import { Alert, Avatar, Dialog, DialogActions, DialogContent, DialogTitle, Paper, TextField } from '@mui/material';
import { ActionButton, StateScreen } from '@/components/ui';
import { usePortalNavigation } from '@/components/portal-shell';
import { PortalIcon } from '@/components/portal-icon';
import { useTeam } from '@/hooks/use-team';
import { useNotePerson } from '@/hooks/use-note-person';
import { NoteEditor } from './note-editor';
import { NoteContent } from '@/components/note-content';
import { Results } from './results';
import { NOTE_SECTIONS, parseNoteSections } from '@/lib/note-sections';

export function TeamPortal({ token }: { token: string }) {
  const team = useTeam(token);
  const { tab } = usePortalNavigation();
  const [editing, setEditing] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [candidate, setCandidate] = useState('');
  const data = team.data;
  const { personId, ready, choose } = useNotePerson(data?.team.id);
  if (!data) {
    if (team.error) return <StateScreen title={team.error.status === 401 ? 'Lien d’équipe invalide' : 'Équipe indisponible'}><p role="alert">{team.error.message}</p><ActionButton disabled={team.loading} onClick={() => void team.refresh()}>Réessayer</ActionButton></StateScreen>;
    return <Paper component="p" role="status" className="p-8 text-brand">Chargement de votre équipe…</Paper>;
  }
  const person = data.team.roster.find(p => p.id === personId);
  const note = person ? data.hints.find(h => h.participantId === person.id) : undefined;
  const sections = parseNoteSections(note?.hint ?? '');
  const initials = person?.name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('').toLocaleUpperCase('fr');
  const dateLabel = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Indian/Mauritius' }).format(team.now);
  const blocked = team.saving || data.day !== team.day || !!team.error;
  function openChooser() { setCandidate(person?.id ?? ''); setChoosing(true); }
  return <div className="team-workspace">
    <section className="team-hero" aria-labelledby="team-title">
      <div className="relative z-1 min-w-0">
        <p className="hero-eyebrow"><span />LE DAILY, CÔTÉ ÉQUIPE</p>
        <h1 id="team-title" className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl lg:text-[42px]">{data.team.name}</h1>
        <div className="hero-meta"><span><PortalIcon name="people" className="size-4" />{data.team.roster.length} participants</span><span title={`${team.day} · Maurice`}><PortalIcon name="clock" className="size-4" />{dateLabel}</span></div>
      </div>
      <div className="hero-actions"><span className="connection-indicator" role="status" data-state={team.connectionStatus}><span />{team.connectionStatus}</span><ActionButton title={dateLabel} startIcon={<PortalIcon name="refresh" className={`size-4 ${team.loading ? 'animate-spin' : ''}`} />} disabled={team.loading || team.saving} onClick={() => void team.refresh()}>{team.loading ? 'Actualisation…' : 'Actualiser'}</ActionButton></div>
    </section>
    <p role="status" className="sr-only">{team.loading ? 'Actualisation des données.' : 'Données chargées.'}</p>
    {team.error && <Alert severity="warning">{team.error.message} Les données affichées peuvent être anciennes. Vos brouillons sont conservés.</Alert>}
    {data.day !== team.day && <Alert severity="warning">Les notes affichées datent du {data.day}. Actualisez pour charger la nouvelle journée. Aucun brouillon n’est transféré automatiquement.</Alert>}
    <div hidden={tab !== 'notes'} className="personal-notes-view">
      <div className="personal-notes-heading"><div><p className="personal-notes-eyebrow">UN POINT À LA FOIS</p><h2>Votre fil du jour</h2><p>Le bon contexte, pour la bonne personne.</p></div><span className="personal-notes-badge"><PortalIcon name="notes" className="size-4" />Notes du jour</span></div>
      {!ready ? <p role="status">Chargement de votre sélection…</p> : !person ? <Paper component="section" className="note-start" aria-labelledby="note-start-title">
        <div className="note-start-symbol"><PortalIcon name="notes" /></div>
        <p className="personal-notes-eyebrow">VOTRE PROCHAIN DAILY COMMENCE ICI</p>
        <h3 id="note-start-title">Pour qui préparez-vous une note ?</h3>
        <p>Choisissez une personne, puis gardez ses idées à portée de main. Seule sa note sera affichée ici.</p>
        <ActionButton variant="contained" disabled={!data.team.roster.length || blocked} startIcon={<PortalIcon name="people" className="size-4" />} onClick={openChooser}>Choisir une personne</ActionButton>
        {!data.team.roster.length ? <p>L’équipe ne contient aucun participant.</p> : <span>Votre choix sera mémorisé sur cet appareil.</span>}
      </Paper> : <Paper component="section" className="personal-note" aria-labelledby="personal-note-name">
        <header className="personal-note-person"><Avatar variant="rounded" aria-hidden="true">{initials}</Avatar><div className="min-w-0 flex-1"><p className="personal-notes-eyebrow">PERSONNE SÉLECTIONNÉE</p><h3 id="personal-note-name">{person.name}</h3><p>{person.present ? 'Présent' : 'Absent'}<span aria-hidden="true"> · </span>{note ? 'Note enregistrée' : 'Aucune note pour le moment'}</p></div><ActionButton disabled={team.saving} onClick={openChooser}>Changer de personne</ActionButton></header>
        <div className="personal-note-intro"><div><h4>{note ? 'Les idées à garder en tête' : 'Faites de la place à vos idées.'}</h4><p>{note ? 'Un aperçu clair pour préparer le prochain échange.' : 'Un bilan, une priorité, une prochaine étape. Une seule section suffit.'}</p></div><ActionButton variant="contained" disabled={blocked} startIcon={<PortalIcon name="notes" className="size-4" />} aria-label={`Écrire une note pour ${person.name}`} onClick={() => setEditing(true)}>{note ? 'Modifier la note' : 'Ajouter une note'}</ActionButton></div>
        <div className="personal-note-sections">{NOTE_SECTIONS.map(section => <section key={section.key} className={`personal-note-section personal-note-${section.key}`} aria-labelledby={`display-${section.key}`}><span className="personal-note-number" aria-hidden="true">{section.number}</span><h4 id={`display-${section.key}`}>{section.heading}</h4>{sections[section.key] ? <NoteContent value={sections[section.key]} /> : <p className="personal-note-placeholder">{note ? 'Non renseigné' : section.placeholder}</p>}</section>)}</div>
        <footer className="personal-note-footer"><span><PortalIcon name="check" className="size-4" />Sélection mémorisée sur cet appareil</span>{note?.updatedAt && <time dateTime={note.updatedAt}>Modifiée le {new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Indian/Mauritius' }).format(new Date(note.updatedAt))} · Maurice</time>}</footer>
      </Paper>}
      <p className="personal-notes-footnote">Seule la note de la personne choisie est affichée. Ce filtre n’est pas un espace privé : les notes restent partagées avec l’équipe.</p>
    </div>
    <div hidden={tab !== 'statistics'}><Results kind="statistics" data={data} now={team.now} /></div>
    <div hidden={tab !== 'summary'}><Results kind="summary" data={data} now={team.now} /></div>
    <Dialog open={choosing} onClose={() => setChoosing(false)} fullWidth maxWidth="sm" aria-labelledby="person-choice-title" aria-describedby="person-choice-help" className="person-choice-modal">
      <DialogTitle id="person-choice-title">À qui appartient cette note ?</DialogTitle>
      <DialogContent><p id="person-choice-help">Choisissez la personne pour laquelle vous souhaitez écrire. Sa note seule restera affichée après la fermeture.</p><TextField autoFocus select fullWidth label="Personne" value={candidate} onChange={event => setCandidate(event.target.value)} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}><option value="" disabled>Choisir une personne</option>{data.team.roster.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</TextField><p className="person-choice-notice">Le choix est mémorisé sur cet appareil. Vous pourrez le changer à tout moment.</p></DialogContent>
      <DialogActions><ActionButton onClick={() => setChoosing(false)}>Annuler</ActionButton><ActionButton variant="contained" disabled={blocked || !data.team.roster.some(p => p.id === candidate)} onClick={() => { choose(candidate); setChoosing(false); setEditing(true); }}>Continuer</ActionButton></DialogActions>
    </Dialog>
    {editing && person && <NoteEditor key={person.id} participant={person} data={data} day={team.day} saving={team.saving} save={team.save} refresh={team.refresh}
      retained={team.workspace.drafts.get(person.id)} unresolved={team.uncertain.includes(person.id)}
      retain={snapshot => { team.workspace.drafts.set(person.id, snapshot); }} resolve={() => team.workspace.resolve(person.id)}
      onClose={() => { team.workspace.drafts.delete(person.id); setEditing(false); }} />}
    <div className="workspace-notice"><PortalIcon name="shield" className="size-4 shrink-0 text-brand" /><p>Un espace partagé, pas privé. Protégez votre lien et évitez les informations sensibles.</p></div>
  </div>;
}