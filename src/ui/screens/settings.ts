import { h, mount, fmtBytes } from '../dom';
import { app } from '../app';
import { settings, updateSettings } from '../settings';
import { VOICES, voiceById, type VoiceInfo } from '../../core/tts/voices';
import { cachedUrls, deleteAllModels, deleteCached, isCached } from '../../core/tts/model-store';
import { deleteEverything, putBook, uid } from '../../core/store/db';
import { notesToMarkdown, download } from '../../core/export/notes';
import { renderChapterWav } from '../../core/export/audio';
import { confirmDialog, toast } from '../toast';
import { KIND_LABEL } from '../annot';

const PREVIEW = 'In 1916, a cup of coffee on Grafton Street cost sixpence. Dr. Aoife Ó Súilleabháin wrote about it in Dún Laoghaire.';
let downloaded = new Set<string>();
let kokoroModel = false;
let usage = { bytes: 0, clips: 0 };
let est: { usage?: number; quota?: number } = {};
let persisted: boolean | null = null;
let working: { id: string; msg: string } | null = null;
let root: HTMLElement;

async function refresh() {
  const base = await app.modelsBase();
  kokoroModel = await isCached(`${base.kokoro}/onnx/model_quantized.onnx`);
  downloaded = new Set();
  for (const v of VOICES) {
    if (v.engine === 'kokoro') { if (kokoroModel && (await isCached(`${base.kokoro}/voices/${v.id}.bin`))) downloaded.add(v.id); }
    else if (await isCached(`${base.piper}/${v.id.slice(6)}.onnx`)) downloaded.add(v.id);
  }
  usage = await app.cache.usage();
  est = (await navigator.storage?.estimate?.()) ?? {};
  persisted = (await navigator.storage?.persisted?.()) ?? null;
}

export async function renderSettings(r: HTMLElement) {
  root = r;
  await refresh();
  draw();
}

