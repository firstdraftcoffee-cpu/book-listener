// The conductor: keeps a few minutes of narration queued ahead of the listener, generates missing
// sentences on the fly, remembers the exact position, and exposes transport controls.
import type { BookRecord, Utterance, Block, Chapter } from '../types';
import { putBook, getChapterBlocks } from '../store/db';
import { buildChapterUtterances, findUtterance, type NarrationOptions } from '../text/utterances';
import { SEG_VERSION } from '../text/segment';
import { cacheKey, type AudioCache } from './cache';
import type { Player } from './player';
import type { Clip, TtsClient } from '../tts/client';

export const ENGINE_VERSION = 'k2';

export type NarState = 'idle' | 'loading' | 'buffering' | 'playing' | 'paused' | 'error' | 'finished';
export interface NarSnapshot {
  state: NarState;
  idx: number;
  total: number;
  chapter: number;
  message?: string;
  queuedSec: number;
  chapterProgress: number; // 0..1
  bookProgress: number; // 0..1
  remainingSec: number; // whole book, at current speed
  chapterRemainingSec: number;
  speed: number;
  sleep?: { kind: 'minutes' | 'chapter'; endsAt?: number };
  genMsPerSec: number; // seconds of work per second of audio (rolling), for the buffering indicator
  stalls: number; // times playback ran dry this session
  speedX: number; // how many times faster than real time the phone makes speech (1 = just keeping up)
  holding: boolean; // building a short buffer before (re)starting
  holdTarget: number; // seconds of audio wanted before starting
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Narrator {
  utts: Utterance[] = [];
  blocksByChapter = new Map<number, Block[]>();
  chapterStart = new Map<number, number>();
  private chars: number[] = []; // prefix sum of characters
  private pauses: number[] = []; // prefix sum of pause seconds
  idx = 0;
  state: NarState = 'idle';
  message?: string;
  private gen = 0;
  private nextPush = 0;
  private prefetch = 0;
  private producerRunning = false;
  private listeners = new Set<(s: NarSnapshot) => void>();
  private secPerChar = 0.066; // refined from real clips
  private rtf = 1;
  private inflight = new Map<string, Promise<Clip>>();
  private lastSave = 0;
  private sleepTimer: { kind: 'minutes' | 'chapter'; endsAt?: number; handle?: number } | undefined;
  private wantPlaying = false;
  private underruns = 0;
  private totalStalls = 0;
  private skipped = 0;
  leadSec = 90;
  aheadSec = 180;
  pauseScale = 1;
  private holding = false;
  private holdTarget = 0;
  private holdSince = 0;

  constructor(
    public book: BookRecord,
    private o: NarrationOptions,
    private deps: { tts: TtsClient; cache: AudioCache; player: Player },
  ) {
    deps.player.on({
      start: (uid) => this.onStart(uid),
      end: (uid) => this.onEnd(uid),
      underrun: () => this.onUnderrun(),
      paused: () => {},
      interrupted: () => this.onInterrupted(),
    });
    deps.player.rate = book.speed;
  }

  // ---------------------------------------------------------------- loading
  async load(onProgress?: (p: number) => void): Promise<void> {
    this.setState('loading');
    const all: Utterance[] = [];
    const included = this.book.chapters.filter((c) => c.included);
    let n = 0;
    for (const c of included) {
      const blocks = await getChapterBlocks(this.book.id, c.id);
      this.blocksByChapter.set(c.id, blocks);
      this.chapterStart.set(c.id, all.length);
      for (const u of buildChapterUtterances(blocks, c, this.o)) { u.idx = all.length; all.push(u); }
      onProgress?.(++n / included.length);
      if (n % 3 === 0) await sleep(0);
    }
    this.utts = all;
    let cs = 0, ps = 0;
    this.chars = [0]; this.pauses = [0];
    for (const u of all) { cs += u.spoken.length; ps += u.pauseAfter; this.chars.push(cs); this.pauses.push(ps); }
    this.idx = Math.min(findUtterance(all, this.book.pos.block, this.book.pos.offset), Math.max(0, all.length - 1));
    this.nextPush = this.prefetch = this.idx;
    this.setState(all.length ? 'paused' : 'error', all.length ? undefined : 'There is nothing to narrate in the chapters currently included.');
  }

  /** Re-read pronunciation/number settings: rebuilds the list but keeps the listener in place. */
  async reload(o: NarrationOptions): Promise<void> {
    const wasPlaying = this.wantPlaying;
    const block = this.utts[this.idx]?.block ?? this.book.pos.block;
    const offset = this.utts[this.idx]?.start ?? 0;
    this.stopProducer();
    this.o = o;
    this.book.pos = { ...this.book.pos, block, offset };
    this.inflight.clear();
    await this.load();
    if (wasPlaying) await this.play();
  }

  // ---------------------------------------------------------------- observers
  subscribe(fn: (s: NarSnapshot) => void): () => void { this.listeners.add(fn); fn(this.snapshot()); return () => this.listeners.delete(fn); }
  ping() { this.emit(); }
  private emit() { const s = this.snapshot(); for (const l of this.listeners) l(s); }
  private setState(s: NarState, message?: string) { this.state = s; this.message = message; this.emit(); }

  private estSec(i0: number, i1: number): number { // seconds at normal speed for utterances [i0, i1)
    return (this.chars[i1] - this.chars[i0]) * this.secPerChar + (this.pauses[i1] - this.pauses[i0]);
  }
  snapshot(): NarSnapshot {
    const total = this.utts.length;
    const u = this.utts[this.idx];
    const ch = u?.chapter ?? 0;
    const cs = this.chapterStart.get(ch) ?? 0;
    const ce = this.chapterEndIdx(ch);
    const rate = this.deps.player.rate || 1;
    const chTotal = this.estSec(cs, ce) || 1;
    return {
      state: this.state, idx: this.idx, total, chapter: ch, message: this.message,
      queuedSec: this.deps.player.queuedSeconds,
      chapterProgress: Math.min(1, this.estSec(cs, this.idx) / chTotal),
      bookProgress: total ? Math.min(1, this.estSec(0, this.idx) / (this.estSec(0, total) || 1)) : 0,
      remainingSec: this.estSec(this.idx, total) / rate,
      chapterRemainingSec: this.estSec(this.idx, ce) / rate,
      speed: rate,
      sleep: this.sleepTimer ? { kind: this.sleepTimer.kind, endsAt: this.sleepTimer.endsAt } : undefined,
      genMsPerSec: this.rtf,
      holding: this.holding, holdTarget: this.holdTarget, stalls: this.totalStalls, speedX: this.rtf > 0 ? 1 / this.rtf : 0,
    };
  }
  private chapterEndIdx(ch: number): number {
    const included = this.book.chapters.filter((c) => c.included);
    const pos = included.findIndex((c) => c.id === ch);
    const next = included[pos + 1];
    return next ? this.chapterStart.get(next.id)! : this.utts.length;
  }
  chapterOf(idx: number): Chapter | undefined { return this.book.chapters.find((c) => c.id === this.utts[idx]?.chapter); }

  // ---------------------------------------------------------------- transport
  async play(): Promise<void> {
    if (!this.utts.length) return;
    if (this.state === 'finished') { this.seekTo(0); }
    this.wantPlaying = true;
    this.underruns = 0;
    try {
      await this.deps.player.play(true);
    } catch (e) { this.setState('error', `Could not start audio: ${(e as Error).message}`); return; }
    this.beginHold(this.startTarget());
    this.setState('buffering');
    this.startProducer();
    this.bindMediaSession();
  }
  pause(): void {
    this.wantPlaying = false;
    this.deps.player.pause();
    this.setState('paused');
    void this.savePosition(true);
  }
  toggle(): void { (this.state === 'playing' || this.state === 'buffering') ? this.pause() : void this.play(); }

  seekTo(idx: number): void {
    idx = Math.max(0, Math.min(this.utts.length - 1, idx));
    this.stopProducer();
    this.deps.player.clear();
    this.idx = idx;
    this.nextPush = this.prefetch = idx;
    if (this.state === 'finished') this.state = 'paused';
    this.emit();
    void this.savePosition(true);
    if (this.wantPlaying) { this.beginHold(this.startTarget()); this.setState('buffering'); this.startProducer(); }
  }
  seekToBlock(block: number, offset = 0): void { this.seekTo(findUtterance(this.utts, block, offset)); }
  async playFromBlock(block: number, offset = 0): Promise<void> { this.seekToBlock(block, offset); await this.play(); }

  skip(seconds: number): void {
    const rate = this.deps.player.rate || 1;
    let i = this.idx;
    let acc = 0;
    if (seconds >= 0) {
      while (i < this.utts.length - 1 && acc < seconds) { acc += this.estSec(i, i + 1) / rate; i++; }
    } else {
      while (i > 0 && acc < -seconds) { i--; acc += this.estSec(i, i + 1) / rate; }
    }
    this.seekTo(i);
  }
  nextChapter(): void {
    const included = this.book.chapters.filter((c) => c.included);
    const pos = included.findIndex((c) => c.id === this.utts[this.idx]?.chapter);
    const next = included[pos + 1];
    if (next) this.seekTo(this.chapterStart.get(next.id)!);
  }
  prevChapter(): void {
    const included = this.book.chapters.filter((c) => c.included);
    const ch = this.utts[this.idx]?.chapter;
    const pos = included.findIndex((c) => c.id === ch);
    const start = this.chapterStart.get(ch ?? 0) ?? 0;
    if (this.idx - start > 2 || pos <= 0) this.seekTo(start);
    else this.seekTo(this.chapterStart.get(included[pos - 1].id)!);
  }
  gotoChapter(chapterId: number): void { const s = this.chapterStart.get(chapterId); if (s !== undefined) this.seekTo(s); }

  setSpeed(rate: number): void {
    rate = Math.max(0.5, Math.min(2.5, Math.round(rate * 20) / 20));
    this.deps.player.rate = rate;
    this.book.speed = rate;
    void putBook(this.book);
    // already-queued audio was stretched at the old speed: restart from the current sentence
    this.seekTo(this.idx);
  }
  setPauseScale(v: number): void {
    this.pauseScale = Math.max(0.4, Math.min(2, v));
    this.seekTo(this.idx);
  }
  async setVoice(voice: string): Promise<void> {
    this.book.voice = voice;
    await putBook(this.book);
    this.inflight.clear();
    this.seekTo(this.idx);
  }

  // ---------------------------------------------------------------- sleep timer
  setSleep(kind: 'minutes' | 'chapter' | null, minutes = 0): void {
    if (this.sleepTimer?.handle) clearTimeout(this.sleepTimer.handle);
    if (!kind) { this.sleepTimer = undefined; this.emit(); return; }
    if (kind === 'chapter') this.sleepTimer = { kind };
    else {
      const endsAt = Date.now() + minutes * 60_000;
      const handle = window.setTimeout(() => this.sleepNow(), minutes * 60_000);
      this.sleepTimer = { kind, endsAt, handle };
    }
    this.emit();
  }
  private sleepNow() {
    this.sleepTimer = undefined;
    // fade handled by the 5 ms ramp in the worklet; a gentler 3 s fade via volume
    const p = this.deps.player;
    let v = 1;
    const t = window.setInterval(() => { v -= 0.1; p.setVolume(Math.max(0, v)); if (v <= 0) { clearInterval(t); this.pause(); p.setVolume(1); } }, 300);
  }

  // ---------------------------------------------------------------- player callbacks
  private onStart(uid: number) {
    if (uid < 0 || uid >= this.utts.length) return;
    this.idx = uid;
    if (this.state === 'buffering' || this.state === 'paused') if (this.wantPlaying) this.setState('playing');
    this.emit();
    this.updateMediaSession();
    void this.savePosition(false);
  }
  private onEnd(uid: number) {
    const nextU = this.utts[uid + 1];
    if (!nextU) { this.wantPlaying = false; this.deps.player.pause(); this.setState('finished'); void this.savePosition(true); return; }
    if (this.sleepTimer?.kind === 'chapter' && nextU.chapter !== this.utts[uid].chapter) {
      this.sleepTimer = undefined;
      this.idx = uid + 1;
      this.deps.player.clear();
      this.nextPush = this.prefetch = uid + 1;
      this.pause();
    }
  }
  /** Seconds of narration to have ready before (re)starting, so playback does not stutter if making audio is slower than playing it. */
  private startTarget(): number { return Math.min(45, 5 + 25 * Math.max(0, this.rtf * (this.deps.player.rate || 1) - 0.4)); }
  private rebufferTarget(): number { return Math.min(60, 10 + 45 * Math.max(0, this.rtf * (this.deps.player.rate || 1) - 0.4) + this.underruns * 5); }
  private beginHold(target: number) {
    this.holding = true; this.holdTarget = target; this.holdSince = Date.now();
    this.deps.player.hold();
  }
  private maybeRelease() {
    if (!this.holding) return;
    const q = this.deps.player.queuedSeconds;
    const done = this.nextPush >= this.utts.length;
    if (q >= this.holdTarget || done || (q > 1 && Date.now() - this.holdSince > 40_000)) {
      this.holding = false; this.deps.player.release(); this.emit();
    }
  }
  private onUnderrun() {
    if (!this.wantPlaying) return;
    this.underruns++;
    this.totalStalls++;
    this.beginHold(this.rebufferTarget());
    this.setState('buffering');
  }
  private onInterrupted() {
    if (!this.wantPlaying) return;
    this.wantPlaying = false;
    this.setState('paused', 'Playback was interrupted. Tap play to continue from the same sentence.');
    void this.savePosition(true);
  }

  // ---------------------------------------------------------------- producer
  private startProducer() {
    if (this.producerRunning) return;
    this.producerRunning = true;
    const gen = ++this.gen;
    void this.produce(gen).finally(() => { if (this.gen === gen) this.producerRunning = false; });
  }
  private stopProducer() { this.gen++; this.producerRunning = false; }

  /** Audio for one sentence at normal speed (from the cache, or made now). */
  getClip(i: number): Promise<Clip> { return this.clipFor(i); }

  private async clipFor(i: number): Promise<Clip> {
    const u = this.utts[i];
    const voice = this.book.voice;
    const key = cacheKey(ENGINE_VERSION, voice, u.spoken);
    const hit = await this.deps.cache.get(key);
    if (hit) return { pcm: hit.pcm, sampleRate: hit.sampleRate, ms: 0 };
    let p = this.inflight.get(key);
    if (!p) {
      p = (async () => {
        let lastErr: unknown;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const clip = await this.deps.tts.synth(u.spoken, voice, 1);
            if (clip.pcm.length) {
              const secs = clip.pcm.length / clip.sampleRate;
              this.secPerChar = this.secPerChar * 0.97 + (secs / Math.max(1, u.spoken.length)) * 0.03;
              this.rtf = this.rtf * 0.8 + (clip.ms / 1000 / Math.max(0.2, secs)) * 0.2;
            }
            await this.deps.cache.put(key, clip, this.book.id);
            return clip;
          } catch (e) { lastErr = e; await sleep(400 * (attempt + 1)); }
        }
        throw lastErr;
      })().finally(() => this.inflight.delete(key));
      this.inflight.set(key, p);
    }
    return p;
  }

  private async produce(gen: number) {
    const alive = () => gen === this.gen;
    while (alive()) {
      this.maybeRelease();
      try {
        if (this.nextPush < this.utts.length && this.deps.player.queuedSeconds < this.leadSec) {
          const i = this.nextPush;
          const clip = await this.clipFor(i);
          if (!alive()) return;
          if (clip.pcm.length === 0) { this.nextPush++; continue; }
          this.deps.player.push(i, clip.pcm, clip.sampleRate, this.utts[i].pauseAfter * this.pauseScale);
          this.nextPush = i + 1;
          if (this.prefetch < this.nextPush) this.prefetch = this.nextPush;
          this.maybeRelease();
          this.emit();
          continue;
        }
        if (this.prefetch < this.utts.length && this.estSec(this.nextPush, this.prefetch) < this.aheadSec) {
          await this.clipFor(this.prefetch);
          if (!alive()) return;
          this.prefetch++;
          continue;
        }
        this.maybeRelease();
        if (this.nextPush >= this.utts.length && this.prefetch >= this.utts.length) return;
        await sleep(200);
      } catch (e) {
        if (!alive()) return;
        this.wantPlaying = false;
        this.deps.player.pause();
        this.setState('error', `Speech generation stopped: ${(e as Error).message}. Your place is saved. Tap play to try again.`);
        void this.savePosition(true);
        return;
      }
    }
  }

  /** Generate audio for a range ahead of time (for offline / locked-screen listening). */
  async prepare(fromIdx: number, toIdx: number, onProgress: (done: number, total: number, etaSec: number) => void, signal?: { cancelled: boolean }): Promise<void> {
    const t0 = performance.now();
    let done = 0;
    const total = toIdx - fromIdx;
    for (let i = fromIdx; i < toIdx; i++) {
      if (signal?.cancelled) return;
      const key = cacheKey(ENGINE_VERSION, this.book.voice, this.utts[i].spoken);
      if (!(await this.deps.cache.has(key))) await this.clipFor(i);
      done++;
      const el = (performance.now() - t0) / 1000;
      onProgress(done, total, (el / done) * (total - done));
      if (done % 8 === 0) await sleep(0);
    }
  }
  chapterRange(chapterId: number): [number, number] {
    return [this.chapterStart.get(chapterId) ?? 0, this.chapterEndIdx(chapterId)];
  }

  // ---------------------------------------------------------------- persistence
  async savePosition(force: boolean): Promise<void> {
    const now = Date.now();
    if (!force && now - this.lastSave < 1500) return;
    this.lastSave = now;
    const u = this.utts[this.idx];
    if (!u) return;
    this.book.pos = { block: u.block, offset: u.start, updatedAt: now, seconds: this.estSec(0, this.idx) };
    this.book.segVersion = SEG_VERSION;
    try { await putBook(this.book); } catch { /* storage may be full; the next save will retry */ }
  }

  // ---------------------------------------------------------------- lock screen / headphones
  private msBound = false;
  private bindMediaSession() {
    if (this.msBound || !('mediaSession' in navigator)) return;
    this.msBound = true;
    const ms = navigator.mediaSession;
    const set = (a: MediaSessionAction, f: MediaSessionActionHandler) => { try { ms.setActionHandler(a, f); } catch { /* unsupported */ } };
    set('play', () => void this.play());
    set('pause', () => this.pause());
    set('stop', () => this.pause());
    set('previoustrack', () => this.prevChapter());
    set('nexttrack', () => this.nextChapter());
    set('seekbackward', (d) => this.skip(-(d.seekOffset ?? 15)));
    set('seekforward', (d) => this.skip(d.seekOffset ?? 30));
    this.updateMediaSession();
  }
  coverUrl?: string;
  private updateMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const ch = this.chapterOf(this.idx);
    navigator.mediaSession.metadata = new MediaMetadata({
      title: ch?.title ?? this.book.title, artist: this.book.author ?? '', album: this.book.title,
      artwork: this.coverUrl ? [{ src: this.coverUrl, sizes: '512x512', type: 'image/png' }] : [],
    });
    navigator.mediaSession.playbackState = this.wantPlaying ? 'playing' : 'paused';
  }

  dispose() {
    this.stopProducer();
    this.wantPlaying = false;
    this.deps.player.clear();
    this.deps.player.pause();
    void this.savePosition(true);
  }
}
