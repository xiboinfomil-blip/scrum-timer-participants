import assert from 'node:assert/strict';
import test from 'node:test';
import { createTeamProxy } from '../src/lib/team-proxy.ts';
import { REQUEST_LIMIT, RESPONSE_LIMIT } from '../src/lib/proxy-policy.ts';

// Reserved .invalid hosts and synthetic credentials only; every handler injects fetch.
const origin = 'https://portal.invalid';
const config = { endpoint: new URL('https://master.invalid/api/participant-portal'), secret: 'synthetic-server-secret' };
const token = `demo.${'A'.repeat(43)}`;
const note = { participantId: 'alice', hint: 'A note', day: '2026-10-19', revision: 0 };
const notes = { day: note.day, hints: [{ participantId: 'alice', hint: note.hint, revision: 1 }] };
const portal = {
  team: { id: 'a'.repeat(64), name: 'Team', roster: [{ id: 'alice', name: 'Alice', present: true }] },
  ...notes, history: [],
};
type Method = 'GET' | 'PUT';
function request(method: Method = 'GET', overrides: RequestInit = {}, query = '') {
  const headers = new Headers({ 'X-Team-Link': token });
  if (method === 'PUT') {
    headers.set('origin', origin);
    headers.set('sec-fetch-site', 'same-origin');
    headers.set('content-type', 'application/json');
  }
  return new Request(`${origin}/api/team${query}`, {
    method, headers, ...(method === 'PUT' ? { body: JSON.stringify(note) } : {}), ...overrides,
  });
}
function harness(reply: (input: Parameters<typeof fetch>[0], init: RequestInit) => Response | Promise<Response> = () => Response.json(portal)) {
  const calls: { input: Parameters<typeof fetch>[0]; init: RequestInit }[] = [];
  const fetchUpstream: typeof fetch = async (input, init) => {
    assert.ok(init);
    calls.push({ input, init });
    return reply(input, init);
  };
  return { handler: createTeamProxy(() => config, fetchUpstream), calls };
}
function securityHeaders(response: Response) {
  assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.equal(response.headers.get('set-cookie'), null);
}
async function error(response: Response, status: number, code: string) {
  assert.equal(response.status, status);
  securityHeaders(response);
  assert.deepEqual(await response.json(), { error: code });
}

test('configuration is checked first and re-read on every request, without fetching when absent', async () => {
  let available = false;
  let reads = 0;
  const fake = harness();
  const handler = createTeamProxy(() => { reads++; return available ? config : null; }, async () => {
    fake.calls.push({ input: config.endpoint, init: {} });
    return Response.json(portal);
  });
  await error(await handler.GET(new Request(`${origin}/api/team?invalid=1`)), 503, 'CONFIGURATION_UNAVAILABLE');
  await error(await handler.PUT(request('PUT')), 503, 'CONFIGURATION_UNAVAILABLE');
  assert.equal(fake.calls.length, 0);
  available = true;
  assert.equal((await handler.GET(request())).status, 200);
  assert.equal(reads, 3);
  assert.equal(fake.calls.length, 1);
});

test('both handlers reject missing or malformed tokens before query/body checks', async () => {
  const { handler, calls } = harness();
  for (const method of ['GET', 'PUT'] as const) {
    for (const value of [null, '', 'not-a-token', `demo.${'A'.repeat(42)}`, `${'a'.repeat(513)}.${'A'.repeat(43)}`, `bad/path.${'A'.repeat(43)}`]) {
      const req = request(method, {}, '?invalid=1');
      if (value === null) req.headers.delete('X-Team-Link');
      else req.headers.set('X-Team-Link', value);
      await error(await handler[method](req), 401, 'INVALID_LINK');
    }
  }
  assert.equal(calls.length, 0);
});

test('both handlers reject all query parameters, including destination and token overrides', async () => {
  const { handler, calls } = harness();
  for (const method of ['GET', 'PUT'] as const) {
    for (const query of ['?endpoint=https://other.invalid', '?token=other', '?x=']) {
      await error(await handler[method](request(method, {}, query)), 400, 'INVALID_REQUEST');
    }
  }
  assert.equal(calls.length, 0);
});

