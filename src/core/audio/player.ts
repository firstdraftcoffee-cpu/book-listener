// Gapless audio output with background-playback plumbing (audio session, Media Session, keep-alive element).
import workletUrl from './worklet.js?url';
import { resample, timeStretch, int16ToFloat } from './stretch';

export interface PlayerEvents {
  start(uid: number): void;
  end(uid: number): void;
  underrun(): void;
  paused(): void;
  interrupted(): void;
}

// 0.25 s of digital silence as a WAV, looped in an <audio> element so iOS treats the page as a media app.
function silentWavUrl(): string {
  const sr = 8000, n = sr / 4;
  const b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
}

export class Player {
  ctx!: AudioContext;
  private node!: AudioWorkletNode;
  private keepAlive: HTMLAudioElement;
  private ready = false;
  private ev!: PlayerEvents;
  queuedSeconds = 0;
  private queued = new Map<number, number>(); // uid -> seconds
  playing = false;
  rate = 1;
  private lastPos = { uid: -1, off: 0 };

  constructor() {
    this.keepAlive = new Audio(silentWavUrl());
    this.keepAlive.loop = true;
    this.keepAlive.setAttribute('playsinline', '');
    this.keepAlive.volume = 0.0001; // iOS needs non-zero volume for the element to count as playing
  }

  on(ev: PlayerEvents) { this.ev = ev; }

  /** Must be called from a user gesture (tap) the first time. */
  async init(): Promise<void> {
    if (this.ready) return;
    try { (navigator as any).audioSession && ((navigator as any).audioSession.type = 'playback'); } catch { /* optional */ }
    this.ctx = new AudioContext({ latencyHint: 'playback' });
    await this.ctx.audioWorklet.addModule(workletUrl);
    this.node = new AudioWorkletNode(this.ctx, 'book-player', { numberOfInputs: 0, outputChannelCount: [1] });
    this.node.connect(this.ctx.destination);
    this.node.port.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'start') this.ev.start(m.uid);
      else if (m.type === 'end') { this.queuedSeconds = Math.max(0, this.queuedSeconds - (this.queued.get(m.uid) ?? 0)); this.queued.delete(m.uid); this.ev.end(m.uid); }
      else if (m.type === 'underrun') this.ev.underrun();
      else if (m.type === 'paused') this.ev.paused();
      else if (m.type === 'pos') this.lastPos = { uid: m.uid, off: m.off };
    };
    this.ctx.onstatechange = () => {
      if (this.playing && (this.ctx.state === 'suspended' || (this.ctx.state as string) === 'interrupted')) this.ev.interrupted();
    };
    this.ready = true;
  }

  async play(): Promise<void> {
    await this.init();
    if (this.ctx.state !== 'running') await this.ctx.resume();
    try { await this.keepAlive.play(); } catch { /* autoplay rules: fine if it fails, Web Audio still plays */ }
    this.node.port.postMessage({ type: 'play' });
    this.playing = true;
  }
  pause(): void {
    if (!this.ready) return;
    this.node.port.postMessage({ type: 'pause' });
    this.playing = false;
    // keep-alive stays on briefly so lock-screen controls still work, then stops to save power
    setTimeout(() => { if (!this.playing) this.keepAlive.pause(); }, 25_000);
  }
  async resumeContext(): Promise<void> { if (this.ready && this.ctx.state !== 'running') await this.ctx.resume().catch(() => {}); }

  /** Queue a sentence. Audio is stretched to the current speed, resampled to the device rate, then sent to the audio thread. */
  push(uid: number, pcm: Int16Array, sampleRate: number, pauseAfterSec: number): number {
    let f = int16ToFloat(pcm);
    f = timeStretch(f, this.rate, sampleRate);
    f = resample(f, sampleRate, this.ctx.sampleRate);
    // gentle 4 ms edge fades so joins can't click
    const fade = Math.min(Math.floor(this.ctx.sampleRate * 0.004), f.length >> 1);
    for (let i = 0; i < fade; i++) { const g = i / fade; f[i] *= g; f[f.length - 1 - i] *= g; }
    const pauseScaled = pauseAfterSec / Math.pow(this.rate, 0.6);
    const tail = Math.round(pauseScaled * this.ctx.sampleRate);
    const secs = (f.length + tail) / this.ctx.sampleRate;
    this.queued.set(uid, secs);
    this.queuedSeconds += secs;
    this.node.port.postMessage({ type: 'push', uid, data: f, tail }, [f.buffer]);
    return secs;
  }
  clear(): void {
    if (!this.ready) return;
    this.node.port.postMessage({ type: 'clear' });
    this.queued.clear();
    this.queuedSeconds = 0;
  }
  setVolume(v: number) { if (this.ready) this.node.port.postMessage({ type: 'volume', value: v }); }
  dispose() { this.keepAlive.pause(); this.ctx?.close().catch(() => {}); }
}
