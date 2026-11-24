// Export a chapter as a 16-bit WAV file, built from the same sentences the narrator plays (at normal speed).
import type { Narrator } from '../audio/narrator';

function wavHeader(samples: number, sr: number): ArrayBuffer {
  const b = new ArrayBuffer(44), v = new DataView(b);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + samples * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, samples * 2, true);
  return b;
}

export async function renderChapterWav(n: Narrator, chapterId: number, onProgress: (done: number, total: number) => void, signal: { cancelled: boolean }): Promise<Blob | null> {
  const [s, e] = n.chapterRange(chapterId);
  const parts: Int16Array[] = [];
  let sr = 24000, total = 0;
  for (let i = s; i < e; i++) {
    if (signal.cancelled) return null;
    const clip = await n.getClip(i);
    sr = clip.sampleRate;
    if (clip.pcm.length) { parts.push(clip.pcm); total += clip.pcm.length; }
    const gap = new Int16Array(Math.round(n.utts[i].pauseAfter * sr));
    parts.push(gap); total += gap.length;
    onProgress(i - s + 1, e - s);
    if ((i - s) % 10 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  return new Blob([wavHeader(total, sr), ...parts.map((p) => p as BlobPart)], { type: 'audio/wav' });
}
