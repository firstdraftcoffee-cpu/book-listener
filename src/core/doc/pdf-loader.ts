// Browser-side pdf.js loader. The worker is bundled with the app so it works offline.
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PdfDocLike } from './pdf';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export async function loadPdf(data: ArrayBuffer): Promise<PdfDocLike> {
  const task = pdfjs.getDocument({ data: new Uint8Array(data), useSystemFonts: false });
  return (await task.promise) as unknown as PdfDocLike;
}