function draw() {
  const s = settings(), b = app.book, n = app.narrator;
  const toggle = (label: string, desc: string, on: boolean, f: (v: boolean) => void) =>
    h('label.line', null, h('div', null, h('div.t', null, label), h('div.d', null, desc)), h('div.ctl', null, h('input', { type: 'checkbox', checked: on, onchange: (e: any) => f(e.target.checked) })));

  const groups: Array<[string, VoiceInfo[]]> = ['Irish', 'British', 'American'].map((a) => [a, VOICES.filter((v) => v.accent === a)]);
  const current = b?.voice ?? s.voice;

  mount(root,
    h('div.eyebrow', null, 'Settings'), h('h1', { style: { marginTop: '12px' } }, 'Make it yours'),

    h('div.sec', null, h('h2', null, 'Narrator'),
      h('p', null, `Voices are downloaded once, then work without internet. The shared voice engine is about 90 MB${kokoroModel ? ' (already on this device)' : ''}; each extra voice is under 1 MB. The Irish voice is a separate 63 MB file. You can preview any voice once the engine is on this device.`),
      ...groups.map(([acc, vs]) => h('div.group', null, h('div.eyebrow', null, `${acc} accent`),
        ...vs.map((v) => {
          const have = downloaded.has(v.id), isCur = v.id === current, w = working?.id === v.id;
          const loading = app.voiceLoading?.voice === v.id;
          return h('div.line', null,
            h('div', null, h('div.t', null, v.name, h('span.pill' + (isCur ? '.on' : ''), null, isCur ? 'In use' : v.gender)),
              h('div.d', null, [v.grade ? `Quality grade ${v.grade}` : '', v.note ?? '', v.credit ?? '', have ? 'On this device' : `Download ${v.engine === 'piper' ? fmtBytes(v.size) : kokoroModel ? fmtBytes(v.size) : '≈ 90 MB first time'}`].filter(Boolean).join(' · ')),
              loading ? h('div.bar', null, h('i', { style: { width: `${Math.round(app.voiceLoading!.frac * 100)}%` } })) : null,
              w ? h('div.d', null, working!.msg) : null),
            h('div.ctl', { style: { flexDirection: 'column', alignItems: 'stretch' } },
              h('button.btn.sm' + (isCur ? '.quiet' : '.solid'), { disabled: isCur || !!working, onclick: () => useVoice(v) }, have ? 'Use' : 'Download & use'),
              h('button.btn.sm.quiet', { disabled: !!working || (!have && !kokoroModel && v.engine === 'kokoro'), onclick: () => preview(v) }, 'Preview'),
              have && v.engine === 'piper' ? h('button.btn.sm.quiet', { onclick: () => removeVoice(v) }, 'Remove') : null));
        })))),

    h('div.sec', null, h('h2', null, 'Narration'),
      h('div.line', null, h('div', null, h('div.t', null, 'Pauses'), h('div.d', null, 'Between sentences and paragraphs. Longer feels more like a person reading aloud.')),
        h('div.ctl', null, h('input', { type: 'range', min: 0.5, max: 1.6, step: 0.1, value: s.pauseScale, 'aria-label': 'Pause length', onchange: (e: any) => { updateSettings({ pauseScale: Number(e.target.value) }); app.narrator?.setPauseScale(Number(e.target.value)); } }))),
      toggle('Irish names and places', 'Say names like Siobhán, Dún Laoghaire and Ó Súilleabháin the Irish way. Built-in list, still growing.', s.irishLexicon, async (v) => { updateSettings({ irishLexicon: v }); await app.refreshNarration(); }),
      toggle('Read footnotes aloud', 'Off by default so notes do not interrupt the story.', s.narrateFootnotes, async (v) => { updateSettings({ narrateFootnotes: v }); await app.refreshNarration(); }),
      h('div.line', null, h('div', null, h('div.t', null, 'Reading text size')),
        h('div.ctl', null, h('input', { type: 'range', min: 15, max: 28, step: 1, value: s.readerSize, 'aria-label': 'Reading text size', oninput: (e: any) => updateSettings({ readerSize: Number(e.target.value) }) }))),
      h('div.line', null, h('div', null, h('div.t', null, 'Appearance')),
        h('div.ctl', null, ...(['auto', 'light', 'dark'] as const).map((t) => h('button.chip', { 'aria-pressed': String(s.theme === t), onclick: () => { updateSettings({ theme: t }); draw(); } }, t === 'auto' ? 'Match phone' : t[0].toUpperCase() + t.slice(1)))))),

    b ? bookSection(b, n) : h('div.sec', null, h('h2', null, 'This book'), h('p', null, 'Open a book to choose which chapters are narrated and to add pronunciations for it.')),

    h('div.sec', null, h('h2', null, 'Pronunciations for every book'),
      h('p', null, 'Words the narrator gets wrong. Spell it as you would say it (Shiv-awn) or use IPA between slashes.'),
      ...s.globalRules.map((r) => h('div.line', null, h('div', null, h('div.t', null, r.match, ' → ', r.say)),
        h('button.btn.sm.quiet', { onclick: async () => { updateSettings({ globalRules: s.globalRules.filter((x) => x.id !== r.id) }); await app.refreshNarration(); draw(); } }, 'Remove'))),
      ruleAdder(async (match, say) => { updateSettings({ globalRules: [...s.globalRules, { id: uid(), match, say }] }); await app.refreshNarration(); draw(); })),

    h('div.sec', null, h('h2', null, 'Storage and offline'),
      h('p', null, `Narration you have listened to or prepared is kept so it plays instantly and offline. Audio saved: ${fmtBytes(usage.bytes)} (${usage.clips.toLocaleString('en-IE')} passages). ${est.quota ? `This device lets the app use up to ${fmtBytes(est.quota)}; ${fmtBytes(est.usage ?? 0)} used.` : ''}`),
      h('div.line', null, h('div', null, h('div.t', null, 'Audio cache limit'), h('div.d', null, 'Oldest audio is removed first when this is reached. About 1.4 GB per 8 hours of narration.')),
        h('div.ctl', null, h('select.field', { style: { width: 'auto' }, 'aria-label': 'Audio cache limit', onchange: (e: any) => { updateSettings({ cacheGB: Number(e.target.value) }); app.cache.limitBytes = Number(e.target.value) * 1024 ** 3; toast('Saved'); } },
          ...[0.5, 1.5, 3, 6].map((g) => h('option', { value: g, selected: s.cacheGB === g }, `${g} GB`))))),
      h('div.line', null, h('div', null, h('div.t', null, 'Keep my data safe from clean-ups'), h('div.d', null, persisted ? 'On. The phone will not clear your books to make room.' : 'Not guaranteed. Adding the app to your Home Screen makes this much more reliable.')),
        h('div.ctl', null, persisted ? null : h('button.btn.sm.quiet', { onclick: async () => { persisted = (await navigator.storage?.persist?.()) ?? false; toast(persisted ? 'Protected' : 'The browser declined. Try after adding to Home Screen.'); draw(); } }, 'Ask'))),
      h('div.row', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' } },
        h('button.btn.quiet.sm', { onclick: async () => { await app.cache.clearAll(); await refresh(); draw(); toast('Saved audio cleared'); } }, 'Clear saved audio'),
        h('button.btn.quiet.sm', { onclick: async () => { if (await confirmDialog('Remove all downloaded voices? You will need an internet connection to listen again.', 'Remove', true)) { await deleteAllModels(); app.makeTts(); await refresh(); draw(); } } }, 'Remove all voices')),
      h('div.group', null, h('div.eyebrow', null, 'Voice file source'),
        h('p.small.muted', { style: { lineHeight: '1.5' } }, 'Voices come from Hugging Face by default. To use your own copy, enter its address. Leave empty for the default.'),
        h('input.field', { value: s.modelBase ?? '', placeholder: 'https://…', 'aria-label': 'Voice file source', onchange: (e: any) => { updateSettings({ modelBase: e.target.value.trim() || undefined }); app.makeTts(); refresh().then(draw); toast('Saved'); } }))),

    b && n ? exportSection(b, n) : null,

    h('div.sec', null, h('h2', null, 'Privacy'),
      h('p', null, 'Your books, notes, position and narration audio live only in this app on this device. The app has no accounts and no tracking, and it never uploads your text or audio. Its only network use is downloading voice files (once) and the app’s own files. After that it works with the internet switched off.'),
      h('button.btn.danger', { onclick: wipe }, 'Delete everything on this device')),

    h('div.sec', null, h('h2', null, 'About and credits'),
      h('p', null, 'Speech: Kokoro-82M (Apache-2.0) and Piper voices run in your browser through ONNX Runtime Web (MIT). Irish-accented voice: Jenny (Dioco), used with attribution. Pronunciation uses eSpeak NG (GPL-3.0). Fonts: Newsreader and Instrument Sans (SIL OFL). Full list is in the licence inventory shipped with the app.'),
      h('p.small.muted', null, 'Book Listener version 0.1. Lock-screen and background playback are built but still waiting to be checked on a real iPhone.')));
}

