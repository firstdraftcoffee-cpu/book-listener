// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseText } from '../src/core/doc/txt';
import { parseDocx } from '../src/core/doc/docx';
import { parseEpub } from '../src/core/doc/epub';

const buf = (n: string) => { const b = readFileSync(`tests/fixtures/${n}`); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
const wc = (s: string) => (s.match(/\S+/g) ?? []).length;

describe('TXT / Markdown / paste', () => {
  it('short text', () => {
    const d = parseText(readFileSync('tests/fixtures/short.txt', 'utf8'), 'short', 'txt');
    expect(d.blocks.length).toBeGreaterThanOrEqual(2);
    expect(d.chapters.length).toBeGreaterThanOrEqual(1);
  });
  it('markdown strips nothing from display text but finds headings', () => {
    const d = parseText(readFileSync('tests/fixtures/short.md', 'utf8'), '', 'md');
    expect(d.blocks.filter((b) => b.kind === 'heading').length).toBe(2);
    expect(d.blocks.some((b) => b.kind === 'quote')).toBe(true);
    expect(d.blocks.find((b) => b.text.includes('bold'))!.text).toContain('**bold**'); // original preserved
  });
  it('100,000-word manuscript: chapters, bibliography and index excluded by default', () => {
    const d = parseText(readFileSync('tests/fixtures/book-100k.txt', 'utf8'), 'book', 'txt');
    const total = d.blocks.reduce((s, b) => s + wc(b.text), 0);
    expect(total).toBeGreaterThan(100_000);
    const body = d.chapters.filter((c) => c.kind === 'body');
    expect(body.length).toBe(20);
    expect(d.chapters.find((c) => /bibliograph/i.test(c.title))!.included).toBe(false);
    expect(d.chapters.find((c) => /^index/i.test(c.title))!.included).toBe(false);
    expect(d.chapters.filter((c) => c.included).length).toBe(20);
  });
  it('never alters the author’s prose', () => {
    const src = 'Chapter 1\n\nHe said "yes" — and left.  Then…\n\nSecond paragraph, with  odd   spacing.';
    const d = parseText(src, 't', 'paste');
    const joined = d.blocks.map((b) => b.text).join(' ');
    expect(joined).toContain('"yes" — and left.');
    expect(joined).toContain('Then…');
  });
});

describe('DOCX', () => {
  it('headings become chapters; metadata read', async () => {
    const d = await parseDocx(buf('book.docx'), 'fallback');
    expect(d.title).toBe('A History of Coffee in Ireland');
    expect(d.author).toContain('Donohoe');
    expect(d.chapters.filter((c) => c.kind === 'body').length).toBe(6);
    expect(d.chapters.find((c) => c.kind === 'bibliography')?.included).toBe(false);
  });
});

describe('EPUB', () => {
  it('spine, toc titles, note markers and footnotes', async () => {
    const d = await parseEpub(buf('book.epub'), 'fallback');
    expect(d.title).toBe('A History of Coffee in Ireland');
    expect(d.chapters.length).toBe(6);
    const paras = d.blocks.filter((b) => b.kind === 'paragraph');
    expect(paras.length).toBeGreaterThan(50);
    expect(paras.every((p) => !/\d$/.test(p.text) || /\d{4}$/.test(p.text) || /\.$/.test(p.text))).toBe(true);
    expect(d.blocks.filter((b) => b.kind === 'footnote').length).toBe(6);
  });
});
