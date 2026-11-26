import { capSilences } from '../src/core/tts/kokoro';
import { describe, it, expect } from 'vitest';
import { timeStretch } from '../src/core/audio/stretch';

const sr = 24000;
function tone(freq: number, secs: number): Float32Array {
  const x = new Float32Array(Math.floor(sr * secs));
  for (let i = 0; i < x.length; i++) x[i] = 0.5 * Math.sin((2 * Math.PI * freq * i) / sr) * (0.7 + 0.3 * Math.sin((2 * Math.PI * 4 * i) / sr));
  return x;
}
function dominantFreq(y: Float32Array): number {
  // zero-crossing estimate over the middle of the signal
  const a = Math.floor(y.length * 0.2), b = Math.floor(y.length * 0.8);
  let z = 0;
  for (let i = a + 1; i < b; i++) if (y[i - 1] <= 0 && y[i] > 0) z++;
  return z / ((b - a) / sr);
}
describe('WSOLA time stretch', () => {
  for (const rate of [0.5, 0.8, 1.25, 1.5, 2.0, 2.5]) {
    it(`rate ${rate}: duration scales and pitch is preserved`, () => {
      const x = tone(220, 3);
      const y = timeStretch(x, rate, sr);
      expect(y.length / x.length).toBeGreaterThan((1 / rate) * 0.93);
      expect(y.length / x.length).toBeLessThan((1 / rate) * 1.07);
      expect(Math.abs(dominantFreq(y) - 220)).toBeLessThan(12);
      const peak = y.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
      expect(peak).toBeLessThan(0.75); // no clipping / gain blow-up
      expect(peak).toBeGreaterThan(0.25);
    });
  }
  it('rate 1 returns the same samples', () => {
    const x = tone(220, 1);
    expect(timeStretch(x, 1, sr)).toBe(x);
  });
});

describe('capSilences', () => {
  it('shortens a long internal gap but leaves speech and short gaps alone', () => {
    const sr = 24000, tone = (n: number) => Float32Array.from({ length: n }, (_, i) => 0.3 * Math.sin(i / 5));
    const a = new Float32Array(sr * 2); a.set(tone(sr / 2), 0); a.set(tone(sr / 2), sr * 1.5);
    const out = capSilences(a, sr);
    expect(out.length).toBeLessThan(a.length - sr * 0.6);
    expect(out.length).toBeGreaterThan(sr * 1.1);
  });
});
