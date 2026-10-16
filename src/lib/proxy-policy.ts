export const REQUEST_LIMIT = 8192;
export const RESPONSE_LIMIT = 2 * 1024 * 1024;
export function masterEndpoint(raw: string | undefined): URL | null {
  try {
    const url = new URL(raw ?? '');
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password
      || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) return null;
    return new URL('/api/participant-portal', url.origin);
  } catch { return null; }
}
export function sameOrigin(requestUrl: string, origin: string | null, fetchSite: string | null): boolean {
  if (!origin || (fetchSite && !['same-origin', 'none'].includes(fetchSite))) return false;
  try { return new URL(origin).origin === origin && origin === new URL(requestUrl).origin; } catch { return false; }
}
export async function boundedJson(stream: ReadableStream<Uint8Array> | null, limit: number): Promise<unknown> {
  if (!stream) throw new Error('EMPTY_BODY');
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error('BODY_TOO_LARGE'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(all));
}