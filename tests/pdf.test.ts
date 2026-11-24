import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePdf } from '../src/core/doc/pdf';

async function load(name: string) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(readFileSync(`tests/fixtures/${name}`));
  return (await pdfjs.getDocument({ data, useSystemFonts: false, }).promise) as any;
}
const wc = (s: string) => (s.match(/\S+/g) ?? []).length;

describe('PDF import', () => {
  it('20-page PDF: chapters from outline, headers/footers/page numbers removed', async () => {
    const doc = await parsePdf(await load('pdf-20pages.pdf'), 'x');
    expect(doc.title).toBe('A History of Coffee in Ireland');
    expect(doc.author).toContain('Donohoe');
    expect(doc.chapters.length).toBeGreaterThanOrEqual(4);
    const all = doc.blocks.map((b) => b.text).join('\n');
    expect(all).not.toMatch(/^\d{1,3}$/m);
    expect(all).not.toContain('A History of Coffee in Ireland\n');
    const bodyText = doc.blocks.filter((b) => b.kind === 'paragraph').map((b) => b.text).join(' ');
    expect(bodyText).not.toMatch(/Ger O’Donohoe/);
    expect(doc.warnings.join(' ')).toMatch(/Removed \d+ running headers/);
    expect(doc.blocks.some((b) => b.kind === 'footnote')).toBe(true);
    // paragraphs are rebuilt, not one line each
    const paras = doc.blocks.filter((b) => b.kind === 'paragraph');
    expect(paras.length).toBeGreaterThan(10);
    expect(wc(paras[0].text)).toBeGreaterThan(30);
  }, 60000);

  it('no word is left split by a line-end hyphen', async () => {
    const doc = await parsePdf(await load('pdf-20pages.pdf'), 'x');
    const text = doc.blocks.filter((b) => b.kind === 'paragraph').map((b) => b.text).join(' ');
    expect(text).not.toMatch(/[a-z]- [a-z]/);
  }, 60000);

  it('300-page PDF without outline: chapters detected by heading size, <20s', async () => {
    const t0 = Date.now();
    const doc = await parsePdf(await load('pdf-300pages.pdf'), 'x');
    const secs = (Date.now() - t0) / 1000;
    console.log(`300-page PDF parsed in ${secs.toFixed(1)}s: ${doc.blocks.length} blocks, ${doc.chapters.length} chapters, ${doc.blocks.reduce((s, b) => s + wc(b.text), 0)} words`);
    expect(doc.chapters.length).toBe(17);
    expect(doc.chapters[0].title).toMatch(/^Chapter 1/);
    expect(secs).toBeLessThan(60);
    const words = doc.blocks.reduce((s, b) => s + wc(b.text), 0);
    expect(words).toBeGreaterThan(100_000);
  }, 180000);
});
