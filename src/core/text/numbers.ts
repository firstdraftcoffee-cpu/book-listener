// Number-to-words helpers. British/Irish conventions by default ("one hundred and five").

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES = ['', ' thousand', ' million', ' billion', ' trillion'];

export interface NumOpts {
  /** "one hundred and five" (true) vs "one hundred five" (false) */
  and?: boolean;
}

function below100(n: number): string {
  if (n < 20) return ONES[n];
  const t = TENS[Math.floor(n / 10)];
  const o = n % 10;
  return o ? `${t}-${ONES[o]}` : t;
}

function below1000(n: number, and: boolean): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (!h) return below100(r);
  if (!r) return `${ONES[h]} hundred`;
  return `${ONES[h]} hundred${and ? ' and' : ''} ${below100(r)}`;
}

export function cardinal(input: number, opts: NumOpts = {}): string {
  const and = opts.and ?? true;
  if (!Number.isFinite(input)) return String(input);
  let n = Math.trunc(input);
  if (n < 0) return `minus ${cardinal(-n, opts)}`;
  if (n === 0) return 'zero';
  if (n > 999_999_999_999_999) return String(n).split('').map((d) => ONES[+d]).join(' ');
  const groups: number[] = [];
  while (n > 0) {
    groups.push(n % 1000);
    n = Math.floor(n / 1000);
  }
  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (!g) continue;
    let s = below1000(g, and) + SCALES[i];
    // "one thousand and five", "two million and one"
    if (i === 0 && and && groups.length > 1 && g < 100 && parts.length) s = `and ${s}`;
    parts.push(s);
  }
  return parts.join(' ');
}

const ORD_IRREG: Record<string, string> = {
  one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth',
};

export function ordinalWord(cardinalWords: string): string {
  // operate on the last word (after last space or hyphen)
  const m = cardinalWords.match(/^(.*?)([a-z]+)$/);
  if (!m) return cardinalWords;
  const [, head, last] = m;
  if (ORD_IRREG[last]) return head + ORD_IRREG[last];
  if (last.endsWith('y')) return `${head}${last.slice(0, -1)}ieth`;
  return `${head}${last}th`;
}

export function ordinal(n: number, opts: NumOpts = {}): string {
  return ordinalWord(cardinal(n, opts));
}

export interface YearOpts {
  /** 2005 -> "two thousand and five" (true) or "twenty oh five" (false) */
  noughtiesAsThousand?: boolean;
  /** 2026 -> "twenty twenty-six" (true) or "two thousand and twenty-six" (false) */
  twentyTwenty?: boolean;
}

export function year(n: number, o: YearOpts = {}): string {
  const noughties = o.noughtiesAsThousand ?? true;
  const tt = o.twentyTwenty ?? true;
  if (n < 1000 || n > 2999) return cardinal(n);
  if (n >= 2000 && n < 2100) {
    const r = n - 2000;
    if (r === 0) return 'two thousand';
    if (r < 10) return noughties ? `two thousand and ${ONES[r]}` : `twenty oh ${ONES[r]}`;
    return tt ? `twenty ${below100(r)}` : `two thousand and ${below100(r)}`;
  }
  if (n >= 2100) return cardinal(n);
  const hi = Math.floor(n / 100);
  const lo = n % 100;
  const hiW = below100(hi);
  if (lo === 0) return n % 1000 === 0 ? cardinal(n) : `${hiW} hundred`;
  if (lo < 10) return n < 1100 ? `${hiW} oh ${ONES[lo]}` : `${hiW} oh ${ONES[lo]}`;
  return `${hiW} ${below100(lo)}`;
}

export function digitsToWords(s: string): string {
  return s.split('').map((d) => (/\d/.test(d) ? ONES[+d] : d)).join(' ');
}

const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
export function romanToInt(r: string): number | null {
  if (!/^(?=[MDCLXVI])M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(r)) return null;
  let total = 0;
  for (let i = 0; i < r.length; i++) {
    const v = ROMAN[r[i]];
    const nx = ROMAN[r[i + 1]] ?? 0;
    total += v < nx ? -v : v;
  }
  return total;
}