test('PUT rejects missing, opaque, noncanonical, foreign origins and cross-site metadata', async () => {
  const { handler, calls } = harness();
  for (const [suppliedOrigin, site] of [
    [null, null], ['null', null], ['https://other.invalid', 'cross-site'],
    [`${origin}/`, null], [`${origin}.evil.invalid`, null], [origin, 'cross-site'], [origin, 'same-site'],
  ]) {
    const req = request('PUT', { body: 'not-json' });
    if (suppliedOrigin === null) req.headers.delete('origin');
    else req.headers.set('origin', suppliedOrigin);
    if (site === null) req.headers.delete('sec-fetch-site');
    else req.headers.set('sec-fetch-site', site);
    await error(await handler.PUT(req), 403, 'ORIGIN_REJECTED');
  }
  assert.equal(calls.length, 0);
});

test('PUT accepts exact origin with absent, none, or same-origin fetch metadata', async () => {
  const { handler, calls } = harness(() => Response.json(notes));
  for (const site of [null, 'none', 'same-origin']) {
    const req = request('PUT');
    if (site === null) req.headers.delete('sec-fetch-site');
    else req.headers.set('sec-fetch-site', site);
    assert.equal((await handler.PUT(req)).status, 200);
  }
  assert.equal(calls.length, 3);
});

test('PUT enforces JSON media type before parsing or content-length checks', async () => {
  const { handler, calls } = harness();
  for (const type of [null, 'text/plain', 'application/problem+json', 'application/jsonp']) {
    const req = request('PUT', { body: 'invalid' });
    if (type === null) req.headers.delete('content-type');
    else req.headers.set('content-type', type);
    req.headers.set('content-length', `${REQUEST_LIMIT + 1}`);
    await error(await handler.PUT(req), 415, 'INVALID_REQUEST');
  }
  assert.equal(calls.length, 0);
});

test('PUT rejects malformed JSON, invalid UTF-8, empty bodies and invalid note contracts', async () => {
  const { handler, calls } = harness();
  for (const body of [null, '', '{', 'null', '[]', JSON.stringify({ ...note, extra: true }),
    JSON.stringify({ ...note, revision: -1 }), JSON.stringify({ ...note, hint: 'a\rb' }),
    JSON.stringify({ ...note, day: '2026-02-30' }), new Uint8Array([0xff])]) {
    await error(await handler.PUT(request('PUT', { body })), 400, 'INVALID_REQUEST');
  }
  assert.equal(calls.length, 0);
});

test('PUT rejects invalid declared lengths before reading the body', async () => {
  const { handler, calls } = harness();
  for (const length of ['-1', '1.5', 'NaN', '1e3', `${REQUEST_LIMIT + 1}`]) {
    const req = request('PUT');
    req.headers.set('content-length', length);
    await error(await handler.PUT(req), 413, 'BODY_TOO_LARGE');
    assert.equal(req.bodyUsed, false);
  }
  assert.equal(calls.length, 0);
});

test('PUT bounds actual streamed bytes even with absent or dishonest content-length and cancels overflow', async () => {
  const { handler, calls } = harness();
  for (const length of [null, '1']) {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(REQUEST_LIMIT + 1)); },
      cancel() { cancelled = true; },
    });
    const req = request('PUT', { body: stream, duplex: 'half' } as RequestInit);
    if (length !== null) req.headers.set('content-length', length);
    await error(await handler.PUT(req), 413, 'INVALID_REQUEST');
    assert.equal(cancelled, true);
  }
  assert.equal(calls.length, 0);
});

test('PUT accepts exactly the byte limit and canonicalizes the validated note', async () => {
  const { handler, calls } = harness(() => Response.json(notes));
  const body = JSON.stringify({ ...note, hint: '  A note  ' });
  const req = request('PUT', { body: body + ' '.repeat(REQUEST_LIMIT - Buffer.byteLength(body)) });
  req.headers.set('content-length', `${REQUEST_LIMIT}`);
  req.headers.set('content-type', 'Application/JSON; charset=utf-8');
  assert.equal((await handler.PUT(req)).status, 200);
  assert.equal(calls[0].init.body, JSON.stringify(note));
});

