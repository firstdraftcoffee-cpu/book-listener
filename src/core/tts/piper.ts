// Piper (VITS) voices: text -> phonemes (eSpeak NG) -> ONNX -> audio. Used for the Irish-accented voice.
import { splitInlineIpa } from '../text/pronounce';
import type { OrtLike, Phonemizer } from './kokoro';
import { trimSilence } from './kokoro';

export interface PiperConfig {
  audio: { sample_rate: number };
  espeak: { voice: string };
  inference: { noise_scale: number; length_scale: number; noise_w: number };
  phoneme_id_map: Record<string, number[]>;
  num_speakers?: number;
}

const PUNCT = ',.;:!?—…"()';

export class PiperEngine {
  constructor(private ort: OrtLike, private session: any, private cfg: PiperConfig, private phonemize: Phonemizer) {}
  get sampleRate() { return this.cfg.audio.sample_rate; }

  async phonemes(spoken: string): Promise<string> {
    const out: string[] = [];
    for (const part of splitInlineIpa(spoken)) {
      if (part.ipa) { out.push(` ${part.v} `); continue; }
      const text = part.v.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ');
      const re = new RegExp(`(\\s*[${PUNCT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]+\\s*)`, 'g');
      let last = 0;
      for (const m of text.matchAll(re)) {
        if (m.index! > last) out.push((await this.phonemize(text.slice(last, m.index), 'en')).join(' '));
        out.push(m[0].trim() + ' ');
        last = m.index! + m[0].length;
      }
      if (last < text.length) out.push((await this.phonemize(text.slice(last), 'en')).join(' '));
    }
    return out.join('').replace(/r/g, 'ɹ').replace(/\s+/g, ' ').trim().normalize('NFD');
  }

  async synth(spoken: string, speed = 1): Promise<Float32Array> {
    const ph = await this.phonemes(spoken);
    const map = this.cfg.phoneme_id_map;
    const ids: number[] = [...(map['^'] ?? [1])];
    for (const ch of ph) {
      const m = map[ch];
      if (m) { ids.push(...m); ids.push(...(map['_'] ?? [0])); }
    }
    ids.push(...(map['$'] ?? [2]));
    if (ids.length <= 3) return new Float32Array(0);
    const input = new BigInt64Array(ids.map(BigInt));
    const feeds: Record<string, unknown> = {
      input: new this.ort.Tensor('int64', input, [1, input.length]),
      input_lengths: new this.ort.Tensor('int64', BigInt64Array.from([BigInt(input.length)]), [1]),
      scales: new this.ort.Tensor('float32', Float32Array.from([this.cfg.inference.noise_scale, this.cfg.inference.length_scale / speed, this.cfg.inference.noise_w]), [3]),
    };
    if ((this.cfg.num_speakers ?? 1) > 1) feeds.sid = new this.ort.Tensor('int64', BigInt64Array.from([0n]), [1]);
    const res = await this.session.run(feeds);
    const audio = new Float32Array(res[this.session.outputNames[0]].data as Float32Array);
    return trimSilence(audio, this.sampleRate);
  }
}
