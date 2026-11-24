import { h, mount, fmtDuration, fmtDate } from '../dom';
import { app } from '../app';
import { settings } from '../settings';
import { deleteBook, listBooks, saveDocument } from '../../core/store/db';
import { importFile, detectKind } from '../../core/doc';
import { parseText } from '../../core/doc/txt';
import type { BookRecord, ParsedDocument } from '../../core/types';
import { toast, confirmDialog } from '../toast';

let busy: { msg: string; frac: number } | null = null;
let notices: string[] = [];
let books: BookRecord[] = [];

export async function renderLibrary(root: HTMLElement) {
  books = (await listBooks()).sort((a, b) => b.pos.updatedAt - a.pos.updatedAt);
  draw(root);
}

function secPerWord() { return 0.4; } // rough planning figure (about 150 spoken words a minute) until real clips are measured

function draw(root: HTMLElement) {
  const file = h('input', { type: 'file', accept: '.pdf,.epub,.docx,.txt,.md,.markdown,application/pdf,application/epub+zip', hidden: true, multiple: true,
    onchange: async () => { const fs = [...(file.files ?? [])]; file.value = ''; for (const f of fs) await add(f, root); } });
  mount(root,
    h('div.masthead', null,
      h('div', null, h('div.eyebrow', null, 'Private audiobook reader'), h('h1', { style: { marginTop: '10px' } }, 'Book ', h('em', null, 'Listener'))),
    ),
    h('p.muted', { style: { fontFamily: 'var(--serif)', fontSize: '17px', lineHeight: '1.5', margin: '14px 0 0' } },
      'Your manuscripts stay on this device. Nothing is uploaded, ever.'),
    h('div.add', null,
      h('button.btn.solid', { onclick: () => file.click(), disabled: !!busy }, 'Add a book'),
      h('button.btn.quiet', { onclick: () => pasteSheet(root), disabled: !!busy }, 'Paste text'), file),
    busy ? h('div', { 'aria-live': 'polite' }, h('div.small.muted', null, busy.msg), h('div.bar', null, h('i', { style: { width: `${Math.round(busy.frac * 100)}%` } }))) : null,
    ...notices.map((n) => h('div.notice' + (/scanned|OCR|No readable/i.test(n) ? '.warn' : ''), null, n)),
    books.length ? h('div', { style: { marginTop: '14px' } }, ...books.map((b) => row(b, root)))
      : h('div.empty', null, 'No books yet. Add a PDF, EPUB, Word file, text file or Markdown file and it will be ready to listen to in a moment. You can also drop a file anywhere on this page.'),
  );
}

function row(b: BookRecord, root: HTMLElement) {
  const included = b.chapters.filter((c) => c.included);
  const totalW = included.reduce((s, c) => s + c.words, 0) || 1;
  let before = 0;
  for (const c of included) { if (b.pos.block > c.lastBlock) before += c.words; else if (b.pos.block >= c.firstBlock) { before += c.words * ((b.pos.block - c.firstBlock) / Math.max(1, c.lastBlock - c.firstBlock + 1)); break; } else break; }
  const frac = Math.min(1, before / totalW);
  const left = (totalW - before) * secPerWord() / (b.speed || 1);
  const cur = included.find((c) => b.pos.block >= c.firstBlock && b.pos.block <= c.lastBlock);
  return h('div', { style: { position: 'relative' } },
    h('button.book', { 'aria-label': `Open ${b.title}`, onclick: async () => { await app.open(b.id); app.go('reader'); } },
      h('div.spine', { 'aria-hidden': 'true' }, h('i', { style: { height: `${Math.max(3, frac * 100)}%` } })),
      h('div', null, h('h3', null, b.title),
        b.author ? h('div.small.muted', { style: { marginTop: '3px' } }, b.author) : null,
        h('div.meta', null, `${Math.round(b.words / 100) / 10}k words · ${included.length} chapters`),
        h('div.meta', null, frac > 0.002 ? `${cur ? cur.title + ' · ' : ''}${Math.round(frac * 100)}% · about ${fmtDuration(left)} left · ${fmtDate(b.pos.updatedAt)}` : `About ${fmtDuration(left)} to listen`)),
      h('span')),
    h('button.del', { style: { position: 'absolute', right: '0', top: '14px' }, 'aria-label': `Delete ${b.title}`, onclick: async (e: Event) => {
      e.stopPropagation();
      if (!(await confirmDialog(`Delete “${b.title}” and its notes and saved audio from this device?`, 'Delete', true))) return;
      if (app.book?.id === b.id) { app.narrator?.dispose(); app.narrator = undefined; app.book = undefined; }
      await deleteBook(b.id); toast('Deleted'); renderLibrary(root);
    } }, 'Delete'));
}