for (const method of ['GET', 'PUT'] as const) {
  test(`${method} forwards only server credentials and the team token to the fixed endpoint`, async () => {
    const { handler, calls } = harness(() => Response.json(method === 'GET' ? portal : notes));
    const req = request(method);
    req.headers.set('cookie', 'browser-session=do-not-forward');
    req.headers.set('authorization', 'Bearer browser-credential');
    req.headers.set('origin', origin);
    req.headers.set('x-forwarded-host', 'other.invalid');
    req.headers.set('x-team-id', 'other-team');
    const response = await handler[method](req);
    assert.equal(response.status, 200);
    securityHeaders(response);
    assert.equal(calls.length, 1);
    const { input, init } = calls[0];
    assert.equal(input, config.endpoint);
    assert.equal(init.method, method);
    assert.equal(init.cache, 'no-store');
    assert.equal(init.redirect, 'error');
    assert.ok(init.signal instanceof AbortSignal);
    assert.notEqual(init.signal, req.signal);
    assert.deepEqual(Object.fromEntries(new Headers(init.headers)), {
      accept: 'application/json', authorization: `Bearer ${config.secret}`, 'x-team-link': token,
      ...(method === 'PUT' ? { 'content-type': 'application/json' } : {}),
    });
    assert.equal(init.body, method === 'PUT' ? JSON.stringify(note) : undefined);
  });
}

test('GET preserves read behavior without requiring origin or JSON content type', async () => {
  const { handler } = harness();
  const req = request();
  req.headers.set('origin', 'https://other.invalid');
  req.headers.set('sec-fetch-site', 'cross-site');
  req.headers.set('content-type', 'text/plain');
  assert.equal((await handler.GET(req)).status, 200);
});

test('GET allowlists nested response fields and never forwards upstream headers', async () => {
  const value = {
    ...portal, secret: config.secret,
    team: { ...portal.team, secret: 'private', roster: [{ ...portal.team.roster[0], email: 'private' }] },
    hints: [{ ...notes.hints[0], secret: 'private', updatedAt: '2026-10-19T14:00:00+04:00' }],
    history: [{ id: 'round', completedAt: '2026-10-19T14:00:00+04:00', secret: 'private', people: [{
      id: 'alice', name: 'Alice', mood: 2, speakingSeconds: 30, budgetSeconds: 60,
      timeUp: false, score: null, meterTitle: null, secret: 'private',
    }] }],
  };
  const { handler } = harness(() => Response.json(value, { headers: {
    'set-cookie': 'upstream=private', 'authorization': 'private', 'location': 'https://other.invalid',
    'access-control-allow-origin': '*', 'x-private': 'private',
  } }));
  const response = await handler.GET(request());
  securityHeaders(response);
  for (const header of ['authorization', 'location', 'x-private']) assert.equal(response.headers.get(header), null);
  assert.deepEqual(await response.json(), {
    ...portal,
    hints: [{ ...notes.hints[0], updatedAt: '2026-10-19T10:00:00.000Z' }],
    history: [{ id: 'round', completedAt: '2026-10-19T10:00:00.000Z', people: [{
      id: 'alice', name: 'Alice', mood: 2, speakingSeconds: 30, budgetSeconds: 60,
      timeUp: false, score: null, meterTitle: null,
    }] }],
  });
});

test('PUT returns only validated notes, never upstream team data or private fields', async () => {
  const { handler } = harness(() => Response.json({
    ...portal, secret: config.secret, hints: [{ ...notes.hints[0], private: true }],
  }));
  const response = await handler.PUT(request('PUT'));
  securityHeaders(response);
  assert.deepEqual(await response.json(), notes);
});

for (const [status, expected, code] of [
  [401, 401, 'INVALID_LINK'], [403, 401, 'INVALID_LINK'], [404, 401, 'INVALID_LINK'],
  [409, 409, 'CONFLICT'], [400, 400, 'INVALID_REQUEST'], [422, 400, 'INVALID_REQUEST'],
  [429, 429, 'TEMPORARILY_UNAVAILABLE'], [500, 502, 'MASTER_UNAVAILABLE'],
  [503, 502, 'MASTER_UNAVAILABLE'], [302, 502, 'MASTER_UNAVAILABLE'],
] as const) {
  test(`upstream ${status} maps to ${expected}/${code} and cancels its untrusted body`, async () => {
    for (const method of ['GET', 'PUT'] as const) {
      let cancelled = false;
      const { handler } = harness(() => new Response(new ReadableStream({
        cancel() { cancelled = true; },
      }), { status, headers: { location: 'https://other.invalid', 'set-cookie': 'private=1' } }));
      await error(await handler[method](request(method)), expected, code);
      assert.equal(cancelled, true);
    }
  });
}

