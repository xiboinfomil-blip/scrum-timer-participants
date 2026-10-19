import assert from 'node:assert/strict';
import test from 'node:test';
import { characterCount, parseNotes, parsePortal, TEAM_PATTERN, TOKEN_PATTERN, validDay, validateNote } from '../src/lib/contracts.ts';
const input = { participantId: 'alice', hint: 'Un sujet\nà partager', day: '2026-10-16', revision: 0 };
test('notes : contrat exact, Unicode, LF et limites', () => {
  assert.equal(validateNote(input).hint, input.hint);
  assert.equal(validateNote({ ...input, hint: '  sujet  ' }).hint, 'sujet');
  assert.equal(characterCount('😀'), 1);
  assert.equal(characterCount(validateNote({ ...input, hint: '😀'.repeat(600) }).hint), 600);
  for (const hint of ['', ' \n ', 'a'.repeat(601), 'a\rb', 'a\r\nb', 'a\tb', 'a\0b', 'a\u0085b']) assert.throws(() => validateNote({ ...input, hint }));
  for (const revision of [-1, 0.5, 2147483647, '0', null]) assert.throws(() => validateNote({ ...input, revision }));
  assert.throws(() => validateNote({ ...input, teamId: 'other' }));
  assert.throws(() => validateNote({ hint: 'a', day: input.day, revision: 0 }));
});
test('dates et forme des liens : aucune vérification HMAC côté navigateur', () => {
  assert.equal(validDay('2024-02-29'), true);
  for (const day of ['2026-02-29', '2026-13-01', '0000-01-01', '2026-1-01', '2026-04-31']) assert.equal(validDay(day), false);
  assert.equal(TEAM_PATTERN.test('a'.repeat(64)), true);
  assert.equal(TEAM_PATTERN.test('A'.repeat(64)), false);
  assert.equal(TOKEN_PATTERN.test('eyJ2IjoxfQ.' + 'x'.repeat(43)), true);
  assert.equal(TOKEN_PATTERN.test('token/path.' + 'x'.repeat(43)), false);
});
test('réponses serveur filtrées et validées, doublons et notes hors équipe rejetés', () => {
  const data = { team: { id: 'a'.repeat(64), name: 'Équipe', roster: [{ id: 'alice', name: '<script>alert(1)</script>', present: false }] }, day: input.day, hints: [{ participantId: 'alice', hint: 'Note', revision: 1 }], history: [], privateSecret: 'must-not-forward' };
  const parsed = parsePortal(data);
  assert.equal(parsed.team.roster[0].name, '<script>alert(1)</script>');
  assert.equal('privateSecret' in parsed, false);
  assert.throws(() => parsePortal({ ...data, hints: [{ participantId: 'other', hint: 'Note', revision: 1 }] }));
  assert.throws(() => parsePortal({ ...data, team: { ...data.team, roster: [...data.team.roster, ...data.team.roster] } }));
  assert.throws(() => parseNotes({ day: input.day, hints: [...data.hints, ...data.hints] }));
  assert.throws(() => parsePortal({ ...data, history: [{ id: 'r', completedAt: 'yesterday', people: [] }] }));
});
test('optional server note timestamps are validated and never part of writes', () => {
  const hint = { participantId: 'alice', hint: 'Point du jour', revision: 1 };
  assert.deepEqual(parseNotes({ day: input.day, hints: [hint] }).hints[0], hint);
  assert.equal(parseNotes({ day: input.day, hints: [{ ...hint, updatedAt: '2026-10-16T14:00:00+04:00' }] }).hints[0].updatedAt, '2026-10-16T10:00:00.000Z');
  assert.equal(parseNotes({ day: input.day, hints: [{ ...hint, updatedAt: null }] }).hints[0].updatedAt, undefined);
  for (const updatedAt of ['yesterday', '2026-10-16', 123, '2026-13-99T10:00:00Z']) assert.throws(() => parseNotes({ day: input.day, hints: [{ ...hint, updatedAt }] }));
  assert.throws(() => validateNote({ ...input, updatedAt: '2026-10-16T10:00:00Z' }));
});