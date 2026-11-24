import { buildDocument, textToRaw } from './build';
import type { ParsedDocument } from '../types';

export function parseText(text: string, title: string, format: 'txt' | 'md' | 'paste'): ParsedDocument {
  const raw = textToRaw(text, { markdown: format === 'md' });
  // Title: first H1 in markdown if document title not given
  const firstH = raw.find((r) => r.kind === 'heading');
  const t = title || firstH?.text || 'Untitled';
  return buildDocument(raw, { title: t, format });
}
