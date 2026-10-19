'use client';
import { useState } from 'react';
import { Alert, Avatar, InputAdornment, Paper, TextField } from '@mui/material';
import { ActionButton, Pagination, Panel, StateScreen } from '@/components/ui';
import { usePortalNavigation } from '@/components/portal-shell';
import { PortalIcon } from '@/components/portal-icon';
import { useTeam } from '@/hooks/use-team';
import { pageItems, searchText } from '@/lib/statistics';
import { NoteEditor } from './note-editor';
import { NoteContent } from '@/components/note-content';
import { Results } from './results';

export function TeamPortal({ token }: { token: string }) {
  const team = useTeam(token);
  const { tab } = usePortalNavigation();
  const [query, setQuery] = useState(''), [page, setPage] = useState(1);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const data = team.data;
  if (!data) {
    if (team.error) return <StateScreen title={team.error.status === 401 ? 'Lien d’équipe invalide' : 'Équipe indisponible'}><p role="alert">{team.error.message}</p><ActionButton disabled={team.loading} onClick={() => void team.refresh()}>Réessayer</ActionButton></StateScreen>;
    return <Paper component="p" role="status" className="p-8 text-brand">Chargement de votre équipe…</Paper>;
  }
  const filtered = data.team.roster.filter(p => searchText(p.name).includes(searchText(query)));
  const list = pageItems(filtered, page);
  const sharedNotes = data.team.roster.filter(p => data.hints.some(h => h.participantId === p.id)).length;
  const progress = data.team.roster.length ? Math.round(sharedNotes / data.team.roster.length * 100) : 0;
  const dateLabel = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Indian/Mauritius' }).format(team.now);
  return <div className="team-workspace">
    <div className="workspace-breadcrumb"><span>Espace participants</span><span aria-hidden="true">/</span><span className="font-semibold text-ink">Mon équipe</span><span className="workspace-live"><span /> Espace partagé</span></div>
    <section className="team-hero" aria-labelledby="team-title">
      <div className="hero-orbit" aria-hidden="true"><PortalIcon name="spark" /></div>
      <div className="relative z-1 min-w-0">
        <p className="hero-eyebrow"><span />LE DAILY, CÔTÉ ÉQUIPE</p>
        <h1 id="team-title" className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl lg:text-[42px]">{data.team.name}</h1>
        <p className="hero-description">Un point clair. Une équipe qui avance.</p>
        <div className="hero-meta"><span><PortalIcon name="people" className="size-4" />{data.team.roster.length} participants</span><span><PortalIcon name="clock" className="size-4" />{team.day} · Maurice</span><span><PortalIcon name="shield" className="size-4" />Sans compte personnel</span></div>
      </div>
      <div className="hero-actions"><span className="capitalize">{dateLabel}</span><ActionButton startIcon={<PortalIcon name="refresh" className={`size-4 ${team.loading ? 'animate-spin' : ''}`} />} disabled={team.loading || team.saving} onClick={() => void team.refresh()}>{team.loading ? 'Actualisation…' : 'Actualiser'}</ActionButton></div>
    </section>
    <p role="status" className="sr-only">{team.loading ? 'Actualisation des données.' : 'Données chargées.'}</p>
    {team.error && <Alert severity="warning">{team.error.message} Les données affichées peuvent être anciennes. Vos brouillons sont conservés.</Alert>}
    {data.day !== team.day && <Alert severity="warning">Les notes affichées datent du {data.day}. Actualisez pour charger la nouvelle journée. Aucun brouillon n’est transféré automatiquement.</Alert>}
    <div className="workspace-layout"><div className="min-w-0">
    <div hidden={tab !== 'notes'}><Panel title="Les idées à ne pas oublier" eyebrow="Notes du jour"><div className="notes-overview"><p className="panel-intro">Récemment, maintenant, ensuite. Préparez votre point en quelques mots.</p><div className="notes-completion"><span><strong>{sharedNotes}</strong> / {data.team.roster.length} notes partagées</span><div className="note-progress" role="progressbar" aria-label="Avancement des notes" aria-valuenow={sharedNotes} aria-valuemin={0} aria-valuemax={data.team.roster.length || 1}><span style={{ width: `${progress}%` }} /></div></div></div>
      <div className="roster-toolbar"><div className="min-w-0 flex-1"><label htmlFor="roster-search" className="sr-only">Rechercher un participant</label><TextField id="roster-search" type="search" fullWidth size="small" placeholder="Rechercher un participant…" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} slotProps={{ input: { startAdornment: <InputAdornment position="start"><PortalIcon name="search" className="size-4 text-muted" /></InputAdornment> } }} /></div><span className="roster-count">{filtered.length} résultat(s) <span className="hidden sm:inline">· présents et absents</span></span></div>
      {!data.team.roster.length ? <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600">L’équipe ne contient aucun participant. Le scrum master peut compléter l’équipe dans son application.</p> : !filtered.length ? <p className="p-4 text-sm text-slate-600">Aucun participant ne correspond à votre recherche.</p> : <ul className="space-y-2">{list.items.map(p => {
        const note = data.hints.find(h => h.participantId === p.id);
        const initials = p.name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('').toLocaleUpperCase('fr');
        return <li key={p.id} className={`participant-card ${note ? 'has-note' : ''}`}><div className="participant-avatar"><Avatar variant="rounded" aria-hidden="true" className="size-11 text-sm font-bold">{initials}</Avatar><span className={p.present ? 'is-present' : 'is-away'} aria-hidden="true" /></div><div className="participant-copy"><p className="participant-name">{p.name}</p><div className="participant-status"><span>{p.present ? 'Présent' : 'Absent'}</span><span aria-hidden="true">·</span><span className={note ? 'text-success' : ''}>{note ? 'Note partagée' : 'Pas encore de note'}</span></div>{note && <NoteContent className="note-preview" value={note.hint} />}</div><ActionButton className="participant-action" startIcon={<PortalIcon name={note ? 'notes' : 'arrow'} className="size-4" />} disabled={!!selected || team.saving || data.day !== team.day || !!team.error} onClick={() => setSelected({ id: p.id, name: p.name })} aria-label={`Écrire une note pour ${p.name}`}>{note ? 'Voir / modifier' : 'Ajouter une note'}</ActionButton></li>;
      })}</ul>}
      <Pagination page={list.page} pages={list.pages} onPage={setPage} label="Participants" />
      {selected && <NoteEditor key={selected.id} participant={selected} data={data} day={team.day} saving={team.saving} save={team.save} refresh={team.refresh} onClose={() => setSelected(null)} />}
    </Panel></div>
    <div hidden={tab !== 'statistics'}><Results kind="statistics" data={data} now={team.now} /></div>
    <div hidden={tab !== 'summary'}><Results kind="summary" data={data} now={team.now} /></div>
    </div></div>
    <div className="workspace-notice"><PortalIcon name="shield" className="size-4 shrink-0 text-brand" /><p>Un espace partagé, pas privé. Protégez votre lien et évitez les informations sensibles.</p></div>
  </div>;
}