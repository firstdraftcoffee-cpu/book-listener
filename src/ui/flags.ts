import { h } from './dom';
import { app } from './app';
import { removeAnnotation, KIND_LABEL } from './annot';
import { putAnnotation } from '../core/store/db';
import { pronounceSheet } from './pronounce';
import { toast } from './toast';

export const openFlags = () => app.annotations.filter((a) => !a.resolved && a.kind !== 'bookmark');

export function flagsSheet(onChange?: () => void) {
  const n = app.narrator!, b = app.book!;
  document.querySelectorAll('.sheet.flags').forEach((e: Element) => e.remove());
  const s = h('div.sheet.flags', { role: 'dialog', 'aria-label': 'Flagged spots', style: { maxHeight: '80vh', overflow: 'auto' } });
  const draw = () => {
    s.textContent = '';
    const list = openFlags().sort((x, y) => x.chapter - y.chapter || x.block - y.block || x.start - y.start);
    s.appendChild(h('div.eyebrow', null, `Flagged spots · ${list.length}`));
    if (!list.length) s.appendChild(h('p.small.muted', { style: { lineHeight: '1.5' } }, 'Nothing flagged. While listening, tap “Flag this spot” whenever something needs fixing.'));
    for (const a of list) {
      const ch = b.chapters.find((c) => c.id === a.chapter);
      s.appendChild(h('div', { style: { padding: '10px 0', borderTop: '1px solid var(--rule)' } },
        h('div.small', null, h('strong', null, KIND_LABEL[a.kind]), ` · ${ch?.title ?? ''}`),
        h('div.serif', { style: { margin: '4px 0', fontSize: '15px', lineHeight: '1.4' } }, `“${a.quote.slice(0, 220)}${a.quote.length > 220 ? '…' : ''}”`),
        a.note ? h('div.small', null, a.note) : null,
        h('div.row', { style: { display: 'flex', gap: '12px', marginTop: '6px', flexWrap: 'wrap' } },
          h('button.linkish.small', { onclick: () => { const i = n.utts.findIndex((u) => u.block === a.block && u.end > a.start); if (i >= 0) { n.seekTo(i); toast('Moved to that spot'); s.remove(); } } }, 'Go there'),
          h('button.linkish.small', { onclick: () => pronounceSheet(a.quote, draw) }, 'Fix pronunciation'),
          h('button.linkish.small', { onclick: async () => { await putAnnotation({ ...a, resolved: true }); await app.refreshAnnotations(); draw(); onChange?.(); } }, 'Done'),
          h('button.linkish.small', { onclick: async () => { await removeAnnotation(a.id); draw(); onChange?.(); } }, 'Delete'))));
    }
    s.appendChild(h('div.row', { style: { marginTop: '12px' } }, h('button.btn.quiet', { onclick: () => s.remove() }, 'Close')));
  };
  draw();
  document.body.appendChild(s);
}
