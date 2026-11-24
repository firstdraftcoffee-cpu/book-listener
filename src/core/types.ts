// Shared data model. Everything here is plain data so it can cross worker boundaries
// and be stored in IndexedDB without conversion.

export type BlockKind = 'heading' | 'paragraph' | 'quote' | 'footnote' | 'verse';

/** What a chapter is, for the "skip bibliography / index / footnotes" controls. */
export type SectionKind =
  | 'body'
  | 'front' // title page, copyright, dedication, contents
  | 'bibliography'
  | 'index'
  | 'notes' // endnotes / footnotes collected at the back
  | 'appendix';

export interface Block {
  id: number; // index into book.blocks
  kind: BlockKind;
  text: string; // exactly what the author wrote (display text). Never rewritten.
  chapter: number; // index into book.chapters
  level?: number; // heading level 1..3
}

export interface Chapter {
  id: number;
  title: string;
  kind: SectionKind;
  included: boolean; // user toggle: included in narration
  firstBlock: number;
  lastBlock: number; // inclusive
  words: number;
}

export interface ParsedDocument {
  title: string;
  author?: string;
  format: 'pdf' | 'epub' | 'docx' | 'txt' | 'md' | 'paste';
  blocks: Block[];
  chapters: Chapter[];
  cover?: Blob;
  warnings: string[];
  /** true if a PDF looked scanned (little or no text) and OCR could help */
  needsOcr?: boolean;
}

export interface PronunciationRule {
  id: string;
  /** word or phrase as written; matched case-insensitively on word boundaries */
  match: string;
  /** what to say: plain respelling ("Shiv-awn") or IPA wrapped in slashes ("/ʃɪvˈɔːn/") */
  say: string;
  /** whole-word match; default true */
  wholeWord?: boolean;
}

/** One thing the narrator says in a single synthesis call. */
export interface Utterance {
  idx: number; // global index within the narrated sequence
  block: number;
  start: number; // char offsets into block.text (the sentence being highlighted)
  end: number;
  spoken: string; // text actually sent to the voice (numbers expanded, rules applied)
  pauseAfter: number; // seconds of silence after this utterance
  chapter: number;
  heading?: boolean;
}

export interface BookRecord {
  id: string;
  title: string;
  author?: string;
  format: ParsedDocument['format'];
  addedAt: number;
  words: number;
  chapters: Chapter[];
  blockCount: number;
  hasCover: boolean;
  voice: string;
  speed: number;
  /** Listening position */
  pos: { block: number; offset: number; updatedAt: number; seconds: number };
  /** total seconds listened, for stats */
  listened: number;
  /** segmentation algorithm version used when position was saved */
  segVersion: number;
  pronunciation: PronunciationRule[];
}

export type AnnotationKind = 'bookmark' | 'note' | 'awkward' | 'repetition' | 'pronunciation' | 'fact';

export interface Annotation {
  id: string;
  bookId: string;
  kind: AnnotationKind;
  block: number;
  start: number;
  end: number;
  quote: string; // the manuscript passage
  note: string;
  chapter: number;
  createdAt: number;
  resolved?: boolean;
}
