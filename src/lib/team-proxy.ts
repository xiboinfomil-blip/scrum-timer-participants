import { parseNotes, parsePortal, TOKEN_PATTERN, validateNote } from './contracts.ts';
import { boundedJson, REQUEST_LIMIT, RESPONSE_LIMIT, sameOrigin } from './proxy-policy.ts';

type TeamProxyConfig = { endpoint: string | URL; secret: string };
const headers = { 'Cache-Control': 'private, no-store, max-age=0', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
function error(status: number, code: string) { return Response.json({ error: code }, { status, headers }); }

/** Dependencies are injected so requests can be exercised without server configuration or network access. */
export function createTeamProxy(getConfig: () => TeamProxyConfig | null, fetchUpstream: typeof fetch = fetch) {
  async function proxy(request: Request, write: boolean) {
    const config = getConfig();
    if (!config) return error(503, 'CONFIGURATION_UNAVAILABLE');
    const token = request.headers.get('X-Team-Link');
    if (!token || !TOKEN_PATTERN.test(token)) return error(401, 'INVALID_LINK');
    if (new URL(request.url).search) return error(400, 'INVALID_REQUEST');
    if (write && !sameOrigin(request.url, request.headers.get('origin'), request.headers.get('sec-fetch-site'))) return error(403, 'ORIGIN_REJECTED');
    let body: string | undefined;
    if (write) {
      if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return error(415, 'INVALID_REQUEST');
      const length = request.headers.get('content-length');
      if (length && (!/^\d+$/.test(length) || Number(length) > REQUEST_LIMIT)) return error(413, 'BODY_TOO_LARGE');
      try { body = JSON.stringify(validateNote(await boundedJson(request.body, REQUEST_LIMIT))); }
      catch (e) { return error(e instanceof Error && e.message === 'BODY_TOO_LARGE' ? 413 : 400, 'INVALID_REQUEST'); }
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    request.signal.addEventListener('abort', abort, { once: true });
    if (request.signal.aborted) controller.abort();
    const timeout = setTimeout(abort, 12000);
    try {
      // The host and path are server-configured, never supplied by a browser.
      const upstream = await fetchUpstream(config.endpoint, {
        method: write ? 'PUT' : 'GET',
        headers: { 'X-Team-Link': token, Authorization: `Bearer ${config.secret}`, Accept: 'application/json', ...(write ? { 'Content-Type': 'application/json' } : {}) },
        body, cache: 'no-store', redirect: 'error', signal: controller.signal,
      });
      if (!upstream.ok) {
        await upstream.body?.cancel();
        if ([401, 403, 404].includes(upstream.status)) return error(401, 'INVALID_LINK');
        if (upstream.status === 409) return error(409, 'CONFLICT');
        if (upstream.status === 400 || upstream.status === 422) return error(400, 'INVALID_REQUEST');
        if (upstream.status === 429) return error(429, 'TEMPORARILY_UNAVAILABLE');
        return error(502, 'MASTER_UNAVAILABLE');
      }
      if (!upstream.headers.get('content-type')?.toLowerCase().includes('application/json')) {
        await upstream.body?.cancel();
        return error(502, 'MASTER_UNAVAILABLE');
      }
      const value = await boundedJson(upstream.body, RESPONSE_LIMIT);
      return Response.json(write ? parseNotes(value) : parsePortal(value), { headers });
    } catch { return error(502, 'MASTER_UNAVAILABLE'); }
    finally { clearTimeout(timeout); request.signal.removeEventListener('abort', abort); }
  }
  return {
    GET: (request: Request) => proxy(request, false),
    PUT: (request: Request) => proxy(request, true),
  };
}