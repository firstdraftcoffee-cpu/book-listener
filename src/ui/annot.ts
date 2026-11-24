import { app } from './app';
import { putAnnotation, deleteAnnotation, uid } from '../core/store/db';
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
  bookmark: 'Bookmark', note: 'Note', awkward: 'Awkward phrasing', repetition: 'Repetition', pronunciation: 'Mispronounced', fact: 'Check fact',
};
