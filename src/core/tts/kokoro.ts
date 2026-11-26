// Kokoro-82M inference in the browser: text -> phonemes (eSpeak NG compiled to WebAssembly) -> ONNX model -> audio.
// Everything runs on the device. The only network traffic is downloading the model files the first time.

import { splitInlineIpa } from '../text/pronounce';

export const KOKORO_VOCAB: Record<string, number> = {
  ';': 1, ':': 2, ',': 3, '.': 4, '!': 5, '?': 6, '—': 9, '…': 10, '"': 11, '(': 12, ')': 13, '“': 14, '”': 15, ' ': 16, '̃': 17,
  'ʣ': 18, 'ʥ': 19, 'ʦ': 20, 'ʨ': 21, 'ᵝ': 22, 'ꭧ': 23, A: 24, I: 25, O: 31, Q: 33, S: 35, T: 36, W: 39, Y: 41, 'ᵊ': 42,
  a: 43, b: 44, c: 45, d: 46, e: 47, f: 48, h: 50, i: 51, j: 52, k: 53, l: 54, m: 55, n: 56, o: 57, p: 58, q: 59, r: 60, s: 61,
  t: 62, u: 63, v: 64, w: 65, x: 66, y: 67, z: 68, 'ɑ': 69, 'ɐ': 70, 'ɒ': 71, 'æ': 72, 'β': 75, 'ɔ': 76, 'ɕ': 77, 'ç': 78,
  'ɖ': 80, 'ð': 81, 'ʤ': 82, 'ə': 83, 'ɚ': 85, 'ɛ': 86, 'ɜ': 87, 'ɟ': 90, 'ɡ': 92, 'ɥ': 99, 'ɨ': 101, 'ɪ': 102, 'ʝ': 103,
  'ɯ': 110, 'ɰ': 111, 'ŋ': 112, 'ɳ': 113, 'ɲ': 114, 'ɴ': 115, 'ø': 116, 'ɸ': 118, 'θ': 119, 'œ': 120, 'ɹ': 123, 'ɾ': 125,
  'ɻ': 126, 'ʁ': 128, 'ɽ': 129, 'ʂ': 130, 'ʃ': 131, 'ʈ': 132, 'ʧ': 133, 'ʊ': 135, 'ʋ': 136, 'ʌ': 138, 'ɣ': 139, 'ɤ': 140,
  'χ': 142, 'ʎ': 143, 'ʒ': 147, 'ʔ': 148, 'ˈ': 156, 'ˌ': 157, 'ː': 158, 'ʰ': 162, 'ʲ': 164, '↓': 169, '→': 171, '↗': 172,
  '↘': 173, 'ᵻ': 177,
};

export const MAX_TOKENS = 510;
const PUNCT = ';:,.!?¡¿—…"«»“”(){}[]';
const PUNCT_SPLIT = new RegExp(`(\\s*[${PUNCT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]+\\s*)+`, 'g');

export type Phonemizer = (text: string, lang: string) => Promise<string[]>;

