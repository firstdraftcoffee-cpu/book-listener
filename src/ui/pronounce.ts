import { h } from './dom';
import { app } from './app';
import { putBook, uid } from '../core/store/db';
import { toast } from './toast';
import { int16ToFloat } from '../core/audio/stretch';

/** Say a word or phrase once, so a pronunciation rule can be checked before it is saved. */
async function hear(text: string) {
  const b = app.book!;
  app.narrator?.pause();
  await app.ensureVoice(b.voice);
  const c = await app.tts.synth(text, b.voice, 1);
  const ctx = new AudioContext();
  const f = int16ToFloat(c.pcm);
  const buf = ctx.createBuffer(1, f.length, c.sampleRate);
  buf.copyToChannel(new Float32Array(f), 0);
  const src = ctx.createBufferSource();
  src.buffer = buf; src.connect(ctx.destination); src.start();
  src.onended = () => void ctx.close();
}

export function pronounceSheet(passage: string, after?: () => void) {
  const b = app.book!;
  const words = [...new Set(passage.match(/[\p{L}’'-]{3,}/gu) ?? [])].slice(0, 16);
  const word = h('input.field', { placeholder: 'Word as written', 'aria-label': 'Word as written' });
  const say = h('input.field', { placeholder: 'How it should sound, e.g. Shiv-awn', 'aria-label': 'How it should sound', style: { marginTop: '8px' } });
  const s = h('div.sheet', { role: 'dialog' }, h('div.eyebrow', null, 'Fix a pronunciation'),
    h('div.row', null, ...words.map((w) => h('button.chip', { onclick: () => { word.value = w; say.focus(); } }, w))),
    h('div', { style: { marginTop: '10px' } }, word, say),
    h('p.small.muted', null, 'Spell it the way you would say it, like Shiv-awn. Tap “Hear it” to check before saving. Applies to this whole book.'),
    h('div.row', null,
      h('button.btn.quiet', { onclick: async () => {
        const t = say.value.trim(); if (!t || t.startsWith('/')) { toast('Type how it sounds in plain letters to hear it'); return; }
        try { await hear(t); } catch (e) { toast(`Couldn’t play: ${(e as Error).message}`); }
      } }, 'Hear it'),
      h('button.btn.solid', { onclick: async () => {
        if (!word.value.trim() || !say.value.trim()) return;
        b.pronunciation = [...b.pronunciation.filter((r) => r.match.toLowerCase() !== word.value.trim().toLowerCase()), { id: uid(), match: word.value.trim(), say: say.value.trim() }];
        await putBook(b); s.remove(); toast('Saved. It will say it that way from now on.'); await app.refreshNarration(); after?.();
      } }, 'Save'),
      h('button.btn.quiet', { onclick: () => s.remove() }, 'Cancel')));
  document.body.appendChild(s);
}
