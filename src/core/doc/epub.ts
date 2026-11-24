import JSZip from 'jszip';
import { buildDocument, type RawBlock } from './build';
import type { ParsedDocument } from '../types';

function dirname(p: string): string { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i + 1); }
function resolve(base: string, href: string): string {
  const parts = (base + decodeURIComponent(href.split('#')[0])).split('/');
  const out: string[] = [];
  for (const s of parts) { if (s === '..') out.pop(); else if (s !== '.' && s !== '') out.push(s); }
  return out.join('/');
}

const BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'li', 'pre', 'dd', 'dt', 'figcaption']);

function collect(root: Element, out: RawBlock[], opts: { notesDoc: boolean }) {
  const walk = (el: Element, inQuote: boolean) => {
    const tag = el.localName.toLowerCase();
    const type = el.getAttribute('epub:type') ?? el.getAttributeNS('http://www.idpf.org/2007/ops', 'type') ?? '';
    const role = el.getAttribute('role') ?? '';
    if (['script', 'style', 'nav', 'head', 'svg', 'math'].includes(tag)) return;
    if (/noteref|pagebreak/.test(type) || role === 'doc-noteref' || role === 'doc-pagebreak') return;
    const isNote = /footnote|endnote|rearnote/.test(type) || role === 'doc-footnote' || role === 'doc-endnote';
    if (isNote) {
      const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (t) out.push({ kind: 'footnote', text: t });
      return;
    }
    if (/^h[1-6]$/.test(tag)) {
      const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (t) out.push({ kind: 'heading', level: +tag[1], text: t, chapterStart: +tag[1] <= 2 });
      return;
    }
    if (BLOCK_TAGS.has(tag) && !el.querySelector('p,h1,h2,h3,h4,h5,h6,blockquote,li')) {
      // drop <sup> note refs inside
      const clone = el.cloneNode(true) as Element;
      for (const s of Array.from(clone.querySelectorAll('sup, a[epub\\:type="noteref"], a[role="doc-noteref"]'))) {
        if (/^\s*[\[(]?\d{1,3}[\])]?\s*$|^\s*[*†‡]+\s*$/.test(s.textContent ?? '')) s.remove();
      }
      for (const br of Array.from(clone.querySelectorAll('br'))) br.replaceWith(' ');
      const t = (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (t) out.push({ kind: tag === 'blockquote' || inQuote ? 'quote' : opts.notesDoc ? 'footnote' : 'paragraph', text: t });
      return;
    }
    for (const c of Array.from(el.children)) walk(c, inQuote || tag === 'blockquote');
  };
  walk(root, false);
}

export async function parseEpub(data: ArrayBuffer, fileTitle: string): Promise<ParsedDocument> {
  const zip = await JSZip.loadAsync(data);
  const container = await zip.file('META-INF/container.xml')?.async('string');
  if (!container) throw new Error('This does not look like an EPUB file (no container.xml).');
  const opfPath = new DOMParser().parseFromString(container, 'application/xml').querySelector('rootfile')?.getAttribute('full-path');
  if (!opfPath) throw new Error('EPUB is missing its package file.');
  const opfText = await zip.file(opfPath)!.async('string');
  const opf = new DOMParser().parseFromString(opfText, 'application/xml');
  const base = dirname(opfPath);

  const manifest = new Map<string, { href: string; type: string; props: string }>();
  for (const it of Array.from(opf.getElementsByTagName('item'))) {
    manifest.set(it.getAttribute('id')!, { href: it.getAttribute('href')!, type: it.getAttribute('media-type') ?? '', props: it.getAttribute('properties') ?? '' });
  }
  const spine = Array.from(opf.getElementsByTagName('itemref')).filter((r) => r.getAttribute('linear') !== 'no').map((r) => manifest.get(r.getAttribute('idref')!)).filter(Boolean) as Array<{ href: string; type: string; props: string }>;
  const title = opf.getElementsByTagNameNS('*', 'title')[0]?.textContent?.trim() || fileTitle;
  const author = opf.getElementsByTagNameNS('*', 'creator')[0]?.textContent?.trim() || undefined;

  // Table of contents -> chapter titles by file
  const tocTitles = new Map<string, string>();
  try {
    const nav = [...manifest.values()].find((m) => /\bnav\b/.test(m.props));
    if (nav) {
      const doc = new DOMParser().parseFromString(await zip.file(base + nav.href)!.async('string'), 'application/xhtml+xml');
      for (const a of Array.from(doc.querySelectorAll('nav[epub\\:type="toc"] a, nav a'))) {
        const h = a.getAttribute('href'); if (h) tocTitles.set(resolve(dirname(base + nav.href), h), (a.textContent ?? '').trim());
      }
    } else {
      const ncxItem = [...manifest.values()].find((m) => m.type === 'application/x-dtbncx+xml');
      if (ncxItem) {
        const doc = new DOMParser().parseFromString(await zip.file(base + ncxItem.href)!.async('string'), 'application/xml');
        for (const np of Array.from(doc.getElementsByTagName('navPoint'))) {
          const src = np.getElementsByTagName('content')[0]?.getAttribute('src');
          const label = np.getElementsByTagName('text')[0]?.textContent?.trim();
          if (src && label) tocTitles.set(resolve(base, src), label);
        }
      }
    }
  } catch { /* titles are optional */ }

  // Cover
  let cover: Blob | undefined;
  try {
    const coverItem = [...manifest.values()].find((m) => /cover-image/.test(m.props)) ??
      manifest.get(opf.querySelector('meta[name="cover"]')?.getAttribute('content') ?? '');
    if (coverItem) cover = new Blob([await zip.file(base + coverItem.href)!.async('arraybuffer')], { type: coverItem.type || 'image/jpeg' });
  } catch { /* optional */ }

  const raw: RawBlock[] = [];
  for (const item of spine) {
    if (!/x?html/.test(item.type)) continue;
    const path = resolve(base, item.href);
    const f = zip.file(path) ?? zip.file(decodeURIComponent(path));
    if (!f) continue;
    const doc = new DOMParser().parseFromString(await f.async('string'), 'application/xhtml+xml');
    const bodyEl = doc.querySelector('body');
    if (!bodyEl) continue;
    const blocks: RawBlock[] = [];
    const bodyType = bodyEl.getAttribute('epub:type') ?? '';
    collect(bodyEl, blocks, { notesDoc: /footnotes|endnotes|rearnotes/.test(bodyType) });
    if (!blocks.length) continue;
    const tocTitle = tocTitles.get(path);
    const firstIsHeading = blocks[0].kind === 'heading';
    if (tocTitle && !firstIsHeading) raw.push({ kind: 'heading', level: 1, text: tocTitle, chapterStart: true });
    else if (!firstIsHeading) blocks[0] = blocks[0]; // content continues the previous chapter
    if (firstIsHeading) blocks[0].chapterStart = true;
    raw.push(...blocks);
  }
  return buildDocument(raw, { title, author, format: 'epub', cover });
}
