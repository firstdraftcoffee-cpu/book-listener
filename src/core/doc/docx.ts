import JSZip from 'jszip';
import { buildDocument, type RawBlock } from './build';
import type { ParsedDocument } from '../types';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function textOf(p: Element): string {
  let out = '';
  const walk = (n: Node) => {
    for (const c of Array.from(n.childNodes)) {
      if (c.nodeType !== 1) continue;
      const e = c as Element;
      const ln = e.localName;
      if (ln === 'del' || ln === 'delText' || ln === 'instrText' || ln === 'footnoteReference' || ln === 'endnoteReference') continue; // tracked deletions, field codes, note refs
      if (ln === 't') out += e.textContent ?? '';
      else if (ln === 'tab') out += ' ';
      else if (ln === 'br' || ln === 'cr') out += ' ';
      else if (ln === 'noBreakHyphen') out += '-';
      else walk(e);
    }
  };
  walk(p);
  return out;
}

function styleOf(p: Element): string {
  const ppr = Array.from(p.children).find((c) => c.localName === 'pPr');
  const ps = ppr && Array.from(ppr.children).find((c) => c.localName === 'pStyle');
  return ps?.getAttributeNS(W, 'val') ?? ps?.getAttribute('w:val') ?? '';
}

function parseNotes(xml: string | undefined): string[] {
  if (!xml) return [];
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const out: string[] = [];
  for (const n of Array.from(doc.getElementsByTagNameNS(W, 'footnote')).concat(Array.from(doc.getElementsByTagNameNS(W, 'endnote')))) {
    const id = n.getAttributeNS(W, 'id');
    if (id && +id <= 0) continue; // separators
    const txt = Array.from(n.getElementsByTagNameNS(W, 'p')).map(textOf).join(' ').replace(/\s+/g, ' ').trim();
    if (txt) out.push(txt);
  }
  return out;
}

export async function parseDocx(data: ArrayBuffer, fileTitle: string): Promise<ParsedDocument> {
  const zip = await JSZip.loadAsync(data);
  const docXml = await zip.file('word/document.xml')?.async('string');
  if (!docXml) throw new Error('This does not look like a Word (.docx) file.');
  const xml = new DOMParser().parseFromString(docXml, 'application/xml');
  const body = xml.getElementsByTagNameNS(W, 'body')[0];
  const raw: RawBlock[] = [];
  let title = '';
  let author: string | undefined;
  try {
    const core = await zip.file('docProps/core.xml')?.async('string');
    if (core) {
      const c = new DOMParser().parseFromString(core, 'application/xml');
      title = c.getElementsByTagName('dc:title')[0]?.textContent?.trim() ?? '';
      author = c.getElementsByTagName('dc:creator')[0]?.textContent?.trim() || undefined;
    }
  } catch { /* optional */ }

  const handleP = (p: Element) => {
    const text = textOf(p).replace(/\s+/g, ' ').trim();
    if (!text) return;
    const st = styleOf(p).toLowerCase();
    const hm = st.match(/^heading\s?([1-9])$/) ?? st.match(/^titre\s?([1-9])$/);
    if (st === 'title' && !title) { title = text; return; }
    if (hm) { const level = +hm[1]; raw.push({ kind: 'heading', level, text, chapterStart: level <= 2 }); return; }
    if (st === 'subtitle') return;
    if (/quote|blocktext/.test(st)) { raw.push({ kind: 'quote', text }); return; }
    raw.push({ kind: 'paragraph', text });
  };
  const walkBody = (n: Element) => {
    for (const c of Array.from(n.children)) {
      if (c.localName === 'p') handleP(c);
      else if (c.localName === 'tbl') for (const p of Array.from(c.getElementsByTagNameNS(W, 'p'))) handleP(p);
      else if (c.localName === 'sdt' || c.localName === 'sdtContent') walkBody(c);
    }
  };
  walkBody(body);

  const fn = parseNotes(await zip.file('word/footnotes.xml')?.async('string'));
  const en = parseNotes(await zip.file('word/endnotes.xml')?.async('string'));
  if (fn.length + en.length) {
    raw.push({ kind: 'heading', level: 1, text: 'Notes', chapterStart: true });
    for (const t of [...fn, ...en]) raw.push({ kind: 'footnote', text: t });
  }
  const warnings: string[] = [];
  const hasHeadings = raw.some((r) => r.kind === 'heading');
  if (!hasHeadings) warnings.push('No heading styles were found, so chapters could not be detected from the Word styles.');
  return buildDocument(raw, { title: title || fileTitle, author, format: 'docx', warnings });
}
