// Shared logic that turns a flat list of raw blocks into chapters with kinds (front matter, bibliography, ...).
// Parsers for each file format produce RawBlock[]; this file never alters the text of a block.

import type { Block, BlockKind, Chapter, ParsedDocument, SectionKind } from '../types';

export interface RawBlock {
  kind: BlockKind;
  text: string;
  level?: number; // heading level
  /** parser-supplied hint that this block starts a chapter (e.g. PDF outline, EPUB spine item) */
  chapterStart?: boolean;
}

const CHAPTER_RE = /^(?:chapter|part|book|section|prologue|epilogue|preface|foreword|introduction|afterword|conclusion|appendix|interlude|acknowledg(?:e)?ments?)\b/i;
const NUMBERED_RE = /^(?:\d{1,3}|[IVXLC]{1,7})[.)]?\s*$/;
const NUMBERED_TITLE_RE = /^(?:\d{1,2}|[IVXLC]{1,6})[.:]\s+\S.{0,70}$/;

const KIND_PATTERNS: Array<[RegExp, SectionKind]> = [
  [/^(?:select(?:ed)?\s+)?bibliograph(?:y|ies)|^references?$|^works cited|^sources$|^further reading|^reading list/i, 'bibliography'],
  [/^(?:general\s+)?index(?:\s+of\b.*)?$/i, 'index'],
  [/^(?:end ?notes?|notes(?: to the text)?|footnotes?|chapter notes|notes and references)$/i, 'notes'],
  [/^appendi(?:x|ces)\b/i, 'appendix'],
  [/^(?:copyright|title page|half[- ]title|dedication|epigraph|contents|table of contents|about the author|also by\b|praise for|acknowledg(?:e)?ments?|list of (?:illustrations|figures|maps|plates|abbreviations)|abbreviations|permissions|imprint|colophon|cover)\b/i, 'front'],
];

export function classifyTitle(title: string): SectionKind {
  const t = title.trim().replace(/^[\d.\s]+/, '');
  for (const [re, k] of KIND_PATTERNS) if (re.test(t)) return k;
  return 'body';
}

function words(s: string): number {
  return (s.match(/\S+/g) ?? []).length;
}

/** Heuristic: is this a short standalone line that looks like a chapter heading in plain text? */
export function looksLikeHeading(line: string, prevBlank: boolean, nextBlank: boolean): boolean {
  const t = line.trim();
  if (!t || t.length > 80) return false;
  if (!prevBlank || !nextBlank) return false;
  if (CHAPTER_RE.test(t) && words(t) <= 10) return true;
  if (words(t) <= 5 && classifyTitle(t) !== 'body' && !/[.,;]$/.test(t)) return true; // Bibliography, Index, Notes...
  if (NUMBERED_RE.test(t)) return true;
  if (NUMBERED_TITLE_RE.test(t) && !/[,;]$/.test(t)) return true;
  // ALL CAPS short line (not ending in sentence punctuation)
  if (t.length >= 3 && t === t.toUpperCase() && /[A-Z]/.test(t) && !/[.!?]$/.test(t) && words(t) <= 8) return true;
  return false;
}

