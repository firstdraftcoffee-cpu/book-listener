import { app } from './app';
import { putAnnotation, deleteAnnotation, uid } from '../core/store/db';
import { toast } from './toast';
import type { Annotation, AnnotationKind } from '../core/types';

export async function addAnnotation(kind: AnnotationKind, block: number, start: number, end: number, note = ''): Promise<Annotation | undefined> {
  const n = app.narrator, b = app.book;
  if (!n || !b) return;
  const blocks = [...n.blocksByChapter.values()].flat();
  const blk = blocks.find((x) => x.id === block);
  if (!blk) return;
  const a: Annotation = {
    id: uid(), bookId: b.id, kind, block, start, end, note, chapter: blk.chapter, createdAt: Date.now(),
    quote: blk.text.slice(start, end).slice(0, 600),
  };
  await putAnnotation(a);
  await app.refreshAnnotations();
  return a;
}
export async function removeAnnotation(id: string) { await deleteAnnotation(id); await app.refreshAnnotations(); }
export const KIND_LABEL: Record<AnnotationKind, string> = {
  bookmark: 'Bookmark', flag: 'Flagged while listening', note: 'Note', awkward: 'Awkward phrasing', repetition: 'Repetition', pronunciation: 'Mispronounced', fact: 'Check fact',
};

/** Mark the spot you have just heard: the sentence playing now and the one before it (you always react a moment late). */
export async function flagHere(): Promise<void> {
  const n = app.narrator;
  if (!n) return;
  const i = n.snapshot().idx;
  const u = n.utts[i];
  if (!u) return;
  const p = n.utts[i - 1];
  const start = p && p.block === u.block ? p.start : u.start;
  await addAnnotation('flag', u.block, start, u.end, '');
  toast(`Flagged (${app.annotations.filter((a) => !a.resolved && a.kind !== 'bookmark').length} to review)`);
}
