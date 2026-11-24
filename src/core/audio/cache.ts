// On-device cache of generated narration (16-bit audio per sentence), with a size cap and least-recently-used eviction.
import { tx, wrap } from '../store/db';

export interface CachedClip { pcm: Int16Array; sampleRate: number }
interface Meta { key: string; bytes: number; last: number; bookId: string }

export function cacheKey(engineVersion: string, voice: string, spoken: string): string {
  // cyrb53 x2 for a 106-bit key — plenty to avoid collisions across a few hundred thousand sentences
  const h = (seed: number) => {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    const s = `${engineVersion}|${voice}|${spoken}`;
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
  };
  return `${h(1)}${h(7)}`;
}

export class AudioCache {
  private bytes = -1;
  constructor(public limitBytes = 1.5 * 1024 ** 3) {}

  async get(key: string): Promise<CachedClip | undefined> {
    const rec = await tx('audio', 'readonly', (t) => wrap(t.objectStore('audio').get(key))) as { pcm: ArrayBuffer; sr: number } | undefined;
    if (!rec) return undefined;
    // touch (fire and forget)
    tx('ameta', 'readwrite', async (t) => {
      const m = await wrap(t.objectStore('ameta').get(key)) as Meta | undefined;
      if (m) { m.last = Date.now(); t.objectStore('ameta').put(m); }
    }).catch(() => {});
    return { pcm: new Int16Array(rec.pcm), sampleRate: rec.sr };
  }

  async has(key: string): Promise<boolean> {
    return !!(await tx('ameta', 'readonly', (t) => wrap(t.objectStore('ameta').getKey(key))));
  }

  async put(key: string, clip: CachedClip, bookId: string): Promise<void> {
    const copy = clip.pcm.slice().buffer;
    await tx(['audio', 'ameta'], 'readwrite', async (t) => {
      t.objectStore('audio').put({ pcm: copy, sr: clip.sampleRate }, key);
      t.objectStore('ameta').put({ key, bytes: copy.byteLength, last: Date.now(), bookId } satisfies Meta);
    });
    if (this.bytes >= 0) this.bytes += copy.byteLength;
    if ((this.bytes < 0 || this.bytes > this.limitBytes)) await this.evict();
  }

  async usage(): Promise<{ bytes: number; clips: number }> {
    const all = await tx('ameta', 'readonly', (t) => wrap(t.objectStore('ameta').getAll())) as Meta[];
    this.bytes = all.reduce((s, m) => s + m.bytes, 0);
    return { bytes: this.bytes, clips: all.length };
  }

  /** Remove the least recently used clips until the cache is at 85% of its cap. */
  async evict(): Promise<number> {
    const all = (await tx('ameta', 'readonly', (t) => wrap(t.objectStore('ameta').getAll())) as Meta[]).sort((a, b) => a.last - b.last);
    let total = all.reduce((s, m) => s + m.bytes, 0);
    this.bytes = total;
    if (total <= this.limitBytes) return 0;
    const target = this.limitBytes * 0.85;
    const drop: Meta[] = [];
    for (const m of all) { if (total <= target) break; drop.push(m); total -= m.bytes; }
    await tx(['audio', 'ameta'], 'readwrite', async (t) => { for (const m of drop) { t.objectStore('audio').delete(m.key); t.objectStore('ameta').delete(m.key); } });
    this.bytes = total;
    return drop.length;
  }

  async clearAll(): Promise<void> {
    await tx(['audio', 'ameta'], 'readwrite', async (t) => { t.objectStore('audio').clear(); t.objectStore('ameta').clear(); });
    this.bytes = 0;
  }

  async clearBook(bookId: string): Promise<void> {
    const all = (await tx('ameta', 'readonly', (t) => wrap(t.objectStore('ameta').getAll())) as Meta[]).filter((m) => m.bookId === bookId);
    await tx(['audio', 'ameta'], 'readwrite', async (t) => { for (const m of all) { t.objectStore('audio').delete(m.key); t.objectStore('ameta').delete(m.key); } });
    this.bytes = -1;
  }
}
