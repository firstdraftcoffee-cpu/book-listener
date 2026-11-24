// Turns written text into the way a person would say it.
// This only ever affects what is SENT TO THE VOICE. The text shown on screen is never changed.

import { cardinal, ordinal, ordinalWord, year, digitsToWords, romanToInt, type YearOpts } from './numbers';

export interface NormaliseOptions extends YearOpts {
  /** "one hundred and five" */
  and?: boolean;
  /** treat 4-digit numbers 1100-2099 as years */
  years?: boolean;
  /** Irish/British day-first numeric dates (24/11/26) */
  dayFirst?: boolean;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_ABBR: Record<string, string> = {
  Jan: 'January', Feb: 'February', Mar: 'March', Apr: 'April', Jun: 'June', Jul: 'July', Aug: 'August',
  Sep: 'September', Sept: 'September', Oct: 'October', Nov: 'November', Dec: 'December',
};
const MONTH_RE = '(?:January|February|March|April|May|June|July|August|September|October|November|December)';

const MONARCHS = '(?:George|Henry|Edward|William|Elizabeth|Victoria|James|Charles|John|Richard|Louis|Pius|Leo|Benedict|Gregory|Innocent|Clement|Urban|Paul|Alexander|Boniface|Nicholas|Stephen|Philip|Frederick|Napoleon|Ferdinand|Alfonso|Peter|Catherine|Mary|Anne|Anna|Francis|Joseph|Kenneth|Malcolm|Brian)';

const ACRONYMS: Record<string, string> = {
  IRA: 'I R A', GAA: 'G A A', RTÉ: 'R T E', RTE: 'R T E', UCD: 'U C D', UCC: 'U C C', UCG: 'U C G', TCD: 'T C D',
  USA: 'U S A', UK: 'U K', EU: 'E U', UN: 'U N', BBC: 'B B C', CIA: 'C I A', FBI: 'F B I', DUP: 'D U P',
  SDLP: 'S D L P', GPO: 'G P O', RIC: 'R I C', IRB: 'I R B', ICA: 'I C A', SCA: 'S C A', SCAE: 'S C A E',
  CEO: 'C E O', PhD: 'P H D', TV: 'T V', DNA: 'D N A', ESB: 'E S B', RDS: 'R D S', NUI: 'N U I', MEP: 'M E P',
  TD: 'T D', TDs: 'T Ds', ISO: 'I S O', CTC: 'C T C', QC: 'Q C', MP: 'M P', MPs: 'M Ps', WWI: 'World War one', WWII: 'World War two',
  GDP: 'G D P', NHS: 'N H S', VAT: 'V A T', AD: 'A D', BC: 'B C', BCE: 'B C E', CE: 'C E',
};

const TITLE_ABBR: Array<[RegExp, string]> = [
  [/\bMrs\./g, 'Missus'], [/\bMrs\b(?=\s+[A-Z])/g, 'Missus'],
  [/\bMr\./g, 'Mister'], [/\bMr\b(?=\s+[A-Z])/g, 'Mister'],
  [/\bMs\./g, 'Miz'], [/\bMs\b(?=\s+[A-Z])/g, 'Miz'],
  [/\bDr\./g, 'Doctor'], [/\bDr\b(?=\s+[A-Z])/g, 'Doctor'],
  [/\bProf\./g, 'Professor'], [/\bRev\./g, 'Reverend'], [/\bFr\./g, 'Father'],
  [/\bSgt\./g, 'Sergeant'], [/\bCapt\./g, 'Captain'], [/\bCol\./g, 'Colonel'], [/\bGen\./g, 'General'],
  [/\bLt\./g, 'Lieutenant'], [/\bCmdr\./g, 'Commander'], [/\bHon\./g, 'Honourable'],
  [/\bJr\./g, 'Junior'], [/\bSnr\./g, 'Senior'],
  [/\bMt\./g, 'Mount'], [/\bFt\./g, 'Fort'],
  [/\bLtd\.?/g, 'Limited'], [/\bInc\./g, 'Incorporated'], [/\bBros\./g, 'Brothers'],
  [/&\s*Co\./g, 'and Company'], [/\bCo\.(?=\s+[A-Z])/g, 'County'],
  [/\bvs\.?(?=\s)/g, 'versus'], [/\betc\./gi, 'et cetera'], [/\be\.g\./gi, 'for example'], [/\bi\.e\./gi, 'that is'],
  [/\bcf\./gi, 'compare'], [/\bviz\./gi, 'namely'], [/\bapprox\./gi, 'approximately'],
  [/\bN\.B\./g, 'note well'],
  [/\ba\.m\./gi, 'a m'], [/\bp\.m\./gi, 'p m'],
];

const UNIT_WORDS = '(?:people|persons|men|women|children|pounds|euros?|dollars|bags|kg|km|miles|acres|tons|tonnes|years|days|hours|minutes|words|copies|cups|beans|sacks|barrels|houses|families|soldiers|deaths|votes|pages|lines|items|cases|bottles|tins)';

function stripInvisible(s: string): string {
  return s.replace(/[­​‌‍⁠﻿]/g, '');
}

function fixPunctuation(s: string): string {
  return s
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/…|\.{3,}/g, '…')
    .replace(/\s*[–]\s*(?=\D)|\s+-\s+|\s*--+\s*/g, ' — ')
    .replace(/—/g, ' — ')
    .replace(/\s{2,}/g, ' ');
}

