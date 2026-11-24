// Sentence segmentation tuned for book prose: abbreviations, initials, dialogue tags, quotations.
// Bump SEG_VERSION whenever the output could change, so saved positions can be re-mapped.

export const SEG_VERSION = 1;

export interface Sentence {
  start: number;
  end: number; // exclusive
  text: string;
}

const NO_BREAK_AFTER = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'mt', 'ft', 'jr', 'sr', 'snr', 'fr', 'rev', 'hon', 'gen', 'col', 'capt', 'lt', 'sgt', 'cmdr',
  'vs', 'cf', 'viz', 'no', 'nos', 'vol', 'pp', 'p', 'c', 'ca', 'approx', 'fig', 'ch', 'ed', 'eds', 'trans', 'op', 'esq', 'co', 'inc', 'ltd',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec', 'e.g', 'i.e', 'a.m', 'p.m', 'u.s', 'u.k', 'n.b',
]);
const SOMETIMES_END = new Set(['etc', 'al', 'ibid', 'a.m', 'p.m', 'u.s', 'u.k']);

const CLOSERS = new Set(['"', "'", '”', '’', ')', ']', '»', '*', '_']);
const OPENERS = new Set(['"', "'", '“', '‘', '(', '[', '«']);

function isUpper(ch: string): boolean {
  return ch.toLowerCase() !== ch.toUpperCase() && ch === ch.toUpperCase();
}
function isLower(ch: string): boolean {
  return ch.toLowerCase() !== ch.toUpperCase() && ch === ch.toLowerCase();
}

export function splitSentences(text: string): Sentence[] {
  const out: Sentence[] = [];
  const n = text.length;
  let start = 0;
  let i = 0;
  const push = (s: number, e: number) => {
    // trim whitespace
    while (s < e && /\s/.test(text[s])) s++;
    while (e > s && /\s/.test(text[e - 1])) e--;
    if (e > s) out.push({ start: s, end: e, text: text.slice(s, e) });
  };
  while (i < n) {
    const ch = text[i];
    if (ch === '.' || ch === '!' || ch === '?' || ch === '…') {
      // collect run of terminators
      let j = i;
      while (j < n && '.!?…'.includes(text[j])) j++;
      const run = text.slice(i, j);
      // trailing closers
      let k = j;
      while (k < n && CLOSERS.has(text[k])) k++;
      // need whitespace or end after
      if (k < n && !/\s/.test(text[k])) {
        i = j;
        continue;
      }
      // next significant char
      let m = k;
      while (m < n && /\s/.test(text[m])) m++;
      const next = text[m] ?? '';
      let boundary = true;
      if (m >= n) boundary = true;
      else if (run === '.' ) {
        // look at the word before the period
        let w = i;
        while (w > start && /[\p{L}\p{N}.'’-]/u.test(text[w - 1])) w--;
        const word = text.slice(w, i).toLowerCase().replace(/^[('"“‘]+/, '');
        const lastTok = word.split(/\s+/).pop() ?? '';
        if (NO_BREAK_AFTER.has(lastTok)) boundary = false;
        else if (SOMETIMES_END.has(lastTok)) boundary = isUpper(next) || OPENERS.has(next);
        else if (/^\p{Lu}$/u.test(text.slice(w, i)) && isUpper(next)) boundary = false; // initials: J. R. R. Tolkien
        else if (/\d$/.test(lastTok) && /^\d/.test(next) ) boundary = false;
        else if (isLower(next)) boundary = false;
      } else {
        // ! ? … : break only when followed by uppercase / digit / opener (dialogue tags stay attached)
        if (isLower(next)) boundary = false;
      }
      if (boundary && i === k - 1 && false) boundary = false;
      if (boundary) {
        push(start, k);
        start = k;
      }
      i = k;
      continue;
    }
    i++;
  }
  push(start, n);
  return out;
}

const MAX_WORDS = 36;
const MAX_CHARS = 240;

function wordCount(s: string): number {
  return (s.match(/\S+/g) ?? []).length;
}

/** Split an over-long sentence at clause boundaries so each synthesis call stays natural and bounded. */
export function splitLong(sentence: Sentence): Sentence[] {
  if (wordCount(sentence.text) <= MAX_WORDS && sentence.text.length <= MAX_CHARS) return [sentence];
  const t = sentence.text;
  const candidates: number[] = [];
  const re = /(?<=[;:,—])\s+|\s+(?=—)|\s+(?=(?:and|but|which|while|whereas|because|although|though|when|until|before|after|where|who)\s)/gi;
  for (const m of t.matchAll(re)) candidates.push(m.index! + m[0].length);
  const mid = t.length / 2;
  const viable = candidates
    .filter((c) => wordCount(t.slice(0, c)) >= 5 && wordCount(t.slice(c)) >= 5)
    .sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
  if (!viable.length) {
    // hard split on a word boundary near the middle
    let c = t.indexOf(' ', Math.floor(mid));
    if (c < 0) return [sentence];
    c += 1;
    return [...splitLong(slice(sentence, 0, c)), ...splitLong(slice(sentence, c, t.length))];
  }
  const c = viable[0];
  return [...splitLong(slice(sentence, 0, c)), ...splitLong(slice(sentence, c, t.length))];
}

function slice(s: Sentence, a: number, b: number): Sentence {
  let ss = a;
  let ee = b;
  while (ss < ee && /\s/.test(s.text[ss])) ss++;
  while (ee > ss && /\s/.test(s.text[ee - 1])) ee--;
  return { start: s.start + ss, end: s.start + ee, text: s.text.slice(ss, ee) };
}
