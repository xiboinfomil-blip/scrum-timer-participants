import type { Person, Round } from '../types/portal.ts';
export function mauritiusDay(now = new Date()): string {
  return new Date(now.getTime() + 4 * 3600000).toISOString().slice(0, 10);
}
export function nextMauritiusMidnight(now = new Date()): number {
  return Date.parse(`${mauritiusDay(now)}T00:00:00+04:00`) + 86400000;
}
export function historyCutoff(now = new Date()): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 4);
}
export function recentRounds(rounds: Round[], now = new Date()): Round[] {
  return rounds.filter(r => Date.parse(r.completedAt) >= historyCutoff(now) && Date.parse(r.completedAt) <= now.getTime())
    .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));
}
export function todayRound(rounds: Round[], now = new Date()): Round | null {
  return recentRounds(rounds, now).find(r => mauritiusDay(new Date(r.completedAt)) === mauritiusDay(now)) ?? null;
}
export const measured = (p: Person) => p.speakingSeconds >= 1 && p.budgetSeconds > 0;
export const scored = (p: Person) => measured(p) && p.score !== null;
export function leaderboard(rounds: Round[], now = new Date()) {
  const rows = new Map<string, { id: string; name: string; turns: number; count: number; total: number }>();
  for (const r of recentRounds(rounds, now)) for (const p of r.people) {
    const row = rows.get(p.id) ?? { id: p.id, name: p.name, turns: 0, count: 0, total: 0 };
    row.turns++;
    if (scored(p)) { row.count++; row.total += p.score!; }
    rows.set(p.id, row);
  }
  const sorted = [...rows.values()].map(p => ({ ...p, average: p.count ? Math.round(p.total / p.count) : null }))
    .sort((a, b) => (b.average ?? -1) - (a.average ?? -1) || a.name.localeCompare(b.name, 'fr') || a.id.localeCompare(b.id));
  return sorted.map(p => ({ ...p, rank: p.average === null ? null : sorted.findIndex(r => r.average === p.average) + 1 }));
}
export function totals(rounds: Round[], now = new Date()) {
  const recent = recentRounds(rounds, now), people = recent.flatMap(r => r.people), scores = people.filter(scored);
  return { rounds: recent.length, turns: people.length, seconds: people.reduce((n, p) => n + p.speakingSeconds, 0),
    average: scores.length ? Math.round(scores.reduce((n, p) => n + p.score!, 0) / scores.length) : null };
}
export function searchText(value: string) { return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr'); }
export function pageItems<T>(items: T[], requested: number, size = 8) {
  const pages = Math.max(1, Math.ceil(items.length / size)), page = Math.max(1, Math.min(pages, requested));
  return { page, pages, items: items.slice((page - 1) * size, page * size) };
}
export function duration(seconds: number) {
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)} min ${String(rounded % 60).padStart(2, '0')} s`;
}