// Applies pronunciation rules (built-in Irish lexicon + the author's own rules) to a piece of text.
// Matches are swapped for private-use placeholders so number/abbreviation normalisation can't touch them,
// then restored as inline IPA markers {{/ipa/}} that the voice engine understands.

import type { PronunciationRule } from '../types';
import { IRISH_LEXICON, foldKey } from './irish-lexicon';

const SENT_OPEN = '';
const SENT_CLOSE = '';
const BASE = 0xe100;

export interface CompiledRules {
  hash: string;
  /** replace matches with placeholders */
  protect(text: string): { text: string; slots: string[] };
  /** swap placeholders for {{/ipa/}} markers */
  restore(text: string, slots: string[]): string;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

const VOICELESS_END = /[ptkfθsʃ]$/;

interface Entry { say: string; ipa: boolean }

export function compileRules(user: PronunciationRule[] = [], opts: { irish?: boolean } = {}): CompiledRules {
  const irish = opts.irish ?? true;
  const map = new Map<string, Entry>(); // folded match -> entry
  if (irish) for (const [k, ipa] of IRISH_LEXICON) map.set(foldKey(k), { say: ipa, ipa: true });
  const loose: Array<{ re: RegExp; entry: Entry }> = [];
  for (const r of user) {
    if (!r.match?.trim() || !r.say?.trim()) continue;
    const isIpa = /^\/.+\/$/.test(r.say.trim());
    const entry: Entry = { say: isIpa ? r.say.trim().slice(1, -1) : r.say.trim(), ipa: isIpa };
    if (r.wholeWord === false) loose.push({ re: new RegExp(escapeRe(r.match), 'giu'), entry });
    else map.set(foldKey(r.match.trim()), entry);
  }
  const keys = [...map.keys()].sort((a, b) => b.length - a.length);
  // Build an alternation that matches the *written* form with optional diacritics. We match on folded text
  // by scanning with a regex built from a diacritic-tolerant pattern per key.
  const pattern = keys
    .map((k) => escapeRe(k).split('').map((ch) => (/[a-z]/.test(ch) ? `${ch}[\\u0300-\\u036f]*` : ch === ' ' ? '\\s+' : ch)).join(''))
    .join('|');
  const re = keys.length
    ? new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])(?:${pattern})(?:['’]s)?(?![\\p{L}\\p{M}\\p{N}])`, 'giu')
    : null;
  const hash = fnv(JSON.stringify([irish, user.map((u) => [u.match, u.say, u.wholeWord])]) + keys.length);

  return {
    hash,
    protect(text: string) {
      const slots: string[] = [];
      let out = text;
      const sub = (m: string, entry: Entry): string => {
        const poss = /['’]s$/i.test(m);
        if (entry.ipa) {
          let ipa = entry.say;
          if (poss) ipa += VOICELESS_END.test(ipa) ? 's' : 'z';
          slots.push(ipa);
          return `${SENT_OPEN}${String.fromCharCode(BASE + slots.length - 1)}${SENT_CLOSE}`;
        }
        return poss ? `${entry.say}'s` : entry.say;
      };
      // NFD-normalise a copy for matching but keep offsets aligned by matching on NFC text with tolerant pattern
      const nfd = out.normalize('NFD');
      if (re) {
        out = nfd
          .replace(re, (m) => {
            const folded = foldKey(m.replace(/['’]s$/i, ''));
            const e = map.get(folded.replace(/\s+/g, ' '));
            return e ? sub(m, e) : m;
          })
          .normalize('NFC');
      }
      for (const { re: lre, entry } of loose) out = out.replace(lre, (m) => sub(m, entry));
      return { text: out, slots };
    },
    restore(text: string, slots: string[]) {
      return text.replace(new RegExp(`${SENT_OPEN}(.)${SENT_CLOSE}`, 'g'), (_m, ch: string) => {
        const ipa = slots[ch.charCodeAt(0) - BASE];
        return ipa ? ` {{/${ipa}/}} ` : '';
      });
    },
  };
}

/** Split an utterance string into plain-text and IPA parts for the voice engine. */
export function splitInlineIpa(spoken: string): Array<{ ipa: boolean; v: string }> {
  const parts: Array<{ ipa: boolean; v: string }> = [];
  const re = /\{\{\/(.+?)\/\}\}/g;
  let last = 0;
  for (const m of spoken.matchAll(re)) {
    if (m.index! > last) parts.push({ ipa: false, v: spoken.slice(last, m.index) });
    parts.push({ ipa: true, v: m[1] });
    last = m.index! + m[0].length;
  }
  if (last < spoken.length) parts.push({ ipa: false, v: spoken.slice(last) });
  return parts.filter((p) => p.v.trim().length);
}
