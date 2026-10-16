import assert from 'node:assert/strict';
import test from 'node:test';
import { duration, historyCutoff, leaderboard, mauritiusDay, nextMauritiusMidnight, pageItems, recentRounds, searchText, todayRound, totals } from '../src/lib/statistics.ts';
import type { Person, Round } from '../src/types/portal.ts';
const now = new Date('2026-10-16T21:00:00Z');
function person(id: string, score: number | null, extra: Partial<Person> = {}): Person {
  return { id, name: id, mood: 1, speakingSeconds: 20, budgetSeconds: 30, timeUp: false, score, meterTitle: null, ...extra };
}
function round(id: string, at: string, people: Person[]): Round { return { id, completedAt: at, people }; }
test('minuit mauricien et cinq jours calendaires UTC sont distincts', () => {
  assert.equal(mauritiusDay(new Date('2026-10-16T19:59:59Z')), '2026-10-16');
  assert.equal(mauritiusDay(new Date('2026-10-16T20:00:00Z')), '2026-10-17');
  assert.equal(new Date(nextMauritiusMidnight(now)).toISOString(), '2026-10-17T20:00:00.000Z');
  assert.equal(new Date(historyCutoff(now)).toISOString(), '2026-10-12T00:00:00.000Z');
  const rounds = [round('old', '2026-10-11T23:59:59.999Z', []), round('edge', '2026-10-12T00:00:00Z', []), round('future', '2026-10-16T21:00:01Z', [])];
  assert.deepEqual(recentRounds(rounds, now).map(r => r.id), ['edge']);
});
test('aucun bilan périmé à la place de celui du jour', () => {
  const old = round('previous', '2026-10-16T19:59:59Z', []);
  assert.equal(todayRound([old], now), null);
  assert.equal(todayRound([old, round('today', '2026-10-16T20:01:00Z', [])], now)?.id, 'today');
});
test('scores stockés non recalculés, mesures éligibles et rangs partagés', () => {
  const rounds = [round('1', '2026-10-16T18:00:00Z', [person('A', 867), person('B', 800), person('C', 600), person('D', 1000, { speakingSeconds: .9 }), person('E', 1000, { budgetSeconds: 0 }), person('F', null)]), round('2', '2026-10-15T18:00:00Z', [person('A', 733), person('B', 800)])];
  const ranked = leaderboard(rounds, now);
  assert.deepEqual(ranked.slice(0, 3).map(p => [p.id, p.average, p.rank]), [['A', 800, 1], ['B', 800, 1], ['C', 600, 3]]);
  assert.equal(ranked.find(p => p.id === 'D')?.average, null);
  assert.equal(ranked.find(p => p.id === 'E')?.rank, null);
  assert.equal(totals(rounds, now).average, 760);
  assert.deepEqual(leaderboard(rounds.map(r => ({ ...r, people: r.people.map(p => ({ ...p, mood: 4 as const })) })), now), ranked);
});
test('100 participants : pagination bornée, recherche accentuée et durée', () => {
  const items = Array.from({ length: 100 }, (_, i) => i);
  assert.equal(pageItems(items, 999).page, 13);
  assert.deepEqual(pageItems(items, 13).items, [96, 97, 98, 99]);
  assert.equal(pageItems([], -2).pages, 1);
  assert.equal(searchText('Élodie'), 'elodie');
  assert.equal(duration(119.9), '2 min 00 s');
});