async function add(f: File, root: HTMLElement) {
  if (!detectKind(f.name, f.type)) { toast(`“${f.name}” isn’t a PDF, EPUB, Word, text or Markdown file.`); return; }
  notices = [];
  busy = { msg: `Reading ${f.name}…`, frac: 0.02 }; draw(root);
  try {
    const doc = await importFile(f, (p) => { busy = { msg: `Reading ${f.name}… ${Math.round(p * 100)}%`, frac: p }; draw(root); });
    await finish(doc, root);
  } catch (e) { busy = null; notices = [`Couldn’t read ${f.name}: ${(e as Error).message}`]; draw(root); }
}
async function finish(doc: ParsedDocument, root: HTMLElement) {
  busy = { msg: 'Saving to this device…', frac: 0.97 }; draw(root);
  const words = doc.chapters.reduce((s, c) => s + c.words, 0);
  if (!words) { busy = null; notices = ['No readable text was found. If this is a scanned PDF, it needs optical character recognition (OCR), which is not built in yet.']; draw(root); return; }
  const rec = await saveDocument(doc, { voice: settings().voice, speed: settings().speed });
  busy = null;
  const skipped = doc.chapters.filter((c) => !c.included).map((c) => c.title);
  notices = [`Added “${rec.title}”: ${doc.chapters.length} chapters, ${words.toLocaleString('en-IE')} words.`,
    ...(skipped.length ? [`Left out of narration by default: ${skipped.join(', ')}. You can change this in Settings.`] : []), ...doc.warnings];
  try { await navigator.storage?.persist?.(); } catch { /* optional */ }
  await renderLibrary(root);
}

function pasteSheet(root: HTMLElement) {
  const title = h('input.field', { placeholder: 'Title (optional)', 'aria-label': 'Title' });
  const ta = h('textarea', { placeholder: 'Paste your text here', 'aria-label': 'Text to read', style: { minHeight: '180px' } });
  const s = h('div.sheet', null, h('div.eyebrow', null, 'Paste text'), h('div', { style: { marginTop: '10px' } }, title), ta,
    h('div.row', null,
      h('button.btn.solid', { onclick: async () => {
        const t = ta.value.trim(); if (!t) return;
        s.remove();
        const doc = parseText(t, title.value.trim() || 'Pasted text', 'txt'); doc.format = 'paste';
        await finish(doc, root);
      } }, 'Add'),
      h('button.btn.quiet', { onclick: () => s.remove() }, 'Cancel')));
  document.body.appendChild(s); ta.focus();
}

// drop a file anywhere
export function enableDrop(root: HTMLElement) {
  const over = (e: DragEvent) => { if (app.screen !== 'library') return; e.preventDefault(); root.classList.add('drop-on'); };
  window.addEventListener('dragover', over);
  window.addEventListener('dragleave', () => root.classList.remove('drop-on'));
  window.addEventListener('drop', async (e) => {
    if (app.screen !== 'library') return;
    e.preventDefault(); root.classList.remove('drop-on');
    for (const f of [...(e.dataTransfer?.files ?? [])]) await add(f, root);
  });
}