test('wrong upstream media type is cancelled, malformed/missing/invalid JSON is sanitized', async () => {
  for (const method of ['GET', 'PUT'] as const) {
    let cancelled = false;
    const wrongType = harness(() => new Response(new ReadableStream({ cancel() { cancelled = true; } }), {
      headers: { 'content-type': 'text/html' },
    }));
    await error(await wrongType.handler[method](request(method)), 502, 'MASTER_UNAVAILABLE');
    assert.equal(cancelled, true);
    for (const body of [null, '{private-error', '{}', new Uint8Array([0xff]), JSON.stringify({ ...notes, hints: [notes.hints[0], notes.hints[0]] })]) {
      const { handler } = harness(() => new Response(body, { headers: { 'content-type': 'application/json' } }));
      await error(await handler[method](request(method)), 502, 'MASTER_UNAVAILABLE');
    }
  }
});

test('GET rejects contract-invalid team data rather than returning partial data', async () => {
  for (const value of [
    { ...portal, hints: [{ ...notes.hints[0], participantId: 'outsider' }] },
    { ...portal, team: { ...portal.team, roster: [...portal.team.roster, ...portal.team.roster] } },
    { ...portal, history: [{ id: 'round', completedAt: 'invalid', people: [] }] },
  ]) {
    const { handler } = harness(() => Response.json(value));
    await error(await handler.GET(request()), 502, 'MASTER_UNAVAILABLE');
  }
});

test('upstream response limit counts actual bytes, cancels overflow and accepts exact limit', async () => {
  let cancelled = false;
  const oversized = harness(() => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(RESPONSE_LIMIT + 1)); },
    cancel() { cancelled = true; },
  }), { headers: { 'content-type': 'application/json', 'content-length': '1' } }));
  await error(await oversized.handler.GET(request()), 502, 'MASTER_UNAVAILABLE');
  assert.equal(cancelled, true);
  const body = JSON.stringify(portal);
  const exact = harness(() => new Response(body + ' '.repeat(RESPONSE_LIMIT - Buffer.byteLength(body)), {
    headers: { 'content-type': 'APPLICATION/JSON; charset=utf-8' },
  }));
  assert.deepEqual(await (await exact.handler.GET(request())).json(), portal);
});

test('fetch failures including redirect rejection expose only MASTER_UNAVAILABLE', async () => {
  for (const failure of [new TypeError('fetch failed: private endpoint'), new TypeError('redirect count exceeded')]) {
    const { handler, calls } = harness(() => { throw failure; });
    await error(await handler.GET(request()), 502, 'MASTER_UNAVAILABLE');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init.redirect, 'error');
  }
});

function abortingFetch(init: RequestInit): Promise<Response> {
  return new Promise((_, reject) => {
    const signal = init.signal!;
    const abort = () => reject(new DOMException('Synthetic upstream abort', 'AbortError'));
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}

test('already-aborted and subsequently-aborted requests propagate a distinct upstream signal', async () => {
  for (const preAborted of [true, false]) {
    const controller = new AbortController();
    if (preAborted) controller.abort();
    const { handler, calls } = harness((_, init) => abortingFetch(init));
    const req = request('GET', { signal: controller.signal });
    const pending = handler.GET(req);
    assert.notEqual(calls[0].init.signal, req.signal);
    if (!preAborted) controller.abort();
    await error(await pending, 502, 'MASTER_UNAVAILABLE');
    assert.equal(calls[0].init.signal?.aborted, true);
  }
});

test('upstream timeout aborts at exactly 12 seconds without real waiting', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { handler, calls } = harness((_, init) => abortingFetch(init));
  const pending = handler.GET(request());
  t.mock.timers.tick(11999);
  assert.equal(calls[0].init.signal?.aborted, false);
  t.mock.timers.tick(1);
  await error(await pending, 502, 'MASTER_UNAVAILABLE');
  assert.equal(calls[0].init.signal?.aborted, true);
});

test('success and failure clear timeout and detach the incoming abort listener', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const fail of [false, true]) {
    const controller = new AbortController();
    const req = request('GET', { signal: controller.signal });
    const remove = t.mock.method(req.signal, 'removeEventListener');
    const { handler, calls } = harness(() => {
      if (fail) throw new Error('Synthetic failure');
      return Response.json(portal);
    });
    assert.equal((await handler.GET(req)).status, fail ? 502 : 200);
    assert.equal(remove.mock.callCount(), 1);
    assert.equal(remove.mock.calls[0].arguments[0], 'abort');
    t.mock.timers.tick(12000);
    controller.abort();
    assert.equal(calls[0].init.signal?.aborted, false);
  }
});