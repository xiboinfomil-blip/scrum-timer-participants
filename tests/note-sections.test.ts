import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNoteSections, serializeNoteSections } from '../src/lib/note-sections.ts';

test('three daily sections round-trip Markdown through the existing hint field', () => {
  const sections = { recent: '**Livré**\n\n- API', now: '*Tests*', later: 'Déployer 😀' };
  const value = serializeNoteSections(sections);
  assert.deepEqual(parseNoteSections(value), sections);
  assert.match(value, /^\*\*Récemment\*\*/);
});

test('legacy notes and ambiguous labels are preserved without loss', () => {
  for (const value of ['Ancienne note\nDeuxième ligne', '**Gras**', 'Introduction\n\n**Maintenant**\n\nTexte', '**Récemment**\n\nA\n\n**Récemment**\n\nB']) {
    assert.equal(parseNoteSections(value).recent, value);
  }
});

test('optional sections, empty notes and typing whitespace', () => {
  assert.equal(serializeNoteSections({ recent: '', now: '', later: '  ' }), '');
  assert.equal(serializeNoteSections({ recent: '', now: 'En cours ', later: '' }), '**Maintenant**\n\nEn cours ');
  assert.deepEqual(parseNoteSections('**Ensuite**\n\nProchaine étape'), { recent: '', now: '', later: 'Prochaine étape' });
});