function ruleAdder(onAdd: (match: string, say: string) => void) {
  const m = h('input.field', { placeholder: 'Word as written', 'aria-label': 'Word as written' });
  const sy = h('input.field', { placeholder: 'How it should sound', 'aria-label': 'How it should sound' });
  return h('div.group', { style: { display: 'grid', gap: '8px' } }, m, sy, h('button.btn.quiet.sm', { style: { justifySelf: 'start' }, onclick: () => { if (m.value.trim() && sy.value.trim()) onAdd(m.value.trim(), sy.value.trim()); } }, 'Add'));
}

function bookSection(b: NonNullable<typeof app.book>, n: typeof app.narrator) {
  return h('div.sec', null, h('h2', null, 'This book'), h('p', null, b.title),
    h('div.eyebrow', { style: { marginTop: '14px' } }, 'Chapters to narrate'),
    ...b.chapters.map((c) => h('label.line', null,
      h('div', null, h('div.t', null, c.title), h('div.d', null, `${c.kind === 'body' ? '' : c.kind + ' · '}${c.words.toLocaleString('en-IE')} words`)),
      h('div.ctl', null, h('input', { type: 'checkbox', checked: c.included, 'aria-label': `Narrate ${c.title}`, onchange: async (e: any) => { c.included = e.target.checked; await putBook(b); await app.refreshNarration(); } })))),
    b.pronunciation.length ? h('div.group', null, h('div.eyebrow', null, 'Pronunciations for this book'),
      ...b.pronunciation.map((r) => h('div.line', null, h('div', null, h('div.t', null, r.match, ' → ', r.say)),
        h('button.btn.sm.quiet', { onclick: async () => { b.pronunciation = b.pronunciation.filter((x) => x.id !== r.id); await putBook(b); await app.refreshNarration(); draw(); } }, 'Remove')))) : null,
    h('div.group', null, ruleAdder(async (match, say) => { b.pronunciation = [...b.pronunciation, { id: uid(), match, say }]; await putBook(b); await app.refreshNarration(); draw(); })));
  void n;
}

