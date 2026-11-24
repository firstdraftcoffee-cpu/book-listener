import { h, mount, fmtDuration } from '../dom';
import { app } from '../app';
import { settings, updateSettings } from '../settings';
import { addAnnotation } from '../annot';
import { toast } from '../toast';
import { voiceById } from '../../core/tts/voices';
import type { NarSnapshot } from '../../core/audio/narrator';

let unsub: (() => void) | null = null;
let prep: { done: number; total: number; eta: number; label: string; signal: { cancelled: boolean } } | null = null;

export function renderPlayer(root: HTMLElement) {
  unsub?.(); unsub = null;
  const n = app.narrator, b = app.book;
  if (!n || !b) {
    mount(root, h('div.eyebrow', null, 'Player'), h('h1', { style: { marginTop: '12px' } }, 'Nothing playing'),
      h('p.serif.muted', { style: { fontSize: '18px', lineHeight: '1.5' } }, 'Choose a book in your Library and it will appear here.'),
      h('button.btn.solid', { onclick: () => app.go('library') }, 'Go to Library'));
    return;
  }
  const eyebrow = h('div.eyebrow', null, b.title);
  const title = h('div.now-title');
  const line = h('div.now-line', { 'aria-live': 'off' });
  const chap = h('input', { type: 'range', min: 0, max: 1000, step: 1, value: 0, 'aria-label': 'Position in this chapter' });
  const chapTrack = h('div.track', null, chap);
  const bookBar = h('div.bar', { 'aria-hidden': 'true' }, h('i'));
  const tChap = h('span'), tBook = h('span');
  const status = h('div.status', { role: 'status' });
  const playBtn = h('button.play', { 'aria-label': 'Play', onclick: () => start() }, 'Play');
  const speed = h('input', { type: 'range', min: 0.5, max: 2.5, step: 0.05, value: b.speed, 'aria-label': 'Narration speed' });
  const speedVal = h('div.val', null, `${b.speed.toFixed(2)}×`);
  const sleepRow = h('div.row', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' } });
  const prepBox = h('div');
  let dragging = false;

  async function start() {
    if (n!.state === 'playing' || n!.state === 'buffering') { n!.pause(); return; }
    try {
      const v = b!.voice;
      if (!app.voiceReady.has(v)) { status.textContent = 'Getting the voice ready…'; await app.ensureVoice(v); }
      await n!.play();
    } catch (e) {
      status.className = 'status err';
      status.textContent = navigator.onLine ? `Couldn’t load the voice: ${(e as Error).message}` : 'The voice hasn’t been downloaded yet and you’re offline. Connect once to download it; after that it works without internet.';
    }
  }
  const fill = () => speed.style.setProperty('--p', `${((Number(speed.value) - 0.5) / 2) * 100}%`);
  fill();
  speed.addEventListener('input', () => { speedVal.textContent = `${Number(speed.value).toFixed(2)}×`; fill(); });
  speed.addEventListener('change', () => { n!.setSpeed(Number(speed.value)); updateSettings({ speed: Number(speed.value) }); });
  chap.addEventListener('pointerdown', () => { dragging = true; });
  chap.addEventListener('change', () => {
    dragging = false;
    const [s, e] = n!.chapterRange(n!.snapshot().chapter);
    n!.seekTo(s + Math.round((Number(chap.value) / 1000) * Math.max(0, e - s - 1)));
  });

  const sleepBtn = (label: string, f: () => void, on: boolean) => h('button.chip', { 'aria-pressed': String(on), onclick: f }, label);
  function drawSleep(s: NarSnapshot) {
    mount(sleepRow,
      sleepBtn('Off', () => n!.setSleep(null), !s.sleep),
      ...[15, 30, 45, 60].map((m) => sleepBtn(`${m} min`, () => { n!.setSleep('minutes', m); toast(`Will stop in ${m} minutes`); }, s.sleep?.kind === 'minutes' && Math.abs(((s.sleep.endsAt ?? 0) - Date.now()) / 60000 - m) < 1.1)),
      sleepBtn('End of chapter', () => n!.setSleep('chapter'), s.sleep?.kind === 'chapter'));
  }

  let lastSleep = '';
  const update = (s: NarSnapshot) => {
    const ch = n!.chapterOf(s.idx);
    title.textContent = ch?.title ?? b!.title;
    const u = n!.utts[s.idx];
    if (u) {
      const blk = n!.blocksByChapter.get(u.chapter)?.find((x) => x.id === u.block);
      line.textContent = blk ? blk.text.slice(u.start, u.end) : '';
    }
    const playing = s.state === 'playing' || s.state === 'buffering';
    playBtn.textContent = playing ? 'Pause' : 'Play';
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    if (!dragging) { chap.value = String(Math.round(s.chapterProgress * 1000)); chap.style.setProperty('--p', `${s.chapterProgress * 100}%`); }
    (bookBar.firstChild as HTMLElement).style.width = `${s.bookProgress * 100}%`;
    tChap.textContent = `${fmtDuration(s.chapterRemainingSec)} left in chapter`;
    tBook.textContent = `${Math.round(s.bookProgress * 100)}% · ${fmtDuration(s.remainingSec)} left in book`;
    const v = app.voiceLoading;
    if (v) { status.className = 'status'; status.textContent = `Downloading voice… ${Math.round(v.frac * 100)}% (${v.what}). One time only.`; }
    else if (s.state === 'buffering') { status.className = 'status'; status.textContent = 'Preparing the next passage…'; }
    else if (s.state === 'error') { status.className = 'status err'; status.textContent = s.message ?? 'Something went wrong. Your place is saved.'; }
    else if (s.state === 'finished') { status.className = 'status'; status.textContent = 'You have reached the end of the book.'; }
    else if (s.message) { status.className = 'status'; status.textContent = s.message; }
    else { status.className = 'status'; status.textContent = s.state === 'loading' ? 'Opening the book…' : playing ? `${app.voiceName()} · ${Math.round(s.queuedSec)} s ready ahead` : `${app.voiceName()} · paused`; }
    speedVal.textContent = `${s.speed.toFixed(2)}×`;
    const key = JSON.stringify(s.sleep ?? null);
    if (key !== lastSleep) { lastSleep = key; drawSleep(s); }
  };
  unsub = n.subscribe(update);
  const tick = window.setInterval(() => { if (!root.isConnected) clearInterval(tick); else if (n.state === 'playing') update(n.snapshot()); }, 1000);

  const skipBtn = (label: string, aria: string, f: () => void) => h('button', { 'aria-label': aria, onclick: f }, label);

  function drawPrep() {
    const info = prep;
    mount(prepBox,
      info ? h('div', null, h('div.small', null, `${info.label}: ${info.done} of ${info.total} passages · about ${fmtDuration(info.eta)} to go`), h('div.bar', null, h('i', { style: { width: `${(info.done / info.total) * 100}%` } })),
        h('div.row', { style: { marginTop: '10px' } }, h('button.btn.quiet.sm', { onclick: () => { info.signal.cancelled = true; prep = null; drawPrep(); } }, 'Stop')))
        : h('div.row', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
          h('button.btn.quiet.sm', { onclick: () => runPrep('chapter') }, 'Prepare this chapter'),
          h('button.btn.quiet.sm', { onclick: () => runPrep('rest') }, 'Prepare rest of book')));
  }
  async function runPrep(what: 'chapter' | 'rest') {
    try { await app.ensureVoice(b!.voice); } catch (e) { toast(`Couldn’t load the voice: ${(e as Error).message}`); return; }
    const s = n!.snapshot();
    const [cs, ce] = n!.chapterRange(s.chapter);
    const from = s.idx, to = what === 'chapter' ? ce : n!.utts.length;
    const signal = { cancelled: false };
    prep = { done: 0, total: Math.max(1, to - from), eta: 0, label: what === 'chapter' ? 'Chapter' : 'Book', signal };
    drawPrep();
    try {
      await n!.prepare(from, to, (done, total, eta) => { if (prep) { prep.done = done; prep.total = total; prep.eta = eta; drawPrep(); } }, signal);
      if (!signal.cancelled) toast('Ready to listen offline');
    } catch (e) { toast(`Stopped: ${(e as Error).message}`); }
    prep = null; drawPrep();
    void cs;
  }
  drawPrep();

  const v = voiceById(b.voice);
  mount(root, h('div.player', null,
    eyebrow, title, line, chapTrack, h('div.times', null, tChap), bookBar, h('div.times', { style: { marginTop: '6px' } }, tBook),
    h('div.transport', null,
      skipBtn('⏮', 'Previous chapter', () => n.prevChapter()), skipBtn('−15', 'Back 15 seconds', () => n.skip(-15)),
      playBtn,
      skipBtn('+30', 'Forward 30 seconds', () => n.skip(30)), skipBtn('⏭', 'Next chapter', () => n.nextChapter())),
    status,
    h('hr.rule'),
    h('div.eyebrow', null, 'Speed'), h('div.speedrow', null, speed, speedVal),
    h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' } },
      ...[0.8, 1, 1.25, 1.5, 2].map((r) => h('button.chip', { onclick: () => { speed.value = String(r); fill(); n.setSpeed(r); updateSettings({ speed: r }); } }, `${r}×`))),
    h('hr.rule'),
    h('div.eyebrow', null, 'Sleep timer'), sleepRow,
    h('hr.rule'),
    h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } },
      h('button.btn.quiet.sm', { onclick: () => chapterSheet(root) }, 'Chapters'),
      h('button.btn.quiet.sm', { onclick: async () => {
        const u = n.utts[n.snapshot().idx]; if (!u) return;
        await addAnnotation('bookmark', u.block, u.start, u.end, ''); toast('Bookmarked');
      } }, 'Bookmark here'),
      h('button.btn.quiet.sm', { onclick: () => app.go('settings') }, `Voice: ${v?.name ?? b.voice}`)),
    h('hr.rule'),
    h('div.eyebrow', null, 'Listen without waiting'),
    h('p.small.muted', { style: { lineHeight: '1.5', margin: '8px 0 12px' } }, 'Narration is made on this device. Preparing ahead while the app is open means it can play on a locked screen or offline without pausing to make more.'),
    prepBox));
  update(n.snapshot());
}

function chapterSheet(root: HTMLElement) {
  const n = app.narrator!, b = app.book!;
  const cur = n.snapshot().chapter;
  const s = h('div.sheet', { role: 'dialog', 'aria-label': 'Chapters' }, h('div.eyebrow', null, 'Chapters'),
    h('div.chapter-list', { style: { marginTop: '8px' } },
      ...b.chapters.filter((c) => c.included).map((c) => h('button' + (c.id === cur ? '.cur' : ''), { onclick: () => { n.gotoChapter(c.id); s.remove(); } },
        h('span', null, c.title), h('span.w', null, `${c.words.toLocaleString('en-IE')} words`)))),
    h('div.row', null, h('button.btn.quiet', { onclick: () => s.remove() }, 'Close')));
  document.body.appendChild(s);
  void root;
}
