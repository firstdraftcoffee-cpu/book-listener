// Everything the app stores lives in IndexedDB on this device. Nothing here is ever sent anywhere.
import type { Annotation, Block, BookRecord, ParsedDocument } from '../types';

const NAME = 'book-listener';
const VERSION = 1;
let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(NAME, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore('books', { keyPath: 'id' });
      db.createObjectStore('chunks');
      db.createObjectStore('covers');
      const ann = db.createObjectStore('ann', { keyPath: 'id' });
      ann.createIndex('bookId', 'bookId');
      db.createObjectStore('audio');
      const am = db.createObjectStore('ameta', { keyPath: 'key' });
      am.createIndex('last', 'last');
      db.createObjectStore('kv');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}

function wrap<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}

async function tx<T>(stores: string | string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => Promise<T> | T): Promise<T> {
  const db = await open();
  const t = db.transaction(stores, mode);
  const done = new Promise<void>((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
  const out = await fn(t);
  await done;
  return out;
}

export const uid = () => crypto.randomUUID();

// ---------- books
export async function saveDocument(doc: ParsedDocument, defaults: { voice: string; speed: number }): Promise<BookRecord> {
  const id = uid();
  const words = doc.chapters.reduce((s, c) => s + c.words, 0);
  const rec: BookRecord = {
    id, title: doc.title, author: doc.author, format: doc.format, addedAt: Date.now(), words,
    chapters: doc.chapters, blockCount: doc.blocks.length, hasCover: !!doc.cover,
    voice: defaults.voice, speed: defaults.speed, pos: { block: doc.chapters[0]?.firstBlock ?? 0, offset: 0, updatedAt: Date.now(), seconds: 0 },
    listened: 0, segVersion: 1, pronunciation: [],
  };
  await tx(['books', 'chunks', 'covers'], 'readwrite', (t) => {
    t.objectStore('books').put(rec);
    for (const c of doc.chapters) {
      t.objectStore('chunks').put(doc.blocks.filter((b) => b.chapter === c.id), `${id}:${c.id}`);
    }
    if (doc.cover) t.objectStore('covers').put(doc.cover, id);
  });
  return rec;
}
export const listBooks = (): Promise<BookRecord[]> => tx('books', 'readonly', (t) => wrap(t.objectStore('books').getAll()));
export const getBook = (id: string): Promise<BookRecord | undefined> => tx('books', 'readonly', (t) => wrap(t.objectStore('books').get(id)));
export const putBook = (b: BookRecord): Promise<void> => tx('books', 'readwrite', async (t) => { t.objectStore('books').put(b); });
export const getChapterBlocks = (bookId: string, chapter: number): Promise<Block[]> =>
  tx('chunks', 'readonly', async (t) => (await wrap(t.objectStore('chunks').get(`${bookId}:${chapter}`))) ?? []);
export const getCover = (id: string): Promise<Blob | undefined> => tx('covers', 'readonly', (t) => wrap(t.objectStore('covers').get(id)));

export async function deleteBook(id: string): Promise<void> {
  const book = await getBook(id);
  const anns = await listAnnotations(id);
  const metas = await tx('ameta', 'readonly', (t) => wrap(t.objectStore('ameta').getAll())) as Array<{ key: string; bookId: string }>;
  await tx(['books', 'chunks', 'covers', 'ann', 'audio', 'ameta'], 'readwrite', (t) => {
    t.objectStore('books').delete(id);
    for (const c of book?.chapters ?? []) t.objectStore('chunks').delete(`${id}:${c.id}`);
    t.objectStore('covers').delete(id);
    for (const a of anns) t.objectStore('ann').delete(a.id);
    for (const m of metas) if (m.bookId === id) { t.objectStore('audio').delete(m.key); t.objectStore('ameta').delete(m.key); }
  });
}

// ---------- annotations
export const listAnnotations = (bookId: string): Promise<Annotation[]> =>
  tx('ann', 'readonly', (t) => wrap(t.objectStore('ann').index('bookId').getAll(bookId)));
export const putAnnotation = (a: Annotation): Promise<void> => tx('ann', 'readwrite', async (t) => { t.objectStore('ann').put(a); });
export const deleteAnnotation = (id: string): Promise<void> => tx('ann', 'readwrite', async (t) => { t.objectStore('ann').delete(id); });

// ---------- settings
export const kvGet = <T>(k: string): Promise<T | undefined> => tx('kv', 'readonly', (t) => wrap(t.objectStore('kv').get(k)));
export const kvSet = (k: string, v: unknown): Promise<void> => tx('kv', 'readwrite', async (t) => { t.objectStore('kv').put(v, k); });

// ---------- wipe
export async function deleteEverything(): Promise<void> {
  const db = await open();
  db.close();
  dbp = null;
  await new Promise<void>((res, rej) => { const r = indexedDB.deleteDatabase(NAME); r.onsuccess = () => res(); r.onerror = () => rej(r.error); r.onblocked = () => res(); });
  try { await caches.delete('book-listener-models-v1'); } catch { /* none */ }
  for (const k of await caches.keys()) if (k.startsWith('book-listener')) await caches.delete(k);
  try { localStorage.clear(); } catch { /* none */ }
  try {
    const root = await navigator.storage.getDirectory();
    for await (const name of (root as any).keys()) await root.removeEntry(name, { recursive: true });
  } catch { /* OPFS may be unavailable */ }
}

export { tx, wrap, open };