/** eSpeak output -> the symbol set Kokoro was trained on (same fix-ups as the reference JS implementation). */
export function postProcessPhonemes(s: string, american: boolean): string {
  let i = s
    .replace(/kəkˈoːɹoʊ/g, 'kˈoʊkəɹoʊ')
    .replace(/kəkˈɔːɹəʊ/g, 'kˈəʊkəɹəʊ')
    .replace(/ʲ/g, 'j')
    .replace(/r/g, 'ɹ')
    .replace(/x/g, 'k')
    .replace(/ɬ/g, 'l')
    .replace(/(?<=[a-zɹː])(?=hˈʌndɹɪd)/g, ' ')
    .replace(/ z(?=[;:,.!?¡¿—…"«»“” ]|$)/g, 'z');
  if (american) i = i.replace(/(?<=nˈaɪn)ti(?!ː)/g, 'di');
  return i.trim();
}

/** Text with inline {{/ipa/}} markers -> a phoneme string. */
export async function toPhonemes(spoken: string, lang: 'en-us' | 'en-gb', phonemize: Phonemizer): Promise<string> {
  const american = lang === 'en-us';
  const out: string[] = [];
  for (const part of splitInlineIpa(spoken)) {
    if (part.ipa) { out.push(` ${part.v} `); continue; }
    let text = part.v
      .replace(/[‘’]/g, "'").replace(/«/g, '“').replace(/»/g, '”').replace(/[“”]/g, '"')
      .replace(/\(/g, '«').replace(/\)/g, '»')
      .replace(/[^\S \n]/g, ' ').replace(/ {2,}/g, ' ');
    // phonemize clause by clause, passing punctuation through (it carries the pauses and intonation)
    const pieces: Array<{ punct: boolean; t: string }> = [];
    let last = 0;
    for (const m of text.matchAll(PUNCT_SPLIT)) {
      if (m.index! > last) pieces.push({ punct: false, t: text.slice(last, m.index) });
      pieces.push({ punct: true, t: m[0] });
      last = m.index! + m[0].length;
    }
    if (last < text.length) pieces.push({ punct: false, t: text.slice(last) });
    const ph: string[] = [];
    for (const p of pieces) ph.push(p.punct ? p.t : (await phonemize(p.t, american ? 'en-us' : 'en')).join(' '));
    out.push(ph.join(''));
  }
  return postProcessPhonemes(out.join(''), american);
}

export function tokenize(phonemes: string): number[] {
  const ids: number[] = [];
  for (const ch of phonemes) {
    const id = KOKORO_VOCAB[ch];
    if (id !== undefined) ids.push(id);
  }
  return ids;
}

/** Split a token list longer than the model's context at the nearest space/punctuation. */
export function chunkTokens(ids: number[]): number[][] {
  if (ids.length <= MAX_TOKENS) return [ids];
  const out: number[][] = [];
  let cur = ids;
  while (cur.length > MAX_TOKENS) {
    let cut = MAX_TOKENS;
    for (let i = MAX_TOKENS; i > MAX_TOKENS * 0.5; i--) if ([16, 1, 2, 3, 4, 5, 6].includes(cur[i])) { cut = i + 1; break; }
    out.push(cur.slice(0, cut));
    cur = cur.slice(cut);
  }
  if (cur.length) out.push(cur);
  return out;
}

export interface OrtLike {
  InferenceSession: { create(data: Uint8Array | ArrayBuffer, opts?: unknown): Promise<any> };
  Tensor: new (type: string, data: any, dims: number[]) => any;
}

export class KokoroEngine {
  private voiceCache = new Map<string, Float32Array>();
  constructor(
    private ort: OrtLike,
    private session: any,
    private phonemize: Phonemizer,
    private loadVoice: (id: string) => Promise<Float32Array>,
  ) {}

  /** Returns mono Float32 audio at 24 kHz. */
  async synth(spoken: string, voiceId: string, lang: 'en-us' | 'en-gb', speed = 1): Promise<Float32Array> {
    const phonemes = await toPhonemes(spoken, lang, this.phonemize);
    const ids = tokenize(phonemes);
    if (!ids.length) return new Float32Array(0);
    let voice = this.voiceCache.get(voiceId);
    if (!voice) { voice = await this.loadVoice(voiceId); this.voiceCache.set(voiceId, voice); }
    const rows = voice.length / 256;
    const parts: Float32Array[] = [];
    for (const chunk of chunkTokens(ids)) {
      const row = Math.min(chunk.length, rows - 1);
      const style = voice.slice(row * 256, row * 256 + 256);
      const inputs: Record<string, unknown> = {};
      const names: string[] = this.session.inputNames;
      const tokName = names.find((n) => /token|input_ids/.test(n)) ?? names[0];
      const styleName = names.find((n) => /style/.test(n)) ?? names[1];
      const speedName = names.find((n) => /speed/.test(n)) ?? names[2];
      const toks = new BigInt64Array(chunk.length + 2);
      chunk.forEach((v, i) => (toks[i + 1] = BigInt(v)));
      inputs[tokName] = new this.ort.Tensor('int64', toks, [1, toks.length]);
      inputs[styleName] = new this.ort.Tensor('float32', style, [1, 256]);
      inputs[speedName] = new this.ort.Tensor('float32', new Float32Array([speed]), [1]);
      const res = await this.session.run(inputs);
      const outName = this.session.outputNames[0];
      parts.push(new Float32Array(res[outName].data as Float32Array));
    }
    if (parts.length === 1) return trimSilence(parts[0]);
    const total = parts.reduce((s, p) => s + p.length, 0);
    const out = new Float32Array(total);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return trimSilence(out);
  }
}

/** Remove the near-silent lead-in/tail the model adds, keeping a small margin so words aren't clipped. */
export function trimSilence(a: Float32Array, sr = 24000, thresh = 0.004, keepMs = 40): Float32Array {
  let s = 0, e = a.length;
  while (s < e && Math.abs(a[s]) < thresh) s++;
  while (e > s && Math.abs(a[e - 1]) < thresh) e--;
  const keep = Math.floor((sr * keepMs) / 1000);
  s = Math.max(0, s - keep);
  e = Math.min(a.length, e + keep);
  return capSilences(a.slice(s, e), sr);
}

/** Shorten long quiet stretches inside a clip (the model sometimes leaves 0.4 s+ gaps at commas), keeping a natural breath. */
export function capSilences(a: Float32Array, sr = 24000, maxMs = 170, thresh = 0.006): Float32Array {
  const win = Math.floor(sr * 0.01), maxWins = Math.round(maxMs / 10);
  const n = Math.floor(a.length / win);
  const quiet: boolean[] = [];
  for (let w = 0; w < n; w++) {
    let m = 0;
    for (let i = w * win; i < (w + 1) * win; i++) { const v = Math.abs(a[i]); if (v > m) m = v; }
    quiet.push(m < thresh);
  }
  const keep: Array<[number, number]> = [];
  let w = 0, cut = false;
  while (w < n) {
    let e = w;
    if (quiet[w]) { while (e < n && quiet[e]) e++; const len = e - w; if (len > maxWins) { cut = true; keep.push([w, w + maxWins]); } else keep.push([w, e]); }
    else { while (e < n && !quiet[e]) e++; keep.push([w, e]); }
    w = e;
  }
  if (!cut) return a;
  const total = keep.reduce((t, [x, y]) => t + (y - x) * win, 0) + (a.length - n * win);
  const out = new Float32Array(total);
  let o = 0;
  for (const [x, y] of keep) { out.set(a.subarray(x * win, y * win), o); o += (y - x) * win; }
  out.set(a.subarray(n * win), o);
  return out;
}
