import assert from 'node:assert/strict';
import test from 'node:test';
import { boundedJson, masterEndpoint, sameOrigin } from '../src/lib/proxy-policy.ts';
test('destination unique, HTTPS production et loopback local seulement', () => {
  assert.equal(masterEndpoint('https://master.example')?.href, 'https://master.example/api/participant-portal');
  assert.equal(masterEndpoint('http://localhost:3000')?.pathname, '/api/participant-portal');
  for (const value of [undefined, '', 'http://master.example', 'https://user:pass@master.example', 'https://master.example/a', 'https://master.example/?url=evil', 'https://master.example/#evil', 'file:///a']) assert.equal(masterEndpoint(value), null);
});
test('PUT exige une origine exacte, pas de cookie ni CORS permissif', () => {
  assert.equal(sameOrigin('https://portal.example/api/team', 'https://portal.example', 'same-origin'), true);
  assert.equal(sameOrigin('https://portal.example/api/team', 'https://evil.example', 'cross-site'), false);
  assert.equal(sameOrigin('https://portal.example/api/team', null, null), false);
  assert.equal(sameOrigin('https://portal.example/api/team', 'null', null), false);
  assert.equal(sameOrigin('https://portal.example/api/team', 'https://portal.example.evil', null), false);
});
test('lecture JSON bornée sur octets réellement reçus même sans content-length', async () => {
  const stream = (value: string) => new Response(value).body;
  assert.deepEqual(await boundedJson(stream('{"a":1}'), 7), { a: 1 });
  await assert.rejects(boundedJson(stream('{"a":1}'), 6), /BODY_TOO_LARGE/);
  await assert.rejects(boundedJson(stream('not json'), 100));
  await assert.rejects(boundedJson(null, 100), /EMPTY_BODY/);
});