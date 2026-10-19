'use client';
import { useState } from 'react';
import { Alert, Avatar, IconButton, InputAdornment, Paper, TextField } from '@mui/material';
import { ActionButton, Pagination, Panel, StateScreen } from '@/components/ui';
import { usePortalNavigation } from '@/components/portal-shell';
import { PortalIcon } from '@/components/portal-icon';
import { useTeam } from '@/hooks/use-team';
import { pageItems, searchText } from '@/lib/statistics';
import { NoteEditor } from './note-editor';
import { NoteContent } from '@/components/note-content';
import { Results } from './results';
import { useFavorites } from '@/hooks/use-favorites';
import { NOTE_SECTIONS, parseNoteSections } from '@/lib/note-sections';

export function TeamPortal({ token }: { token: string }) {
  const team = useTeam(token);
  const { tab } = usePortalNavigation();
  const [query, setQuery] = useState(''), [page, setPage] = useState(1);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [expanded, setExpanded] = useState<string[]>([]);
  const data = team.data;
  const { favorites, toggle } = useFavorites(data?.team.id);
  if (!data) {
    if (team.error) return <StateScreen title={team.error.status === 401 ? 'Lien d’équipe invalide' : 'Équipe indisponible'}><p role="alert">{team.error.message}</p><ActionButton disabled={team.loading} onClick={() => void team.refresh()}>Réessayer</ActionButton></StateScreen>;
    return <Paper component="p" role="status" className="p-8 text-brand">Chargement de votre équipe…</Paper>;
  }
  const filtered = data.team.roster.filter(p => searchText(p.name).includes(searchText(query)))
    .sort((a, b) => Number(favorites.includes(b.id)) - Number(favorites.includes(a.id)));
  const list = pageItems(filtered, page);
  const sharedNotes = data.team.roster.filter(p => data.hints.some(h => h.participantId === p.id)).length;
  const progress = data.team.roster.length ? Math.round(sharedNotes / data.team.roster.length * 100) : 0;
  const dateLabel = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Indian/Mauritius' }).format(team.now);
  return <div className="team-workspace">
    <section className="team-hero" aria-labelledby="team-title">
      <div className="hero-orbit" aria-hidden="true"><PortalIcon name="spark" /></div>
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
    <div className="workspace-layout"><div className="min-w-0">
    <div hidden={tab !== 'notes'}><Panel title="Les idées à ne pas oublier"><div className="notes-overview"><div className="notes-completion"><span><strong>{sharedNotes}</strong> / {data.team.roster.length} notes partagées</span><div className="note-progress" role="progressbar" aria-label="Avancement des notes" aria-valuenow={sharedNotes} aria-valuemin={0} aria-valuemax={data.team.roster.length || 1}><span style={{ width: `${progress}%` }} /></div></div></div>
      <div className="roster-toolbar"><div className="min-w-0 flex-1"><label htmlFor="roster-search" className="sr-only">Rechercher un participant</label><TextField id="roster-search" type="search" fullWidth size="small" placeholder="Rechercher un participant…" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} slotProps={{ input: { startAdornment: <InputAdornment position="start"><PortalIcon name="search" className="size-4 text-muted" /></InputAdornment>, endAdornment: query ? <InputAdornment position="end"><IconButton aria-label="Effacer la recherche" onClick={() => { setQuery(''); setPage(1); document.getElementById('roster-search')?.focus(); }} edge="end"><PortalIcon name="close" className="size-4" /></IconButton></InputAdornment> : undefined } }} /></div><span className="roster-count" role="status">{filtered.length} {filtered.length === 1 ? 'participant' : 'participants'}</span></div>
      {!data.team.roster.length ? <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600">L’équipe ne contient aucun participant. Le scrum master peut compléter l’équipe dans son application.</p> : !filtered.length ? <p className="p-4 text-sm text-slate-600">Aucun participant ne correspond à votre recherche.</p> : <ul className="space-y-2">{list.items.map(p => {
        const note = data.hints.find(h => h.participantId === p.id);
        const initials = p.name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('').toLocaleUpperCase('fr');
        const isExpanded = expanded.includes(p.id);
        const favorite = favorites.includes(p.id);
        const sections = note ? parseNoteSections(note.hint) : null;
        return <li key={p.id} className={`participant-card ${note ? 'has-note' : ''} ${isExpanded ? 'is-expanded' : ''}`}>
          <IconButton className="favorite-toggle" aria-label={`${favorite ? 'Retirer' : 'Épingler'} ${p.name} ${favorite ? 'des' : 'aux'} favoris`} aria-pressed={favorite} title="Favori sur cet appareil uniquement" onClick={() => { toggle(p.id); setPage(1); }}><PortalIcon name="pin" className="size-4" /></IconButton>
          <div className="participant-avatar"><Avatar variant="rounded" aria-hidden="true">{initials}</Avatar><span className={p.present ? 'is-present' : 'is-away'} aria-hidden="true" /></div>
          <div className="participant-copy"><p className="participant-name">{p.name}</p><div className="participant-status"><span>{p.present ? 'Présent' : 'Absent'}</span><span aria-hidden="true">·</span><span className={note ? 'text-success' : ''}>{note ? 'Note partagée' : 'Pas encore de note'}</span></div>{note && <>
            {!isExpanded && <NoteContent className="note-preview" value={note.hint} />}
            {note.updatedAt && <time className="note-updated" dateTime={note.updatedAt} title={new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Indian/Mauritius' }).format(new Date(note.updatedAt))}>Modifiée le {new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Indian/Mauritius' }).format(new Date(note.updatedAt))} · Maurice</time>}
            <button type="button" className="note-expand-toggle" aria-label={`${isExpanded ? 'Réduire' : 'Développer'} la note de ${p.name}`} aria-expanded={isExpanded} aria-controls={`expanded-note-${p.id}`} onClick={() => setExpanded(previous => previous.includes(p.id) ? previous.filter(id => id !== p.id) : [...previous, p.id])}>{isExpanded ? 'Réduire' : 'Lire la note'}<PortalIcon name="chevron" className="size-3" /></button>
          </>}</div>
          <ActionButton className="participant-action" startIcon={<PortalIcon name={note ? 'notes' : 'arrow'} className="size-4" />} disabled={!!selected || team.saving || data.day !== team.day || !!team.error} onClick={() => setSelected({ id: p.id, name: p.name })} aria-label={`Écrire une note pour ${p.name}`}>{note ? 'Modifier' : 'Ajouter une note'}</ActionButton>
          {note && <div id={`expanded-note-${p.id}`} className="expanded-note" hidden={!isExpanded}>{NOTE_SECTIONS.map(section => <section key={section.key} aria-label={section.heading}><h3>{section.heading}</h3>{sections?.[section.key] ? <NoteContent value={sections[section.key]} /> : <p className="note-section-empty">Non renseigné</p>}</section>)}</div>}
        </li>;
      })}</ul>}
      <Pagination page={list.page} pages={list.pages} onPage={setPage} label="Participants" />
      {selected && <NoteEditor key={selected.id} participant={selected} data={data} day={team.day} saving={team.saving} save={team.save} refresh={team.refresh}
        retained={team.workspace.drafts.get(selected.id)} unresolved={team.uncertain.includes(selected.id)}
        retain={snapshot => { team.workspace.drafts.set(selected.id, snapshot); }} resolve={() => team.workspace.resolve(selected.id)}
        onClose={() => { team.workspace.drafts.delete(selected.id); setSelected(null); }} />}
    </Panel></div>
    <div hidden={tab !== 'statistics'}><Results kind="statistics" data={data} now={team.now} /></div>
    <div hidden={tab !== 'summary'}><Results kind="summary" data={data} now={team.now} /></div>
    </div></div>
    <div className="workspace-notice"><PortalIcon name="shield" className="size-4 shrink-0 text-brand" /><p>Un espace partagé, pas privé. Protégez votre lien et évitez les informations sensibles.</p></div>
  </div>;
}