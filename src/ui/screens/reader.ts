import { h, mount, clear } from '../dom';
import { app } from '../app';
import { addAnnotation, removeAnnotation, KIND_LABEL } from '../annot';
import { putAnnotation, putBook, uid } from '../../core/store/db';
import { notesToMarkdown, download } from '../../core/export/notes';
import { toast } from '../toast';
import type { Annotation, AnnotationKind, Block } from '../../core/types';
import type { NarSnapshot } from '../../core/audio/narrator';

let chapterId = -1;
let proof = false;
let follow = true;
let unsub: (() => void) | null = null;

export async function renderReader(root: HTMLElement) {
  unsub?.(); unsub = null;
  const n = app.narrator, b = app.book;
  if (!n || !b) {
    mount(root, h('div.eyebrow', null, 'Reader'), h('h1', { style: { marginTop: '12px' } }, 'No book open'),
      h('p.serif.muted', { style: { fontSize: '18px', lineHeight: '1.5' } }, 'Open a book from your Library to read along.'),
      h('button.btn.solid', { onclick: () => app.go('library') }, 'Go to Library'));
    return;
  }
  const cur0 = n.utts[n.snapshot().idx];
  if (chapterId < 0 || !b.chapters.some((c) => c.id === chapterId)) chapterId = cur0?.chapter ?? b.chapters[0].id;

  const spans = new Map<number, HTMLElement>(); // utterance index -> span
  const body = h('div.reader-body', { tabindex: -1 });
  const mini = h('div.mini');
  const sel = h('select', { 'aria-label': 'Chapter', onchange: () => { chapterId = Number(sel.value); draw(); body.scrollTop = 0; } },
    ...b.chapters.map((c) => h('option', { value: c.id, selected: c.id === chapterId }, `${c.title}${c.included ? '' : ' (not narrated)'}`)));
  const proofBtn = h('button.chip', { 'aria-pressed': String(proof), onclick: () => { proof = !proof; proofBtn.setAttribute('aria-pressed', String(proof)); draw(); } }, 'Proofread');
  const top = h('div.reader-top', null, sel, proofBtn);
  mount(root, top, body, mini);
  root.style.padding = '0'; root.style.display = 'flex'; root.style.flexDirection = 'column'; root.style.overflow = 'hidden';

  let blocks: Block[] = n.blocksByChapter.get(chapterId) ?? [];
  async function draw() {
    const { getChapterBlocks } = await import('../../core/store/db');
    blocks = n!.blocksByChapter.get(chapterId) ?? await getChapterBlocks(b!.id, chapterId);
    spans.clear(); clear(body);
    const ch = b!.chapters.find((c) => c.id === chapterId)!;
    const byBlock = new Map<number, Array<{ i: number; start: number; end: number }>>();
    n!.utts.forEach((u, i) => { if (u.chapter === chapterId) { const l = byBlock.get(u.block) ?? []; l.push({ i, start: u.start, end: u.end }); byBlock.set(u.block, l); } });
    const anns = app.annotations.filter((a) => a.chapter === chapterId);
    const prose = h('div.prose');
    if (proof) prose.appendChild(reviewList(anns, ch.title));
    let prevWasPara = false;
    for (const blk of blocks) {
      const el = renderBlock(blk, byBlock.get(blk.id) ?? [], anns, spans);
      if (blk.kind === 'paragraph') { if (prevWasPara) el.classList.add('cont'); prevWasPara = true; } else prevWasPara = false;
      prose.appendChild(el);
    }
    if (!blocks.length) prose.appendChild(h('p.muted', null, 'This section has no text.'));
    body.appendChild(prose);
    highlight(n!.snapshot(), true);
  }

  function renderBlock(blk: Block, utts: Array<{ i: number; start: number; end: number }>, anns: Annotation[], map: Map<number, HTMLElement>) {
    const tag = blk.kind === 'heading' ? (blk.level && blk.level <= 1 ? 'h2' : 'h3') : blk.kind === 'quote' ? 'blockquote' : 'p';
    const el = h(tag + (blk.kind === 'verse' ? '.verse' : '') + (blk.kind === 'footnote' ? '.fn' : ''), { dataset: { block: blk.id } });
    let pos = 0;
    const add = (txt: string, utt?: { i: number; start: number; end: number }) => {
      if (!txt) return;
      const sp = h('span.s', { dataset: utt ? { u: utt.i, s: utt.start, e: utt.end } : { s: pos, e: pos + txt.length, b: blk.id } }, txt);
      if (utt) map.set(utt.i, sp);
      const a = proof || true ? anns.find((x) => x.block === blk.id && x.start < pos + txt.length && x.end > pos) : undefined;
      if (a) sp.classList.add(a.kind === 'bookmark' ? 'a-bookmark' : a.kind === 'note' ? 'a-note' : 'a-flag');
      sp.addEventListener('click', () => openActions(blk, utt ?? { i: -1, start: pos, end: pos + txt.length }, txt));
      el.appendChild(sp);
    };
    for (const u of utts) {
      if (u.start > pos) { const gap = blk.text.slice(pos, u.start); el.appendChild(document.createTextNode(gap)); pos = u.start; }
      add(blk.text.slice(u.start, u.end), u); pos = u.end;
    }
    if (pos < blk.text.length) { const rest = blk.text.slice(pos); if (utts.length) el.appendChild(document.createTextNode(rest)); else add(rest); }
    return el;
  }

  function highlight(s: NarSnapshot, scroll = false) {
    body.querySelectorAll('.s.now').forEach((e: Element) => e.classList.remove('now'));
    const sp = spans.get(s.idx);
    if (sp) {
      sp.classList.add('now');
      const playing = s.state === 'playing' || s.state === 'buffering';
      if ((follow && playing) || scroll) {
        const r = sp.getBoundingClientRect(), br = body.getBoundingClientRect();
        if (r.top < br.top + 40 || r.bottom > br.bottom - 100) sp.scrollIntoView({ block: 'center', behavior: scroll ? 'auto' : 'smooth' });
      }
    }
    const playing = s.state === 'playing' || s.state === 'buffering';
    const u = n!.utts[s.idx];
    mount(mini,
      h('button.pp', { 'aria-label': playing ? 'Pause' : 'Play', onclick: () => playFromHere() }, playing ? 'Pause' : 'Play'),
      h('div.t', null, n!.chapterOf(s.idx)?.title ?? b!.title),
      h('button.linkish.small', { onclick: () => { if (u) { chapterId = u.chapter; sel.value = String(chapterId); draw(); } } }, 'Find my place'));
  }
  async function playFromHere() {
    if (n!.state === 'playing' || n!.state === 'buffering') { n!.pause(); return; }
    try { if (!app.voiceReady.has(b!.voice)) { toast('Getting the voice ready…'); await app.ensureVoice(b!.voice); } await n!.play(); }
    catch (e) { toast(`Couldn’t start: ${(e as Error).message}`); }
  }

  body.addEventListener('scroll', () => { /* manual scroll pauses auto-follow until next sentence change */ }, { passive: true });
  body.addEventListener('touchstart', () => { follow = false; setTimeout(() => (follow = true), 6000); }, { passive: true });

  let lastIdx = -1;
  unsub = n.subscribe((s) => {
    if (s.idx !== lastIdx || s.state !== 'loading') {
      const u = n.utts[s.idx];
      if (u && u.chapter !== chapterId && (s.state === 'playing' || s.state === 'buffering') && follow) { chapterId = u.chapter; sel.value = String(chapterId); void draw(); return; }
      highlight(s); lastIdx = s.idx;
    }
  });
  await draw();

  function openActions(blk: Block, utt: { i: number; start: number; end: number }, text: string) {
    body.querySelectorAll('.s.sel').forEach((e: Element) => e.classList.remove('sel'));
    document.querySelectorAll('.sheet.actions').forEach((e: Element) => e.remove());
    const narrated = utt.i >= 0;
    const note = h('textarea', { placeholder: 'Add a note (optional)', 'aria-label': 'Note' });
    const close = () => sheet.remove();
    const mk = (kind: AnnotationKind, label: string) => h('button.chip', { onclick: async () => { await addAnnotation(kind, blk.id, utt.start, utt.end, note.value.trim()); close(); toast(`${label} saved`); void draw(); } }, label);
    const sheet = h('div.sheet.actions', { role: 'dialog', 'aria-label': 'Passage actions' },
      h('div.serif', { style: { fontSize: '16px', lineHeight: '1.45', maxHeight: '4.4em', overflow: 'hidden', color: 'var(--muted)' } }, text),
      h('div.row', null,
        narrated ? h('button.btn.solid.sm', { onclick: async () => { close(); n!.seekTo(utt.i); await playFromHere(); } }, 'Play from here')
          : h('span.small.muted', null, 'This section is not narrated. Include it in Settings.'),
        h('button.btn.quiet.sm', { onclick: close }, 'Close')),
      note,
      h('div.row', null, mk('bookmark', 'Bookmark'), mk('note', 'Note'), mk('awkward', 'Awkward'), mk('repetition', 'Repetition'), mk('fact', 'Check fact')),
      h('div.row', null, h('button.chip', { onclick: () => { close(); pronounceSheet(text); } }, 'Fix a pronunciation…')));
    document.body.appendChild(sheet);
  }

  function pronounceSheet(passage: string) {
    const words = [...new Set(passage.match(/[\p{L}’'-]{3,}/gu) ?? [])].slice(0, 14);
    const word = h('input.field', { placeholder: 'Word as written', 'aria-label': 'Word as written' });
    const say = h('input.field', { placeholder: 'How it should sound, e.g. Shiv-awn', 'aria-label': 'How it should sound', style: { marginTop: '8px' } });
    const s = h('div.sheet', { role: 'dialog' }, h('div.eyebrow', null, 'Fix a pronunciation'),
      h('div.row', null, ...words.map((w) => h('button.chip', { onclick: () => { word.value = w; say.focus(); } }, w))),
      h('div', { style: { marginTop: '10px' } }, word, say),
      h('p.small.muted', null, 'Spell it the way you would say it, or use IPA between slashes, like /ʃɪˈvɔːn/. Applies to this book.'),
      h('div.row', null,
        h('button.btn.solid', { onclick: async () => {
          if (!word.value.trim() || !say.value.trim()) return;
          b!.pronunciation = [...b!.pronunciation.filter((r) => r.match.toLowerCase() !== word.value.trim().toLowerCase()), { id: uid(), match: word.value.trim(), say: say.value.trim() }];
          await putBook(b!); s.remove(); toast('Rule saved. Rebuilding narration…'); await app.refreshNarration(); void draw();
        } }, 'Save rule'),
        h('button.btn.quiet', { onclick: () => s.remove() }, 'Cancel')));
    document.body.appendChild(s);
  }

  function reviewList(anns: Annotation[], chTitle: string) {
    const wrap = h('div', { style: { borderBottom: '1px solid var(--rule)', marginBottom: '1.4em', paddingBottom: '1em', fontFamily: 'var(--sans)', fontSize: '14px', lineHeight: '1.45' } },
      h('div.eyebrow', null, `Review · ${chTitle}`),
      anns.length ? null : h('p.muted', null, 'Nothing flagged in this chapter. Tap any sentence to bookmark it or flag something to fix.'));
    for (const a of anns.sort((x, y) => x.block - y.block)) {
      wrap.appendChild(h('div', { style: { padding: '10px 0', borderTop: '1px solid var(--rule)', opacity: a.resolved ? '.5' : '1' } },
        h('div.small', null, h('strong', null, KIND_LABEL[a.kind]), a.resolved ? ' · resolved' : ''),
        h('div.serif', { style: { margin: '4px 0', fontSize: '15px' } }, `“${a.quote.slice(0, 160)}${a.quote.length > 160 ? '…' : ''}”`),
        a.note ? h('div', null, a.note) : null,
        h('div.row', { style: { display: 'flex', gap: '8px', marginTop: '6px' } },
          h('button.linkish.small', { onclick: () => { const i = n!.utts.findIndex((u) => u.block === a.block && u.end > a.start); if (i >= 0) { n!.seekTo(i); toast('Moved to that passage'); } } }, 'Go there'),
          h('button.linkish.small', { onclick: async () => { await putAnnotation({ ...a, resolved: !a.resolved }); await app.refreshAnnotations(); void draw(); } }, a.resolved ? 'Reopen' : 'Resolve'),
          h('button.linkish.small', { onclick: async () => { await removeAnnotation(a.id); void draw(); } }, 'Delete'))));
    }
    wrap.appendChild(h('div.row', { style: { display: 'flex', gap: '8px', marginTop: '10px' } },
      h('button.btn.quiet.sm', { onclick: () => {
        const md = notesToMarkdown(b!, app.annotations, (c) => n!.blocksByChapter.get(c) ?? []);
        download(`${b!.title.replace(/[^\p{L}\p{N}]+/gu, '-')}-notes.md`, md, 'text/markdown');
      } }, 'Export all notes (.md)')));
    return wrap;
  }
}
