import type { Hint, NoteInput, Notes, Person, PortalData, Round } from '../types/portal.ts';
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,512}\.[A-Za-z0-9_-]{43}$/;
export const TEAM_PATTERN = /^[a-f0-9]{64}$/;
const controls = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/u;
export const characterCount = (value: string) => [...value].length;
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Format invalide.');
  return value as Record<string, unknown>;
}
function text(value: unknown, limit: number): string {
  if (typeof value !== 'string' || !value.trim() || characterCount(value) > limit || /\p{Cc}/u.test(value)) throw new Error('Texte invalide.');
  return value;
}
export function validDay(value: unknown): value is string {
  return typeof value === 'string' && /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
export function validateNote(value: unknown): NoteInput {
  const v = record(value), keys = ['participantId', 'hint', 'day', 'revision'];
  if (Object.keys(v).length !== 4 || Object.keys(v).some(k => !keys.includes(k))) throw new Error('Requête invalide.');
  const participantId = text(v.participantId, 100);
  if (typeof v.hint !== 'string' || controls.test(v.hint)) throw new Error('Seuls les retours à la ligne LF sont autorisés.');
  const hint = v.hint.trim();
  if (!hint || characterCount(hint) > 600) throw new Error('La note doit contenir entre 1 et 600 caractères.');
  if (!validDay(v.day)) throw new Error('Date invalide.');
  if (!Number.isInteger(v.revision) || (v.revision as number) < 0 || (v.revision as number) >= 2147483647) throw new Error('Révision invalide.');
  return { participantId, hint, day: v.day, revision: v.revision as number };
}
function array(value: unknown, limit: number): unknown[] {
  if (!Array.isArray(value) || value.length > limit) throw new Error('Liste invalide.');
  return value;
}
function unique<T>(items: T[], key: (item: T) => string): T[] {
  if (new Set(items.map(key)).size !== items.length) throw new Error('Identifiants dupliqués.');
  return items;
}
export function parseNotes(value: unknown): Notes {
  const v = record(value);
  if (!validDay(v.day)) throw new Error('Date invalide.');
  const day = v.day;
  const hints: Hint[] = unique(array(v.hints, 100).map(item => {
    const h = record(item);
    const { participantId, hint, revision } = validateNote({ participantId: h.participantId, hint: h.hint, revision: h.revision, day });
    if (h.updatedAt !== undefined && h.updatedAt !== null) {
      if (typeof h.updatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(h.updatedAt) || !Number.isFinite(Date.parse(h.updatedAt))) throw new Error('Horodatage de note invalide.');
      return { participantId, hint, revision, updatedAt: new Date(h.updatedAt).toISOString() };
    }
    return { participantId, hint, revision };
  }), h => h.participantId);
  return { day, hints };
}
function number(value: unknown, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) throw new Error('Nombre invalide.');
  return value;
}
export function parsePortal(value: unknown): PortalData {
  const v = record(value), t = record(v.team);
  if (typeof t.id !== 'string' || !TEAM_PATTERN.test(t.id)) throw new Error('Équipe invalide.');
  const roster = unique(array(t.roster, 100).map(item => {
    const p = record(item);
    if (typeof p.present !== 'boolean') throw new Error('Présence invalide.');
    return { id: text(p.id, 100), name: text(p.name, 60), present: p.present };
  }), p => p.id);
  const history: Round[] = unique(array(v.history, 100).map(item => {
    const r = record(item);
    if (typeof r.completedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(r.completedAt) || !Number.isFinite(Date.parse(r.completedAt))) throw new Error('Horodatage invalide.');
    const people: Person[] = unique(array(r.people, 100).map(item => {
      const p = record(item);
      if (p.mood !== null && ![1, 2, 3, 4].includes(p.mood as number)) throw new Error('Humeur invalide.');
      if (typeof p.timeUp !== 'boolean') throw new Error('Mesure invalide.');
      return { id: text(p.id, 100), name: text(p.name, 60), mood: p.mood as Person['mood'],
        speakingSeconds: number(p.speakingSeconds, 86400), budgetSeconds: number(p.budgetSeconds, 86400),
        timeUp: p.timeUp, score: p.score === null ? null : number(p.score, 1000),
        meterTitle: p.meterTitle === null ? null : text(p.meterTitle, 200) };
    }), p => p.id);
    return { id: text(r.id, 100), completedAt: new Date(r.completedAt).toISOString(), people };
  }), r => r.id);
  const notes = parseNotes(v);
  if (notes.hints.some(h => !roster.some(p => p.id === h.participantId))) throw new Error('Note hors équipe.');
  return { team: { id: t.id, name: text(t.name, 100), roster }, ...notes, history };
}