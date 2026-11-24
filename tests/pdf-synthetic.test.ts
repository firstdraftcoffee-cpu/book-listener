import { describe, it, expect } from 'vitest';
import { parsePdf } from '../src/core/doc/pdf';

// Builds a fake pdf.js document so we can test exact line-wrapping situations.
function fake(pages: string[][]) {
  return {
    numPages: pages.length,
    async getPage(n: number) {
      const lines = pages[n - 1];
      return {
        getViewport: () => ({ width: 400, height: 600 }),
        async getTextContent() {
          return { items: lines.map((s, i) => ({ str: s, transform: [10, 0, 0, 10, 40 + (s.startsWith('  ') ? 14 : 0), 600 - (80 + i * 14)], width: s.length * 4.5, height: 10 })) };
        },
      };
    },
    async getOutline() { return null; },
    async getDestination() { return null; },
    async getPageIndex() { return 0; },
    async getMetadata() { return { info: {} }; },
  } as any;
}

describe('PDF line-wrap repair', () => {
  it('joins split words, keeps real compounds, merges paragraphs across pages', async () => {
    const pages = [
      ['  The roasting house was a remark-', 'able place, full of well-known peo-', 'ple and the Anglo-', 'Irish gentry who came to sit.', '  A second paragraph begins here.', 'It ends here without a full stop and'],
      ['carries on across the page break.', '  New paragraph.'],
      ['Filler remarkable people.', 'Filler well-known remarkable.'],
    ];
    const doc = await parsePdf(fake(pages), 't');
    const paras = doc.blocks.filter((b) => b.kind === 'paragraph').map((b) => b.text);
    expect(paras[0]).toContain('remarkable place');
    expect(paras[0]).toContain('well-known people');
    expect(paras[0]).toContain('Anglo-Irish');
    expect(paras.some((p) => p.includes('and carries on across the page break.'))).toBe(true);
  });
});
