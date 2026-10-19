'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { parseNotes, parsePortal } from '@/lib/contracts';
import { mauritiusDay } from '@/lib/statistics';
import type { NoteInput, Notes, PortalData } from '@/types/portal';

export class PortalError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
async function readResponse(response: Response) {
  if (!response.ok) {
    let code = '';
    try { code = (await response.json()).error; } catch { /* Never display upstream text. */ }
    throw new PortalError(response.status, code === 'CONFIGURATION_UNAVAILABLE' ? 'Configuration du portail indisponible.'
      : response.status === 401 ? 'Ce lien d’équipe est invalide ou a été révoqué.'
      : response.status === 409 ? 'Une autre modification a été enregistrée. Rechargez puis comparez les versions.'
      : 'Connexion indisponible. Réessayez avec le bouton Actualiser.');
  }
  return response.json() as Promise<unknown>;
}
export function useTeam(token: string) {
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState<PortalError | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [writeStatus, setWriteStatus] = useState<'idle' | 'saved' | 'uncertain'>('idle');
  const [online, setOnline] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const generation = useRef(0), readController = useRef<AbortController | null>(null);
  const writeController = useRef<AbortController | null>(null), writing = useRef(false), mounted = useRef(false);
  const refresh = useCallback(async () => {
    if (writing.current) return null;
    const id = ++generation.current;
    readController.current?.abort();
    const controller = new AbortController();
    readController.current = controller;
    setLoading(true);
    const timeout = setTimeout(() => controller.abort(), 16000);
    try {
      const value = parsePortal(await readResponse(await fetch('/api/team', { headers: { 'X-Team-Link': token }, cache: 'no-store', signal: controller.signal })));
      if (id !== generation.current || !mounted.current) return null;
      setData(value); setError(null); setNow(new Date());
      return value;
    } catch (e) {
      if (id !== generation.current || !mounted.current) return null;
      setError(e instanceof PortalError ? e : new PortalError(502, 'Connexion indisponible. Vos brouillons restent dans cet onglet.'));
      return null;
    } finally {
      clearTimeout(timeout);
      if (id === generation.current && mounted.current) setLoading(false);
    }
  }, [token]);
  const save = useCallback(async (input: NoteInput): Promise<Notes> => {
    if (writing.current) throw new PortalError(409, 'Un enregistrement est déjà en cours.');
    writing.current = true; setSaving(true);
    const id = ++generation.current; readController.current?.abort(); setLoading(false);
    const controller = new AbortController(); writeController.current = controller;
    const timeout = setTimeout(() => controller.abort(), 16000);
    try {
      const notes = parseNotes(await readResponse(await fetch('/api/team', {
        method: 'PUT', headers: { 'X-Team-Link': token, 'Content-Type': 'application/json' },
        body: JSON.stringify(input), cache: 'no-store', signal: controller.signal,
      })));
      if (notes.day !== input.day) throw new PortalError(409, 'La journée a changé. Rechargez puis vérifiez votre brouillon.');
      if (!mounted.current || id !== generation.current) throw new Error('STALE_WRITE');
      const saved = notes.hints.find(note => note.participantId === input.participantId);
      if (!saved || saved.hint !== input.hint || saved.revision <= input.revision) throw new Error('Enregistrement non confirmé. Rechargez pour comparer.');
      setData(previous => previous ? { ...previous, ...notes } : previous); setError(null); setNow(new Date()); setWriteStatus('saved');
      return notes;
    } catch (e) {
      if (mounted.current) setWriteStatus('uncertain');
      throw e;
    } finally {
      clearTimeout(timeout); writing.current = false; writeController.current = null;
      if (mounted.current) setSaving(false);
    }
  }, [token]);
  useEffect(() => {
    mounted.current = true;
    const connection = () => setOnline(navigator.onLine);
    window.addEventListener('online', connection);
    window.addEventListener('offline', connection);
    const initial = setTimeout(() => { connection(); void refresh(); }, 0);
    const visible = () => { if (document.visibilityState === 'visible') { setNow(new Date()); void refresh(); } };
    document.addEventListener('visibilitychange', visible);
    return () => {
      mounted.current = false;
      // This is a request generation counter, not a DOM node reference.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++generation.current;
      readController.current?.abort(); writeController.current?.abort(); clearTimeout(initial); document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('online', connection); window.removeEventListener('offline', connection);
    };
  }, [refresh]);
  const connectionStatus = !online || error ? 'Connexion indisponible' : saving ? 'Enregistrement…' : writeStatus === 'uncertain' ? 'Enregistrement à vérifier' : loading ? 'Actualisation…' : writeStatus === 'saved' ? 'Enregistré' : 'À jour';
  return { data, error, loading, saving, refresh, save, now, day: mauritiusDay(now), connectionStatus };
}