// Turns a chapter's blocks into the list of things the narrator will say, with pauses.
import type { Block, Chapter, PronunciationRule, Utterance } from '../types';
import { normaliseForSpeech, type NormaliseOptions } from './normalise';
import { compileRules, type CompiledRules } from './pronounce';
import { splitLong, splitSentences } from './segment';

export interface NarrationOptions {
  rules: PronunciationRule[];
  irishLexicon: boolean;
  norm: NormaliseOptions;
  /** multiplies all pauses (0.5 brisk … 1.5 relaxed) */
  pauseScale: number;
  narrateFootnotes: boolean;
}

export const DEFAULT_NARRATION: NarrationOptions = {
  rules: [], irishLexicon: true, norm: { and: true, years: true, dayFirst: true }, pauseScale: 1, narrateFootnotes: false,
};

// Seconds of silence. The voice already leaves about 0.08 s of breath at each end of a clip, so these are kept small.
const PAUSE = { period: 0.24, question: 0.3, comma: 0.14, mid: 0.08, paragraph: 0.6, heading: 1.0, beforeHeading: 0.9, quote: 0.55, verse: 0.4, ellipsis: 0.42 };

let compiled: { sig: string; r: CompiledRules } | null = null;
export function rulesFor(o: NarrationOptions): CompiledRules {
  const sig = JSON.stringify([o.rules, o.irishLexicon]);
  if (!compiled || compiled.sig !== sig) compiled = { sig, r: compileRules(o.rules, { irish: o.irishLexicon }) };
  return compiled.r;
}

export function speakable(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

export function toSpoken(text: string, o: NarrationOptions): string {
  const rules = rulesFor(o);
  const p = rules.protect(text);
  return rules.restore(normaliseForSpeech(p.text, o.norm), p.slots).replace(/\s+/g, ' ').trim();
}

export function buildChapterUtterances(blocks: Block[], chapter: Chapter, o: NarrationOptions): Utterance[] {
  const out: Utterance[] = [];
  const ps = o.pauseScale;
  const push = (u: Omit<Utterance, 'idx' | 'chapter'>) => out.push({ ...u, idx: -1, chapter: chapter.id, pauseAfter: u.pauseAfter * ps });
  for (let bi = 0; bi < blocks.length; bi++) {
    const b = blocks[bi];
    if (b.kind === 'footnote' && !o.narrateFootnotes) continue;
    const nextIsHeading = blocks[bi + 1]?.kind === 'heading';
    const lines = b.kind === 'verse' ? b.text.split('\n').map((t, i, a) => ({ t, off: a.slice(0, i).join('\n').length + (i ? 1 : 0) })) : [{ t: b.text, off: 0 }];
    for (const line of lines) {
      const sents: Array<{ start: number; end: number; text: string; joined: boolean }> = [];
      for (const sen of splitSentences(line.t)) {
        const parts = splitLong(sen);
        parts.forEach((pt, k) => sents.push({ ...pt, joined: k < parts.length - 1 }));
      }
      for (let si = 0; si < sents.length; si++) {
        const s = sents[si];
        if (!speakable(s.text)) continue;
        let spoken = toSpoken(s.text, o);
        if (!speakable(spoken)) continue;
        const lastOfBlock = si === sents.length - 1;
        if (b.kind === 'heading' && !/[.!?…:]$/.test(spoken)) spoken += '.';
        const tail = s.text.replace(/["”’')\]]+$/, '');
        let pause = /[?!]$/.test(tail) ? PAUSE.question : /[,;:—–-]$/.test(tail) ? PAUSE.comma : PAUSE.period;
        if (s.joined) pause = /[,;:—–-]$/.test(tail) ? PAUSE.comma : PAUSE.mid;
        if (/…$/.test(tail)) pause = PAUSE.ellipsis;
        if (lastOfBlock) pause = b.kind === 'heading' ? PAUSE.heading : b.kind === 'quote' ? PAUSE.quote : b.kind === 'verse' ? PAUSE.verse : nextIsHeading ? PAUSE.beforeHeading : PAUSE.paragraph;
        push({ block: b.id, start: line.off + s.start, end: line.off + s.end, spoken, pauseAfter: pause, heading: b.kind === 'heading', joined: s.joined });
      }
    }
  }
  return out;
}

/** Locate the utterance containing a saved (block, offset) position. */
export function findUtterance(list: Utterance[], block: number, offset: number): number {
  for (let i = 0; i < list.length; i++) {
    const u = list[i];
    if (u.block > block || (u.block === block && u.end > offset)) return i;
  }
  return Math.max(0, list.length - 1);
}