export function buildDocument(
  raw: RawBlock[],
  meta: { title: string; author?: string; format: ParsedDocument['format']; cover?: Blob; warnings?: string[]; needsOcr?: boolean },
): ParsedDocument {
  const blocks: Block[] = [];
  const chapters: Chapter[] = [];
  const warnings = meta.warnings ?? [];

  const startChapter = (title: string, firstBlock: number) => {
    chapters.push({
      id: chapters.length, title: title.trim() || `Section ${chapters.length + 1}`, kind: classifyTitle(title),
      included: true, firstBlock, lastBlock: firstBlock, words: 0,
    });
  };

  let sawBody = false;
  for (const r of raw) {
    const text = r.text.replace(/\s+\n/g, '\n').trim();
    if (!text) continue;
    const isChapterHeading = r.kind === 'heading' && (r.level === undefined || r.level <= 2 || r.chapterStart);
    if (isChapterHeading || r.chapterStart || chapters.length === 0) {
      // Treat a heading as a new chapter, but fold a heading that immediately follows another heading
      // (e.g. "Part One" then "Chapter 1") into a single chapter title unless it has content.
      const last = chapters[chapters.length - 1];
      const lastHasBody = last ? blocks.slice(last.firstBlock).some((b) => b.kind !== 'heading') : false;
      if (r.kind === 'heading' && last && !lastHasBody && chapters.length > 0 && blocks.length) {
        last.title = `${last.title}: ${text}`;
        last.kind = classifyTitle(last.title);
        blocks.push({ id: blocks.length, kind: 'heading', text, chapter: last.id, level: r.level });
        continue;
      }
      if (r.kind === 'heading') {
        startChapter(text, blocks.length);
      } else if (chapters.length === 0) {
        startChapter(meta.title || 'Beginning', blocks.length);
      } else {
        startChapter(`Section ${chapters.length + 1}`, blocks.length);
      }
    }
    const ch = chapters[chapters.length - 1];
    blocks.push({ id: blocks.length, kind: r.kind, text, chapter: ch.id, level: r.level });
    ch.lastBlock = blocks.length - 1;
    ch.words += words(text);
    if (ch.kind === 'body') sawBody = true;
  }

  // Short untitled text before the first real heading is title page / front matter, not a chapter.
  const firstRawIsHeading = raw.find((r) => r.text.trim())?.kind === 'heading';
  if (chapters.length > 1 && !firstRawIsHeading && chapters[0].words < 400) {
    chapters[0].kind = 'front';
    chapters[0].title = 'Opening pages';
  }

  // Footnote-kind blocks inside a body chapter are excluded at narration time by block kind, not here.
  // Default exclusions: bibliography, index, notes are OFF; front matter kept off by default except dedication-like short text.
  for (const c of chapters) {
    c.included = !(c.kind === 'bibliography' || c.kind === 'index' || c.kind === 'notes' || c.kind === 'front');
  }
  // If everything got excluded (e.g. a document titled "Notes"), include all.
  if (chapters.length && !chapters.some((c) => c.included)) for (const c of chapters) c.included = true;
  if (!sawBody && chapters.length) for (const c of chapters) c.included = true;

  // Trailing headings inside blocks: make sure lastBlock is right
  for (const c of chapters) {
    const bs = blocks.filter((b) => b.chapter === c.id);
    if (bs.length) { c.firstBlock = bs[0].id; c.lastBlock = bs[bs.length - 1].id; }
  }

  return {
    title: meta.title, author: meta.author, format: meta.format, blocks, chapters, cover: meta.cover, warnings,
    needsOcr: meta.needsOcr,
  };
}

/** Plain text (txt, paste, md without markers) -> RawBlock[] using blank-line paragraph structure. */
export function textToRaw(text: string, opts: { markdown?: boolean } = {}): RawBlock[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const raw: RawBlock[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (!buf.length) return;
    // join hard-wrapped lines inside a paragraph; keep verse (many short lines) as separate lines
    const short = buf.length >= 3 && buf.every((l) => l.length < 60);
    const txt = short ? buf.join('\n') : buf.join(' ').replace(/\s{2,}/g, ' ');
    const isQuote = opts.markdown && buf.every((l) => /^>\s?/.test(l));
    raw.push({ kind: short ? 'verse' : isQuote ? 'quote' : 'paragraph', text: isQuote ? txt.replace(/>\s?/g, '') : txt });
    buf = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) { flush(); continue; }
    if (opts.markdown) {
      const m = l.match(/^(#{1,6})\s+(.*?)\s*#*$/);
      if (m) { flush(); raw.push({ kind: 'heading', level: m[1].length, text: m[2], chapterStart: m[1].length <= 2 }); continue; }
      if (/^\s*([-*_])\1{2,}\s*$/.test(l)) { flush(); continue; }
    }
    const prevBlank = i === 0 || !lines[i - 1].trim();
    const nextBlank = i === lines.length - 1 || !lines[i + 1].trim();
    if (!opts.markdown && looksLikeHeading(l, prevBlank, nextBlank) && !buf.length) {
      raw.push({ kind: 'heading', level: 1, text: l.trim(), chapterStart: true });
      continue;
    }
    buf.push(opts.markdown ? l.replace(/^\s{0,3}(?:[-*+]|\d+\.)\s+/, '') : l.trim());
  }
  flush();
  return raw;
}