function stripNoteMarkers(s: string): string {
  return s
    .replace(/\[\d{1,3}\]/g, '')
    .replace(/[¹²³⁰-⁹]+/g, '')
    .replace(/[†‡§¶]/g, '')
    .replace(/(?<=[a-zÀ-ɏ][.,;:!?"”’')])\s?\d{1,3}(?=\s+[A-Z]|\s*$)/g, (m, _o, _s) => m); // handled elsewhere; kept for clarity
}

function stripMarkdown(s: string): string {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(?<![\w*])[*_](?!\s)(.+?)(?<!\s)[*_](?![\w*])/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/~~(.+?)~~/g, '$1');
}

function money(whole: string, frac: string | undefined, symbol: string, scale: string | undefined, o: NormaliseOptions): string {
  const w = parseInt(whole.replace(/,/g, ''), 10);
  const unit: Record<string, [string, string, string, string]> = {
    '£': ['pound', 'pounds', 'penny', 'pence'],
    '€': ['euro', 'euro', 'cent', 'cent'],
    '$': ['dollar', 'dollars', 'cent', 'cents'],
    'IR£': ['Irish pound', 'Irish pounds', 'penny', 'pence'],
  };
  const [s1, sn, c1, cn] = unit[symbol];
  const sc = scale ? ({ m: 'million', bn: 'billion', k: 'thousand', million: 'million', billion: 'billion', thousand: 'thousand' } as Record<string, string>)[scale.trim().toLowerCase()] : '';
  if (sc) {
    const base = frac ? `${cardinal(w, o)} point ${digitsToWords(frac.slice(1))}` : cardinal(w, o);
    return `${base} ${sc} ${sn}`;
  }
  const cents = frac ? parseInt(frac.slice(1).padEnd(2, '0').slice(0, 2), 10) : 0;
  let out = '';
  if (w > 0 || cents === 0) out = `${cardinal(w, o)} ${w === 1 ? s1 : sn}`;
  if (cents > 0) {
    if (w > 0) out += ` ${cardinal(cents, o)}`; // "two pounds fifty", "three euro fifty"
    else out = `${cardinal(cents, o)} ${cents === 1 ? c1 : cn}`;
  }
  return out;
}

function dmyDate(d: number, m: number, y: string | undefined, o: NormaliseOptions): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const month = MONTHS[m - 1];
  let yr = '';
  if (y) {
    const yy = y.length === 2 ? (parseInt(y, 10) < 30 ? 2000 + parseInt(y, 10) : 1900 + parseInt(y, 10)) : parseInt(y, 10);
    yr = `, ${year(yy, o)}`;
  }
  return `the ${ordinal(d, o)} of ${month}${yr}`;
}

export function normaliseForSpeech(input: string, o: NormaliseOptions = {}): string {
  const opt: NormaliseOptions = { and: true, years: true, dayFirst: true, ...o };
  let s = stripInvisible(input.normalize('NFC'));
  s = stripMarkdown(s);
  s = stripNoteMarkers(s);

  // URLs / emails
  s = s.replace(/\bhttps?:\/\/(?:www\.)?([^\s)]+)/gi, (_m, rest) => rest.replace(/[/?#].*$/, '').replace(/\./g, ' dot '));
  s = s.replace(/\bwww\.([^\s)]+)/gi, (_m, rest) => rest.replace(/\./g, ' dot '));
  s = s.replace(/\b([\w.+-]+)@([\w-]+(?:\.[\w-]+)+)\b/g, (_m, u, d) => `${u} at ${d.replace(/\./g, ' dot ')}`);

  s = s.replace(/&(?!\w+;)/g, ' and ');

  // Titles & abbreviations that end in a full stop
  for (const [re, rep] of TITLE_ABBR) s = s.replace(re, rep);
  // St. = Saint before a capitalised name; Street after a capitalised name followed by punctuation/end
  s = s.replace(/\bSt\.?\s+(?=[A-Z])/g, 'Saint ');
  s = s.replace(/(?<=[A-Z][a-z]+)\s+St\b\.?(?=\s*(?:[,;:)]|$|\s[a-z]))/g, ' Street');
  // Month abbreviations before a day number or year: "Nov. 24", "Nov 1916"
  s = s.replace(/\b(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\.?(?=\s+\d)/g, (_m, a) => MONTH_ABBR[a]);
  // "No. 17", "Nos. 4-6", "p. 12", "pp. 12-15", "c. 1850", "ca. 1850", "vol. 2", "ch. 3", "fig. 4"
  s = s.replace(/\bNos?\.\s*(?=\d)/g, (m) => (/Nos/.test(m) ? 'numbers ' : 'number '));
  s = s.replace(/\bpp\.\s*(?=\d)/g, 'pages ').replace(/\bp\.\s*(?=\d)/g, 'page ');
  s = s.replace(/\b(?:c|ca)\.\s*(?=\d)/g, 'circa ');
  s = s.replace(/\b[Vv]ol\.\s*(?=\d|[IVX])/g, 'volume ').replace(/\b[Cc]h\.\s*(?=\d)/g, 'chapter ').replace(/\b[Ff]ig\.\s*(?=\d)/g, 'figure ');

  // Roman numerals after structural words ("Chapter IV", "World War II") and regnal names ("George III")
  s = s.replace(/\b(Chapter|Part|Book|Volume|Act|Scene|Section|Article|Appendix|Canto|Tome)\s+([IVXLCDM]{1,8})\b/g, (m, w, r) => {
    const n = romanToInt(r);
    return n ? `${w} ${cardinal(n, opt)}` : m;
  });
  s = s.replace(/\bWorld War\s+(I{1,2})\b/g, (_m, r) => `World War ${r.length === 1 ? 'one' : 'two'}`);
  s = s.replace(new RegExp(`\\b(${MONARCHS})\\s+([IVXLC]{2,6})\\b`, 'g'), (m, name, r) => {
    const n = romanToInt(r);
    return n && n > 1 ? `${name} the ${ordinal(n, opt)}` : m;
  });

  // Acronyms
  s = s.replace(/\b[A-ZÉ][A-Za-zÉ]{1,5}\b/g, (w) => ACRONYMS[w] ?? w);

  // Dates
  s = s.replace(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_RE})\\.?,?\\s+(\\d{3,4})\\b`, 'g'), (_m, d, mo, y) =>
    `the ${ordinal(+d, opt)} of ${mo}, ${year(+y, opt)}`);
  s = s.replace(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_RE})\\b(?!\\s*,?\\s*\\d{3,4})`, 'g'), (_m, d, mo) =>
    `the ${ordinal(+d, opt)} of ${mo}`);
  s = s.replace(new RegExp(`\\b(${MONTH_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{3,4})\\b`, 'g'), (_m, mo, d, y) =>
    `${mo} ${ordinal(+d, opt)}, ${year(+y, opt)}`);
  s = s.replace(new RegExp(`\\b(${MONTH_RE})\\s+(\\d{4})\\b`, 'g'), (_m, mo, y) => `${mo}, ${year(+y, opt)}`);
  s = s.replace(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4}|\d{2})\b(?![/.]\d)/g, (m, a, b, y) => {
    const [d, mo] = opt.dayFirst ? [+a, +b] : [+b, +a];
    return dmyDate(d, mo, y, opt) ?? m;
  });

  // Currency (before plain numbers)
  s = s.replace(/\b(IR£)\s?(\d[\d,]*)(\.\d{1,2})?(\s?(?:m|bn|k|million|billion|thousand)\b)?/g, (_m, sy, w, f, sc) => money(w, f, 'IR£', sc, opt));
  s = s.replace(/([£€$])\s?(\d[\d,]*)(\.\d{1,2})?(\s?(?:m|bn|k|million|billion|thousand)\b)?/g, (_m, sy, w, f, sc) => money(w, f, sy, sc, opt));

  // Times
  s = s.replace(/\b(\d{1,2}):(\d{2})\s?([ap])\.?m\.?/gi, (_m, h, mi, ap) => {
    const mm = +mi;
    const t = mm === 0 ? `${cardinal(+h, opt)} o'clock` : mm < 10 ? `${cardinal(+h, opt)} oh ${cardinal(mm, opt)}` : `${cardinal(+h, opt)} ${cardinal(mm, opt)}`;
    return `${t} ${ap.toLowerCase()} m`;
  });
  s = s.replace(/\b(\d{1,2})\s?([ap])\.?m\b\.?/gi, (_m, h, ap) => `${cardinal(+h, opt)} ${ap.toLowerCase()} m`);
  s = s.replace(/(?<![\d:.])\b([01]?\d|2[0-3]):([0-5]\d)\b(?![:.]?\d)/g, (_m, h, mi) => {
    const mm = +mi;
    return mm === 0 ? `${cardinal(+h, opt)} o'clock` : mm < 10 ? `${cardinal(+h, opt)} oh ${cardinal(mm, opt)}` : `${cardinal(+h, opt)} ${cardinal(mm, opt)}`;
  });

  // Percent, degrees, common units
  s = s.replace(/(\d[\d,]*(?:\.\d+)?)\s?%/g, (_m, n) => `${n} percent`);
  s = s.replace(/(\d)\s?°\s?C\b/g, '$1 degrees Celsius').replace(/(\d)\s?°\s?F\b/g, '$1 degrees Fahrenheit').replace(/(\d)\s?°/g, '$1 degrees');
  s = s.replace(/(\d)\s?(km|kg|cm|mm|ml|mph|kph|lbs?|oz|hrs?|mins?|secs?)\b\.?/g, (_m, n, u) => {
    const map: Record<string, [string, string]> = {
      km: ['kilometre', 'kilometres'], kg: ['kilogram', 'kilograms'], cm: ['centimetre', 'centimetres'], mm: ['millimetre', 'millimetres'],
      ml: ['millilitre', 'millilitres'], mph: ['mile per hour', 'miles per hour'], kph: ['kilometre per hour', 'kilometres per hour'],
      lb: ['pound', 'pounds'], lbs: ['pounds', 'pounds'], oz: ['ounce', 'ounces'], hr: ['hour', 'hours'], hrs: ['hours', 'hours'],
      min: ['minute', 'minutes'], mins: ['minutes', 'minutes'], sec: ['second', 'seconds'], secs: ['seconds', 'seconds'],
    };
    const [one, many] = map[u];
    return `${n} ${n === '1' ? one : many}`;
  });
  // "5g", "200g" grams, "500m" metres only when directly attached to a number
  s = s.replace(/(?<=\d)g\b/g, ' grams').replace(/(?<=\d)m\b(?!\w)/g, ' metres');

  // Ranges "1916–1922", "1916-22", "pp 12–15", "5-10"
  s = s.replace(/\b(\d{4})\s?[–-]\s?(\d{4})\b/g, (_m, a, b) =>
    opt.years ? `${year(+a, opt)} to ${year(+b, opt)}` : `${cardinal(+a, opt)} to ${cardinal(+b, opt)}`);
  s = s.replace(/\b(1[0-9]|20)(\d{2})\s?[–-]\s?(\d{2})\b(?!\d)/g, (_m, c, y1, y2) =>
    `${year(+(c + y1), opt)} to ${cardinal(+y2, opt)}`.replace(/ to (\w+)$/, (_x, w) => ` to ${w}`));
  s = s.replace(/\b(\d{1,3})\s?[–]\s?(\d{1,3})\b/g, (_m, a, b) => `${cardinal(+a, opt)} to ${cardinal(+b, opt)}`);
  s = s.replace(/(?<=\d)-(?=\d)/g, ' to ');

  // Decades: 1920s, 1920's, '20s
  s = s.replace(/\b(1[0-9]|20)(\d)0'?s\b/g, (_m, c, d) => {
    const decade = year(+(c + d + '0'), opt);
    return pluraliseDecade(decade);
  });
  s = s.replace(/(?<![\w])'(\d)0s\b/g, (_m, d) => pluraliseDecade(cardinal(+d * 10, opt)));

  // Centuries & ordinals: 19th, 21st
  s = s.replace(/\b(\d+)(st|nd|rd|th)\b/g, (_m, n) => ordinal(+n, opt));

  // Fractions
  s = s.replace(/½/g, ' one half ').replace(/¼/g, ' one quarter ').replace(/¾/g, ' three quarters ').replace(/⅓/g, ' one third ').replace(/⅔/g, ' two thirds ');
  s = s.replace(/\b(\d+)\/(\d+)\b/g, (m, a, b) => {
    if (+b < 2 || +b > 20) return m;
    const den = +b === 2 ? 'half' : +b === 4 ? 'quarter' : ordinalWord(cardinal(+b, opt));
    return `${cardinal(+a, opt)} ${den}${+a > 1 ? (+b === 2 ? 's'.replace('s', 'ves').replace('halves', 'halves') : 's') : ''}`.replace('halfves', 'halves');
  });

  // Decimals
  s = s.replace(/\b(\d[\d,]*)\.(\d+)\b/g, (_m, a, b) => `${cardinal(+a.replace(/,/g, ''), opt)} point ${digitsToWords(b)}`);

  // Remaining integers
  s = s.replace(/(?<![\w.])(\d{1,3}(?:,\d{3})+|\d+)(?![\w])/g, (m, _g, off, str: string) => {
    const digits = m.replace(/,/g, '');
    const n = parseInt(digits, 10);
    const hasComma = m.includes(',');
    const after = str.slice(off + m.length, off + m.length + 20);
    const before = str.slice(Math.max(0, off - 12), off).toLowerCase();
    if (
      opt.years && !hasComma && digits.length === 4 && n >= 1100 && n <= 2099 &&
      !new RegExp(`^\\s+${UNIT_WORDS}\\b`, 'i').test(after) &&
      !/(?:number|no|page|p|pp|room|route|block|flat|apt|unit|bus)\.?\s*$/i.test(before)
    ) return year(n, opt);
    if (digits.length > 15) return digitsToWords(digits);
    return cardinal(n, opt);
  });

  s = fixPunctuation(s);
  // ordinals created above may leave "the the"
  s = s.replace(/\bthe the\b/gi, 'the');
  return s.replace(/\s+/g, ' ').trim();
}

function pluraliseDecade(words: string): string {
  // "nineteen twenty" -> "nineteen twenties"; "nineteen hundred" -> "nineteen hundreds"; "two thousand" -> "two thousands"
  return words.replace(/y$/, 'ies').replace(/(?<!ies)$/, (m, off, str: string) => (/ies$/.test(str) ? '' : 's'));
}

export { MONTHS };
