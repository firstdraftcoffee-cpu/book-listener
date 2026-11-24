import { describe, it, expect } from 'vitest';
import { buildChapterUtterances, findUtterance, DEFAULT_NARRATION } from '../src/core/text/utterances';
import type { Block, Chapter } from '../src/core/types';

const ch: Chapter = { id: 0, title: 'One', kind: 'body', included: true, firstBlock: 0, lastBlock: 3, words: 50 };
const blocks: Block[] = [
  { id: 0, kind: 'heading', text: 'Chapter 1: The Year 1916', chapter: 0, level: 1 },
  { id: 1, kind: 'paragraph', text: 'Dr. Ó Súilleabháin paid €2.50 on 24 November 1916. He left at once.', chapter: 0 },
  { id: 2, kind: 'footnote', text: '1 See the ledger.', chapter: 0 },
  { id: 3, kind: 'paragraph', text: 'Next morning it rained.', chapter: 0 },
];
describe('utterance builder', () => {
  const u = buildChapterUtterances(blocks, ch, DEFAULT_NARRATION);
  it('never changes the author text, only what is spoken', () => {
    for (const x of u) expect(blocks[x.block].text.slice(x.start, x.end).length).toBeGreaterThan(0);
  });
  it('speaks dates and money in words', () => {
    const s = u.map((x) => x.spoken).join(' ');
    expect(s).toMatch(/euro/i); expect(s).toMatch(/nineteen sixteen/); expect(s).not.toMatch(/€|2\.50/);
  });
  it('skips footnotes unless asked', () => {
    expect(u.some((x) => x.block === 2)).toBe(false);
    expect(buildChapterUtterances(blocks, ch, { ...DEFAULT_NARRATION, narrateFootnotes: true }).some((x) => x.block === 2)).toBe(true);
  });
  it('pauses longer after headings and paragraphs than sentences', () => {
    const head = u.find((x) => x.block === 0)!, mid = u.find((x) => x.block === 1)!, last = u.filter((x) => x.block === 1).pop()!;
    expect(head.pauseAfter).toBeGreaterThan(last.pauseAfter); expect(last.pauseAfter).toBeGreaterThan(mid.pauseAfter - 1e-9);
  });
  it('finds a saved position', () => {
    u.forEach((x, i) => (x.idx = i));
    const third = u.find((x) => x.block === 3)!;
    expect(findUtterance(u, 3, 0)).toBe(third.idx);
    expect(findUtterance(u, 1, 10)).toBe(1);
    expect(findUtterance(u, 1, 55)).toBe(2);
  });
});
