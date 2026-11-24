// PDF -> structured text, entirely on-device using pdf.js.
// Handles: header/footer removal, page numbers, hyphenated line wraps, paragraph rebuilding across pages,
// footnote detection (smaller type at the foot of the page), chapter detection (outline, then type size).

import { buildDocument, looksLikeHeading, type RawBlock } from './build';
import type { ParsedDocument } from '../types';

interface Item { str: string; transform: number[]; width: number; height: number; hasEOL?: boolean }
interface PdfPage {
  getViewport(o: { scale: number }): { width: number; height: number };
  getTextContent(): Promise<{ items: Item[] }>;
}
export interface PdfDocLike {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
  getOutline(): Promise<Array<{ title: string; dest: unknown; items?: unknown[] }> | null>;
  getDestination(id: string): Promise<unknown[] | null>;
  getPageIndex(ref: unknown): Promise<number>;
  getMetadata(): Promise<{ info?: { Title?: string; Author?: string } }>;
}

interface Line {
  page: number;
  y: number; // distance from top
  x: number;
  text: string;
  size: number;
  endX: number;
  zone: 'top' | 'bottom' | 'body';
}

const TERMINAL = /[.!?…"”’')\]:]\s*$/;
const PAGE_NUM = /^\s*(?:[-–—]\s*)?(?:page\s+)?(?:\d{1,4}|[ivxlcdm]{1,7}|[IVXLCDM]{1,7})(?:\s*(?:of|\/)\s*\d{1,4})?(?:\s*[-–—])?\s*$/i;

export function median(a: number[]): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

function linesFromPage(items: Item[], pageNo: number, w: number, h: number): Line[] {
  const rows: Array<{ y: number; size: number; parts: Array<{ x: number; end: number; s: string }> }> = [];
  for (const it of items) {
    if (!it.str || !it.str.trim() && !it.str.length) continue;
    const size = Math.abs(it.transform[3]) || it.height || 10;
    const x = it.transform[4];
    const y = h - it.transform[5];
    let row = rows.find((r) => Math.abs(r.y - y) < Math.max(2, size * 0.45));
    if (!row) { row = { y, size, parts: [] }; rows.push(row); }
    row.size = Math.max(row.size, size);
    row.parts.push({ x, end: x + (it.width || 0), s: it.str });
  }
  rows.sort((a, b) => a.y - b.y);
  const lines: Line[] = [];
  for (const r of rows) {
    r.parts.sort((a, b) => a.x - b.x);
    let text = '';
    let prevEnd = r.parts[0]?.x ?? 0;
    for (const p of r.parts) {
      const gap = p.x - prevEnd;
      if (text && gap > r.size * 0.18 && !text.endsWith(' ') && !p.s.startsWith(' ')) text += ' ';
      text += p.s;
      prevEnd = p.end;
    }
    text = text.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const yr = r.y / h;
    lines.push({
      page: pageNo, y: r.y, x: r.parts[0].x, text, size: r.size, endX: prevEnd,
      zone: yr < 0.085 ? 'top' : yr > 0.915 ? 'bottom' : 'body',
    });
  }
  return lines;
}

/** Split two-column pages: if the page has two dominant left edges, read left column then right. */
function reorderColumns(lines: Line[], pageW: number): Line[] {
  const body = lines.filter((l) => l.zone === 'body' && l.text.length > 25);
  if (body.length < 12) return lines;
  const mid = pageW / 2;
  const left = body.filter((l) => l.x < mid * 0.9 && l.endX < mid * 1.05);
  const right = body.filter((l) => l.x > mid * 0.9 && l.x < pageW * 0.65);
  if (left.length > body.length * 0.3 && right.length > body.length * 0.3 && left.length + right.length > body.length * 0.8) {
    const keepTop = lines.filter((l) => l.zone === 'top');
    const keepBottom = lines.filter((l) => l.zone === 'bottom');
    const mids = lines.filter((l) => l.zone === 'body');
    const L = mids.filter((l) => l.x < mid * 0.95).sort((a, b) => a.y - b.y);
    const R = mids.filter((l) => l.x >= mid * 0.95).sort((a, b) => a.y - b.y);
    return [...keepTop, ...L, ...R, ...keepBottom];
  }
  return lines;
}

function norm(t: string): string {
  return t.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
}

function fuzzyEq(a: string, b: string): boolean {
  const f = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const x = f(a), y = f(b);
  return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x));
}

