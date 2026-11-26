import type { Annotation, BookRecord, Block } from '../types';

const LABEL: Record<string, string> = { flag: 'Flagged while listening', bookmark: 'Bookmark', note: 'Note', awkward: 'Awkward phrasing', repetition: 'Repetition', pronunciation: 'Mispronounced', fact: 'Check fact' };

/** A Markdown file of every note and flag, in book order, each with the passage and where it is. */
export function notesToMarkdown(book: BookRecord, anns: Annotation[], blocksOf: (chapter: number) => Block[]): string {
  const out: string[] = [`# Listening notes: ${book.title}`, ''];
  if (book.author) out.push(`By ${book.author}`, '');
  out.push(`${anns.length} item${anns.length === 1 ? '' : 's'}.`, '');
  for (const ch of book.chapters) {
    const list = anns.filter((a) => a.chapter === ch.id).sort((a, b) => a.block - b.block || a.start - b.start);
    if (!list.length) continue;
    out.push(`## ${ch.title}`, '');
    const blocks = blocksOf(ch.id);
    for (const a of list) {
      const within = Math.max(1, a.block - ch.firstBlock + 1);
      out.push(`**${LABEL[a.kind] ?? a.kind}** · paragraph ${within}${a.resolved ? ' · resolved' : ''}`);
      if (a.quote) out.push('', `> ${a.quote.replace(/\n+/g, ' ')}`);
      if (a.note) out.push('', a.note);
      void blocks;
      out.push('');
    }
  }
  return out.join('\n');
}

export function download(name: string, data: Blob | string, type = 'text/plain') {
  const blob = typeof data === 'string' ? new Blob([data], { type: type + ';charset=utf-8' }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
