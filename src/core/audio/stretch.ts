// Pitch-preserving time stretch (WSOLA). Lets listeners speed narration from 0.5x to 2.5x without the
// voice going high or low, and without regenerating audio — cached speech is stretched at playback time.

export function timeStretch(x: Float32Array, rate: number, sr: number): Float32Array {
  if (Math.abs(rate - 1) < 0.015 || x.length < sr * 0.1) return x;
  const Hs = Math.round(0.010 * sr); // synthesis hop
  const W = Hs * 2; // frame length
  const Ha = Hs * rate; // analysis hop
  const delta = Math.round(0.006 * sr);
  const nFrames = Math.max(1, Math.floor((x.length - W) / Ha) + 1);
  const outLen = (nFrames - 1) * Hs + W;
  const y = new Float32Array(outLen);
  const win = new Float32Array(W);
  for (let i = 0; i < W; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / W); // periodic Hann: overlap-add sums to 1 at 50% hop
  let prev = 0; // chosen start of previous frame
  for (let k = 0; k < nFrames; k++) {
    const ideal = Math.round(k * Ha);
    let start = ideal;
    if (k > 0) {
      const target = prev + Hs; // where the previous frame naturally continues
      let best = -Infinity;
      const lo = Math.max(0, ideal - delta);
      const hi = Math.min(x.length - W, ideal + delta);
      for (let s = lo; s <= hi; s += 2) {
        let c = 0, e = 1e-9;
        for (let i = 0; i < W; i += 2) { const a = x[s + i], b = x[target + i] ?? 0; c += a * b; e += a * a; }
        const score = c / Math.sqrt(e);
        if (score > best) { best = score; start = s; }
      }
    }
    prev = Math.min(start, x.length - W);
    const o = k * Hs;
    for (let i = 0; i < W; i++) y[o + i] += x[prev + i] * win[i];
  }
  return y;
}

/** Linear-interpolation resample (used only to match the audio device's sample rate). */
export function resample(x: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return x;
  const n = Math.floor((x.length * to) / from);
  const y = new Float32Array(n);
  const r = from / to;
  for (let i = 0; i < n; i++) {
    const p = i * r, i0 = Math.floor(p), f = p - i0;
    y[i] = x[i0] * (1 - f) + (x[i0 + 1] ?? x[i0]) * f;
  }
  return y;
}

export function int16ToFloat(a: Int16Array): Float32Array {
  const f = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) f[i] = a[i] / 32768;
  return f;
}
