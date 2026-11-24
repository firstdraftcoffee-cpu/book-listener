import type { ParsedDocument } from '../types';
import { parseText } from './txt';

export type ImportKind = 'pdf' | 'epub' | 'docx' | 'txt' | 'md';

export function detectKind(name: string, type = ''): ImportKind | null {
  const n = name.toLowerCase();
  if (n.endsWith('.pdf') || type === 'application/pdf') return 'pdf';
  if (n.endsWith('.epub') || type === 'application/epub+zip') return 'epub';
  if (n.endsWith('.docx') || type.includes('wordprocessingml')) return 'docx';
  if (n.endsWith('.md') || n.endsWith('.markdown') || type === 'text/markdown') return 'md';
  if (n.endsWith('.txt') || type === 'text/plain') return 'txt';
  return null;
}

export function titleFromFilename(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function importFile(file: File, onProgress?: (p: number) => void): Promise<ParsedDocument> {
  const kind = detectKind(file.name, file.type);
  const title = titleFromFilename(file.name);
  if (!kind) throw new Error(`Unsupported file type: ${file.name}. Use PDF, EPUB, DOCX, TXT or Markdown.`);
  if (kind === 'txt' || kind === 'md') return parseText(await file.text(), title, kind);
  const buf = await file.arrayBuffer();
  if (kind === 'docx') return (await import('./docx')).parseDocx(buf, title);
  if (kind === 'epub') return (await import('./epub')).parseEpub(buf, title);
  const { loadPdf } = await import('./pdf-loader');
  const { parsePdf } = await import('./pdf');
  const doc = await loadPdf(buf);
  return parsePdf(doc, title, onProgress);
}

export { parseText };
