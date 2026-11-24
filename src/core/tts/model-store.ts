// Downloads model files once and keeps them in the browser's Cache Storage so the app works offline afterwards.
const CACHE = 'book-listener-models-v1';

export interface Progress { loaded: number; total: number }

export async function fetchCached(url: string, onProgress?: (p: Progress) => void): Promise<ArrayBuffer> {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(url);
  if (hit) return hit.arrayBuffer();
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}) for ${url.split('/').pop()}`);
  const total = Number(res.headers.get('content-length') ?? 0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress?.({ loaded, total: total || loaded });
  }
  const buf = new Uint8Array(loaded);
  let o = 0;
  for (const c of chunks) { buf.set(c, o); o += c.length; }
  await cache.put(url, new Response(buf, { headers: { 'content-type': 'application/octet-stream' } }));
  return buf.buffer;
}

export async function isCached(url: string): Promise<boolean> {
  return !!(await (await caches.open(CACHE)).match(url));
}

export async function deleteCached(url: string): Promise<void> {
  await (await caches.open(CACHE)).delete(url);
}

export async function deleteAllModels(): Promise<void> {
  await caches.delete(CACHE);
}

export async function cachedUrls(): Promise<Array<{ url: string; size: number }>> {
  const cache = await caches.open(CACHE);
  const out: Array<{ url: string; size: number }> = [];
  for (const req of await cache.keys()) {
    const r = await cache.match(req);
    out.push({ url: req.url, size: Number(r?.headers.get('content-length') ?? (await r?.clone().arrayBuffer())?.byteLength ?? 0) });
  }
  return out;
}