export async function parsePdf(
  doc: PdfDocLike,
  fileTitle: string,
  onProgress?: (p: number) => void,
): Promise<ParsedDocument> {
  const warnings: string[] = [];
  const pages: Line[][] = [];
  let totalChars = 0;
  let pageW = 600;
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    pageW = vp.width;
    const tc = await page.getTextContent();
    let lines = linesFromPage(tc.items, i, vp.width, vp.height);
    lines = reorderColumns(lines, vp.width);
    totalChars += lines.reduce((s, l) => s + l.text.length, 0);
    pages.push(lines);
    if (i % 5 === 0) { onProgress?.(i / doc.numPages * 0.8); await new Promise((r) => setTimeout(r, 0)); }
  }
  const needsOcr = totalChars / Math.max(1, doc.numPages) < 40;
  if (needsOcr) warnings.push('This PDF has little or no selectable text. It may be scanned. Turn on OCR in Settings to read it.');

  // ---- running headers/footers
  const counts = new Map<string, number>();
  for (const p of pages) {
    const seen = new Set<string>();
    for (const l of p) if (l.zone !== 'body') { const k = norm(l.text); if (!seen.has(k)) { seen.add(k); counts.set(k, (counts.get(k) ?? 0) + 1); } }
  }
  const threshold = Math.max(3, Math.floor(doc.numPages * 0.2));
  const repeated = new Set([...counts].filter(([, c]) => c >= threshold).map(([k]) => k));
  let removed = 0;
  const cleaned: Line[][] = pages.map((p) => p.filter((l) => {
    if (l.zone !== 'body') {
      if (repeated.has(norm(l.text)) || PAGE_NUM.test(l.text)) { removed++; return false; }
    } else if (PAGE_NUM.test(l.text) && l.text.length < 8 && (l.y > 0)) {
      // isolated number inside body area only if it is the first/last line of the page
      const idx = p.indexOf(l);
      if (idx === 0 || idx === p.length - 1) { removed++; return false; }
    }
    return true;
  }));
  if (removed) warnings.push(`Removed ${removed} running headers, footers and page numbers.`);

  // ---- body metrics
  const sizeChars = new Map<number, number>();
  for (const p of cleaned) for (const l of p) {
    const k = Math.round(l.size * 2) / 2;
    sizeChars.set(k, (sizeChars.get(k) ?? 0) + l.text.length);
  }
  let bodySize = 10, best = 0;
  for (const [k, c] of sizeChars) if (c > best) { best = c; bodySize = k; }
  const lefts = cleaned.flat().filter((l) => Math.abs(l.size - bodySize) < 1).map((l) => l.x);
  const leftMargin = median(lefts);
  const widths = cleaned.flat().filter((l) => Math.abs(l.size - bodySize) < 1).map((l) => l.endX - leftMargin).sort((a, b) => a - b);
  const fullWidth = widths.length ? widths[Math.floor(widths.length * 0.9)] : pageW * 0.7;
  const gaps: number[] = [];
  for (const p of cleaned) for (let i = 1; i < p.length; i++) {
    const g = p[i].y - p[i - 1].y;
    if (g > 0 && g < bodySize * 3) gaps.push(g);
  }
  const lineGap = median(gaps) || bodySize * 1.3;

  // ---- vocabulary for hyphen repair
  const vocab = new Map<string, number>();
  for (const p of cleaned) for (const l of p) for (const w of l.text.toLowerCase().match(/[\p{L}]+(?:-[\p{L}]+)*/gu) ?? []) vocab.set(w, (vocab.get(w) ?? 0) + 1);

  // ---- outline
  const outline: Array<{ title: string; page: number }> = [];
  try {
    const ol = await doc.getOutline();
    for (const o of ol ?? []) {
      let dest = o.dest as unknown;
      if (typeof dest === 'string') dest = await doc.getDestination(dest);
      if (Array.isArray(dest) && dest[0]) outline.push({ title: o.title, page: await doc.getPageIndex(dest[0]) });
    }
  } catch { /* outline optional */ }

  const headSizes = [...new Set(cleaned.flat().filter((l) => l.size >= bodySize * 1.2 && l.text.length < 100).map((l) => Math.round(l.size)))].sort((a, b) => b - a);

  const raw: RawBlock[] = [];
  let para: string[] = [];
  let paraOpen = false;
  let lastY = -1, lastPage = -1, lastLine: Line | null = null;
  const hyphenJoin = (prev: string, next: string): string => {
    const m = prev.match(/([\p{L}]+)[-­‐]$/u);
    if (!m) return `${prev} ${next}`;
    if (!/^[\p{Ll}]/u.test(next)) return `${prev}${next}`; // "Anglo-" + "Irish": real compound, keep the hyphen
    const nextWord = next.match(/^[\p{L}]+/u)![0];
    const joined = (m[1] + nextWord).toLowerCase();
    const hyph = `${m[1]}-${nextWord}`.toLowerCase();
    const join = (vocab.get(joined) ?? 0) > 0 || (vocab.get(hyph) ?? 0) === 0;
    return join ? prev.replace(/[-­‐]$/u, '') + next : `${prev}${next}`.replace(/(?<=\p{L})$/u, '');
  };
  const flush = () => {
    if (!para.length) return;
    let t = para[0];
    for (let i = 1; i < para.length; i++) t = hyphenJoin(t, para[i]);
    t = t.replace(/­/g, '').replace(/\s+/g, ' ').trim();
    if (t) raw.push({ kind: 'paragraph', text: t });
    para = []; paraOpen = false;
  };
  const outlineByPage = new Map<number, string[]>();
  for (const o of outline) outlineByPage.set(o.page, [...(outlineByPage.get(o.page) ?? []), o.title]);

  for (let pi = 0; pi < cleaned.length; pi++) {
    const lines = cleaned[pi];
    const pendingTitles = [...(outlineByPage.get(pi) ?? [])];
    for (let li = 0; li < lines.length; li++) {
      const l = lines[li];
      // table-of-contents leaders
      if (/\.{4,}\s*\d+\s*$/.test(l.text) || /(?:\s\.){4,}/.test(l.text)) continue;
      // outline heading match
      const ti = pendingTitles.findIndex((t) => fuzzyEq(l.text, t));
      if (ti >= 0) {
        flush();
        raw.push({ kind: 'heading', level: 1, text: pendingTitles[ti], chapterStart: true });
        pendingTitles.splice(ti, 1);
        lastLine = l; lastY = l.y; lastPage = l.page;
        continue;
      }
      // footnote: small type near foot of page, starts with a note marker
      const nearFoot = l.y > (cleaned[pi][cleaned[pi].length - 1]?.y ?? 0) - bodySize * 12;
      if (l.size < bodySize * 0.88 && nearFoot && /^(?:\d{1,3}|[*†‡§])\s*\S/.test(l.text)) {
        flush();
        raw.push({ kind: 'footnote', text: l.text.replace(/^(?:\d{1,3}|[*†‡§])\s*/, '') });
        continue;
      }
      if (l.size < bodySize * 0.88 && nearFoot && raw.length && raw[raw.length - 1].kind === 'footnote') {
        raw[raw.length - 1].text += ' ' + l.text;
        continue;
      }
      // heading by size
      const isBig = l.size >= bodySize * 1.2 && l.text.length < 100 && !/[,;]$/.test(l.text);
      const prevBlank = !lastLine || l.page !== lastPage || l.y - lastY > lineGap * 1.4;
      const next = lines[li + 1];
      const nextBlank = !next || next.y - l.y > lineGap * 1.4 || next.size < l.size * 0.9;
      if ((isBig && outline.length === 0) || (outline.length === 0 && looksLikeHeading(l.text, prevBlank, nextBlank) && l.text.length < 60)) {
        flush();
        const level = isBig ? Math.max(1, headSizes.indexOf(Math.round(l.size)) + 1) : 1;
        // merge consecutive big lines into one heading
        const prev = raw[raw.length - 1];
        if (prev && prev.kind === 'heading' && lastLine && l.page === lastPage && l.y - lastY < lineGap * 1.8 && Math.abs(lastLine.size - l.size) < 1) prev.text += ' ' + l.text;
        else raw.push({ kind: 'heading', level, text: l.text, chapterStart: level <= 2 });
        lastLine = l; lastY = l.y; lastPage = l.page;
        continue;
      }
      // paragraph break?
      let breakBefore = false;
      if (lastLine) {
        const newPage = l.page !== lastPage;
        const bigGap = !newPage && l.y - lastY > lineGap * 1.55;
        const indent = l.x > leftMargin + bodySize * 0.9;
        const prevShort = lastLine.endX - leftMargin < fullWidth * 0.72;
        const prevEnded = TERMINAL.test(lastLine.text);
        if (bigGap) breakBefore = true;
        else if (indent && (prevEnded || prevShort)) breakBefore = true;
        else if (prevShort && prevEnded && !newPage) breakBefore = true;
        else if (newPage && prevEnded && (indent || /^\p{Lu}/u.test(l.text) || prevShort)) breakBefore = true;
      }
      if (breakBefore || (!paraOpen && para.length)) flush();
      para.push(l.text);
      paraOpen = true;
      lastLine = l; lastY = l.y; lastPage = l.page;
    }
    // titles from the outline that were not found as text: insert at start of the page's content
    for (const t of pendingTitles) {
      flush();
      raw.push({ kind: 'heading', level: 1, text: t, chapterStart: true });
    }
  }
  flush();
  onProgress?.(1);

  let title = fileTitle, author: string | undefined;
  try {
    const md = await doc.getMetadata();
    if (md.info?.Title && md.info.Title.trim().length > 2 && !/^(microsoft word|untitled)/i.test(md.info.Title)) title = md.info.Title.trim();
    author = md.info?.Author?.trim() || undefined;
  } catch { /* optional */ }
  return buildDocument(raw, { title, author, format: 'pdf', warnings, needsOcr });
}