function exportSection(b: NonNullable<typeof app.book>, n: NonNullable<typeof app.narrator>) {
  const sel = h('select.field', { 'aria-label': 'Chapter to export', style: { marginTop: '8px' } }, ...b.chapters.filter((c) => c.included).map((c) => h('option', { value: c.id }, c.title)));
  const bar = h('div.bar', { style: { display: 'none' } }, h('i'));
  const msg = h('div.small.muted', { style: { marginTop: '6px' } });
  return h('div.sec', null, h('h2', null, 'Export'),
    h('p', null, `${app.annotations.length} note${app.annotations.length === 1 ? '' : 's'} and flag${app.annotations.length === 1 ? '' : 's'} in this book.`),
    h('button.btn.quiet.sm', { onclick: () => {
      const kinds = Object.keys(KIND_LABEL).length; void kinds;
      download(`${b.title.replace(/[^\p{L}\p{N}]+/gu, '-')}-notes.md`, notesToMarkdown(b, app.annotations, (c) => n.blocksByChapter.get(c) ?? []), 'text/markdown');
    } }, 'Export notes and passages (.md)'),
    h('div.group', null, h('div.eyebrow', null, 'Chapter audio'), sel,
      h('div.row', { style: { display: 'flex', gap: '8px', marginTop: '8px' } },
        h('button.btn.quiet.sm', { onclick: async () => {
          try { await app.ensureVoice(b.voice); } catch (e) { toast(`Couldn’t load the voice: ${(e as Error).message}`); return; }
          const sig = { cancelled: false };
          bar.style.display = 'block';
          const blob = await renderChapterWav(n, Number(sel.value), (d, t) => { (bar.firstChild as HTMLElement).style.width = `${(d / t) * 100}%`; msg.textContent = `Making audio… ${d} of ${t} passages`; }, sig);
          bar.style.display = 'none'; msg.textContent = '';
          if (blob) { const c = b.chapters.find((x) => x.id === Number(sel.value))!; download(`${b.title.replace(/[^\p{L}\p{N}]+/gu, '-')}-${c.title.replace(/[^\p{L}\p{N}]+/gu, '-')}.wav`, blob); toast(`Saved ${fmtBytes(blob.size)}`); }
        } }, 'Export chapter as WAV')),
      bar, msg,
      h('p.small.muted', { style: { lineHeight: '1.5' } }, 'One chapter at a time keeps memory use safe on a phone. A single chaptered audiobook file (M4B) is planned.')));
}

async function useVoice(v: VoiceInfo) {
  working = { id: v.id, msg: 'Getting ready…' }; draw();
  try {
    await app.ensureVoice(v.id);
    updateSettings({ voice: v.id });
    if (app.book && app.narrator) await app.narrator.setVoice(v.id);
    toast(`${v.name} is ready`);
  } catch (e) { toast(`Couldn’t download: ${(e as Error).message}`); }
  working = null; await refresh(); draw();
}
async function removeVoice(v: VoiceInfo) {
  const base = await app.modelsBase();
  await deleteCached(`${base.piper}/${v.id.slice(6)}.onnx`); await deleteCached(`${base.piper}/${v.id.slice(6)}.onnx.json`);
  app.voiceReady.delete(v.id); await refresh(); draw();
}
async function preview(v: VoiceInfo) {
  working = { id: v.id, msg: 'Preparing preview…' }; draw();
  try {
    await app.ensureVoice(v.id);
    const { toSpoken } = await import('../../core/text/utterances');
    const clip = await app.tts.synth(toSpoken(PREVIEW, app.narration()), v.id, 1);
    const ctx = new AudioContext();
    const buf = ctx.createBuffer(1, clip.pcm.length, clip.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < clip.pcm.length; i++) ch[i] = clip.pcm[i] / 32768;
    const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination); src.start();
    src.onended = () => ctx.close();
  } catch (e) { toast(`Preview failed: ${(e as Error).message}`); }
  working = null; await refresh(); draw();
}
async function wipe() {
  if (!(await confirmDialog('This permanently deletes every book, note, bookmark, saved audio and downloaded voice from this device. It cannot be undone.', 'Delete everything', true))) return;
  app.narrator?.dispose();
  await deleteEverything();
  toast('Everything deleted');
  setTimeout(() => location.reload(), 600);
}
void voiceById;
