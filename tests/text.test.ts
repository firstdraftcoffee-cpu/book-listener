import { describe, it, expect } from 'vitest';
import { cardinal, ordinal, year } from '../src/core/text/numbers';
import { normaliseForSpeech as n } from '../src/core/text/normalise';
import { splitSentences, splitLong } from '../src/core/text/segment';
import { compileRules } from '../src/core/text/pronounce';

describe('numbers', () => {
  it('cardinals', () => {
    expect(cardinal(105)).toBe('one hundred and five');
    expect(cardinal(1001)).toBe('one thousand and one');
    expect(cardinal(2500000)).toBe('two million five hundred thousand');
  });
  it('ordinals', () => {
    expect(ordinal(21)).toBe('twenty-first');
    expect(ordinal(12)).toBe('twelfth');
    expect(ordinal(30)).toBe('thirtieth');
  });
  it('years', () => {
    expect(year(1916)).toBe('nineteen sixteen');
    expect(year(1906)).toBe('nineteen oh six');
    expect(year(1900)).toBe('nineteen hundred');
    expect(year(2008)).toBe('two thousand and eight');
    expect(year(2026)).toBe('twenty twenty-six');
    expect(year(1066)).toBe('ten sixty-six');
  });
});

describe('normalise', () => {
  it('years and dates', () => {
    expect(n('In 1916 it began.')).toBe('In nineteen sixteen it began.');
    expect(n('On 24 November 1916')).toBe('On the twenty-fourth of November, nineteen sixteen');
    expect(n('24/11/26')).toBe('the twenty-fourth of November, twenty twenty-six');
    expect(n('1916–1922')).toContain('nineteen sixteen to nineteen twenty-two');
    expect(n('the 1920s')).toBe('the nineteen twenties');
  });
  it('money', () => {
    expect(n('£2.50')).toBe('two pounds fifty');
    expect(n('€3.50')).toBe('three euro fifty');
    expect(n('€1')).toBe('one euro');
    expect(n('£5m')).toBe('five million pounds');
  });
  it('titles and abbreviations', () => {
    expect(n('Dr. Murphy met Mr. Collins at St. Patrick’s.')).toContain('Doctor Murphy met Mister Collins at Saint Patrick');
    expect(n('King George III')).toBe('King George the third');
    expect(n('Chapter IV')).toBe('Chapter four');
  });
  it('time, percent, ordinals', () => {
    expect(n('at 4:45 pm')).toContain('four forty-five p m');
    expect(n('12%')).toBe('twelve percent');
    expect(n('the 19th century')).toBe('the nineteenth century');
  });
  it('does not treat unit counts as years', () => {
    expect(n('1,500 people')).toBe('one thousand five hundred people');
    expect(n('1500 people')).toBe('one thousand five hundred people');
  });
  it('strips note markers but keeps words', () => {
    expect(n('He left.[12] Then')).toBe('He left. Then');
  });
});

describe('segmentation', () => {
  it('keeps abbreviations and initials together', () => {
    const s = splitSentences('Mr. Smith met J. R. R. Tolkien. They talked.');
    expect(s.map((x) => x.text)).toEqual(['Mr. Smith met J. R. R. Tolkien.', 'They talked.']);
  });
  it('dialogue tags stay attached', () => {
    const s = splitSentences('"Where are you going?" she asked. He did not answer.');
    expect(s.length).toBe(2);
    expect(s[0].text).toBe('"Where are you going?" she asked.');
  });
  it('splits after closing quote when new sentence starts', () => {
    const s = splitSentences('"I know." He left.');
    expect(s.length).toBe(2);
  });
  it('offsets are exact', () => {
    const t = 'One. Two three.  Four?';
    for (const s of splitSentences(t)) expect(t.slice(s.start, s.end)).toBe(s.text);
  });
  it('splits long sentences at clauses', () => {
    const long = 'The coffee house on the corner of the street had been open since the early days of the republic, and it served, as far as anyone could remember, the same dark roast to the same quiet customers every single morning without fail.';
    const parts = splitLong({ start: 0, end: long.length, text: long });
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(long.slice(p.start, p.end)).toBe(p.text);
  });
});

describe('pronunciation', () => {
  it('applies Irish lexicon with and without fadas, and possessives', () => {
    const r = compileRules([], { irish: true });
    const { text, slots } = r.protect('Siobhan and Aoife went to Dún Laoghaire. Niamh’s car.');
    const back = r.restore(text, slots);
    expect(back).toContain('{{/ʃɪvˈɔːn/}}');
    expect(back).toContain('{{/ˈiːfə/}}');
    expect(back).toContain('{{/dˌʌn lˈɪəɹi/}}');
    expect(back).toContain('{{/nˈiːvz/}}');
  });
  it('user rules override built-ins and survive normalisation', () => {
    const r = compileRules([{ id: '1', match: 'Aoife', say: '/ˈeɪfə/' }]);
    const { text, slots } = r.protect('Aoife in 1916');
    const spoken = r.restore(n(text), slots);
    expect(spoken).toContain('{{/ˈeɪfə/}}');
    expect(spoken).toContain('nineteen sixteen');
  });
  it('plain respellings are substituted as text', () => {
    const r = compileRules([{ id: '1', match: 'Roastery', say: 'roast-ery' }], { irish: false });
    expect(r.protect('The Roastery opened').text).toBe('The roast-ery opened');
  });
});
