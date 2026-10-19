'use client';
import { useEffect, useRef, useState } from 'react';
import { Alert, Avatar, Dialog, DialogContent, IconButton } from '@mui/material';
import { ActionButton } from '@/components/ui';
import { RichNoteEditor, type RichNoteEditorHandle } from '@/components/rich-note-editor';
import { NoteContent } from '@/components/note-content';
import { PortalIcon } from '@/components/portal-icon';
import { usePortalNavigation } from '@/components/portal-shell';
import { characterCount, validateNote } from '@/lib/contracts';
import { mauritiusDay } from '@/lib/statistics';
import type { NoteInput, Notes, PortalData } from '@/types/portal';

type Props = {
  participant: { id: string; name: string }; data: PortalData; day: string; saving: boolean;
  save: (input: NoteInput) => Promise<Notes>; refresh: () => Promise<PortalData | null>;
  onClose: () => void;
};
export function NoteEditor({ participant, data, day, saving, save, refresh, onClose }: Props) {
  const { openGuide } = usePortalNavigation();
  const current = data.hints.find(h => h.participantId === participant.id);
  const [base, setBase] = useState(() => ({ day: data.day, hint: current?.hint ?? '', revision: current?.revision ?? 0 }));
  const [draft, setDraft] = useState(base.hint);
  const [message, setMessage] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [review, setReview] = useState<{ day: string; hint: string; revision: number } | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const inputRef = useRef<RichNoteEditorHandle>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  const dirty = draft !== base.hint;
  const removed = !data.team.roster.some(p => p.id === participant.id);
  const changed = base.day !== day || base.day !== data.day || (current?.revision ?? 0) !== base.revision || (current?.hint ?? '') !== base.hint;
  const conflict = uncertain || changed;
  useEffect(() => {
    if (!dirty && !saving) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, saving]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (conflict || saving || removed) return;
    try {
      const input = validateNote({ participantId: participant.id, hint: draft, day: base.day, revision: base.revision });
      if (input.day !== mauritiusDay()) { setUncertain(true); setMessage('La journée a changé. Rechargez pour vérifier.'); return; }
      const notes = await save(input);
      const saved = notes.hints.find(h => h.participantId === participant.id);
      if (!saved) throw new Error('Réponse incomplète. Rechargez pour vérifier l’enregistrement.');
      setBase({ day: notes.day, hint: saved.hint, revision: saved.revision }); setDraft(saved.hint);
      setMessage('Note enregistrée et partagée avec l’équipe.'); setReview(null);
    } catch (e) {
      // Even a timeout may have committed. Never retry a write without review.
      setUncertain(true); setReview(null);
      setMessage(e instanceof Error ? e.message : 'Enregistrement non confirmé. Rechargez pour vérifier.');
    }
  }
  async function loadReview() {
    setReviewing(true); setMessage('');
    const fresh = await refresh();
    if (fresh) {
      const hint = fresh.hints.find(h => h.participantId === participant.id);
      setReview({ day: fresh.day, hint: hint?.hint ?? '', revision: hint?.revision ?? 0 });
    } else setMessage('Rechargement impossible. Votre brouillon est conservé.');
    setReviewing(false);
  }
  function requestClose() {
    if (saving || reviewing) return;
    if (!dirty || window.confirm('Abandonner ce brouillon non enregistré ?')) onClose();
  }
  const count = characterCount(draft.trim());
  const initials = participant.name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('').toLocaleUpperCase('fr');
  return <Dialog open onClose={requestClose} fullWidth maxWidth="sm" scroll="paper" aria-labelledby="editor-title" aria-describedby="note-help" className="note-modal" slotProps={{ paper: { component: 'section' } }}>
    <header className="note-modal-header"><span className="note-modal-symbol"><PortalIcon name="notes" className="size-5" /></span><div className="min-w-0 flex-1"><p className="note-modal-eyebrow">LES IDÉES À NE PAS OUBLIER</p><h2 id="editor-title">{base.revision ? 'Votre note partagée' : 'Une idée à partager'}</h2></div><IconButton aria-label="Fermer" disabled={saving || reviewing} onClick={requestClose} className="note-modal-close"><PortalIcon name="close" className="size-5" /></IconButton></header>
    <form onSubmit={submit} className="note-modal-form"><DialogContent className="note-modal-content">
    <div className="note-modal-person"><Avatar variant="rounded">{initials}</Avatar><div className="min-w-0 flex-1"><p>{participant.name}</p><span>Note partagée · {base.day}</span></div><span className="note-modal-shared"><PortalIcon name="people" className="size-3.5" />Équipe</span></div>
    <p id="note-help" className="note-modal-help">Vous écrivez pour ce participant, sans identité personnelle vérifiée. Toute l’équipe peut modifier cette note jusqu’à minuit à Maurice (UTC+4).</p>
    <label id="note-label" htmlFor="note" className="note-modal-label" onClick={() => inputRef.current?.focus()}>Note de {participant.name}</label><p className="note-modal-prompt">Une avancée, un blocage, une question… allez à l’essentiel.</p><RichNoteEditor ref={inputRef} value={draft} disabled={saving || reviewing} invalid={count > 600} onChange={value => { setDraft(value.replace(/\r\n?/g, '\n')); setReview(null); }} /><p id="note-format-help" className="note-format-help">La mise en forme est conservée. Les marqueurs de formatage comptent dans la limite de 600 caractères.</p><div className="note-modal-count"><span><span className={dirty ? 'draft-dot' : 'saved-dot'} />{dirty ? 'Brouillon non enregistré' : 'Aucune modification en attente'}</span><p id="note-count" className={count > 600 ? 'text-danger' : ''}>{count} / 600 <span className="sr-only">caractères Unicode, formatage inclus</span></p></div>
    <div className="note-modal-feedback">
    {removed && <Alert severity="error" role="alert">Ce participant ne figure plus dans l’équipe. Le brouillon est conservé mais ne peut pas être enregistré.</Alert>}
    {conflict && <div className="space-y-3"><Alert severity="warning" role="alert">La version ou la journée a changé, ou le dernier enregistrement n’est pas confirmé. Votre brouillon n’a pas été remplacé. Rechargez et comparez avant tout nouvel enregistrement.</Alert><ActionButton type="button" disabled={saving || reviewing} onClick={() => void loadReview()}>{reviewing ? 'Rechargement…' : 'Recharger pour comparer'}</ActionButton>
      {review && <div className="note-modal-review space-y-3"><p className="text-xs font-semibold">Version serveur · {review.day} · révision {review.revision}</p><NoteContent className="rounded-lg bg-white p-3 text-sm" value={review.hint || 'Aucune note enregistrée.'} /><ActionButton type="button" disabled={review.day !== day || removed} onClick={() => { setBase(review); setUncertain(false); setReview(null); setMessage('Version examinée. Le brouillon est conservé ; vérifiez-le puis enregistrez explicitement.'); }}>Version examinée : conserver mon brouillon</ActionButton><ActionButton type="button" onClick={() => { if (window.confirm('Remplacer votre brouillon par la version du serveur ?')) { setBase(review); setDraft(review.hint); setUncertain(false); setReview(null); setMessage('Version serveur chargée.'); } }}>Remplacer mon brouillon par cette version</ActionButton></div>}
    </div>}
    <p role="status" className={`note-modal-message ${message && !conflict ? 'is-confirmed' : ''}`}>{message}</p></div>
    <div className="note-modal-tip"><PortalIcon name="shield" className="size-4 shrink-0" /><p>Partagé avec l’équipe, pas privé. Évitez les informations sensibles ; le brouillon reste uniquement dans cet onglet.</p></div>
    </DialogContent><footer className="note-modal-footer"><div className="note-modal-tools"><ActionButton aria-label="Guide d’utilisation" onClick={openGuide} startIcon={<PortalIcon name="help" className="size-4" />}>Guide</ActionButton><ActionButton disabled={saving || reviewing} onClick={() => void refresh()} aria-label="Actualiser" startIcon={<PortalIcon name="refresh" className="size-4" />}>Actualiser</ActionButton></div><ActionButton type="submit" variant="contained" startIcon={<PortalIcon name="check" className="size-4" />} disabled={saving || reviewing || conflict || removed || !dirty || !draft.trim() || count > 600}>{saving ? 'Enregistrement…' : 'Enregistrer la note'}</ActionButton></footer></form></Dialog>;
}