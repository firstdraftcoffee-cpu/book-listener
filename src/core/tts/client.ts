// Main-thread handle on the speech worker.
import type { WorkerIn, WorkerOut } from './worker';
import { DEFAULT_MODEL_BASE } from './voices';

export interface Clip { pcm: Int16Array; sampleRate: number; ms: number }

export class TtsClient {
  private w: Worker;
  private seq = 1;
  private pending = new Map<number, { res: (c: Clip) => void; rej: (e: Error) => void }>();
  private preps = new Map<number, { res: () => void; rej: (e: Error) => void; onProgress?: (p: { loaded: number; total: number; what: string }) => void }>();
  private ready: Promise<void>;
  private lastSynth: Promise<unknown> = Promise.resolve();

  constructor(opts: { kokoroBase?: string; piperBase?: string } = {}) {
    this.w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.ready = new Promise((res) => {
      this.w.onmessage = (e: MessageEvent<WorkerOut>) => {
        const m = e.data;
        if (m.type === 'ready') res();
        else if (m.type === 'audio') this.pending.get(m.id)?.res({ pcm: m.pcm, sampleRate: m.sampleRate, ms: m.ms }), this.pending.delete(m.id);
        else if (m.type === 'progress') this.preps.get(m.reqId)?.onProgress?.({ loaded: m.loaded, total: m.total, what: m.what });
        else if (m.type === 'prepared') this.preps.get(m.reqId)?.res(), this.preps.delete(m.reqId);
        else if (m.type === 'error') {
          const err = new Error(m.message);
          if (m.id !== undefined && this.pending.has(m.id)) { this.pending.get(m.id)!.rej(err); this.pending.delete(m.id); }
          else if (m.reqId !== undefined && this.preps.has(m.reqId)) { this.preps.get(m.reqId)!.rej(err); this.preps.delete(m.reqId); }
        }
      };
    });
    const base = import.meta.env.BASE_URL;
    this.post({
      type: 'init', wasmBase: new URL(`${base}ort/`, location.href).href,
      kokoroBase: opts.kokoroBase ?? DEFAULT_MODEL_BASE.kokoro, piperBase: opts.piperBase ?? DEFAULT_MODEL_BASE.piper,
      threads: navigator.hardwareConcurrency || 2,
    });
  }
  private post(m: WorkerIn) { this.w.postMessage(m); }

  async prepare(voice: string, onProgress?: (p: { loaded: number; total: number; what: string }) => void): Promise<void> {
    await this.ready;
    const reqId = this.seq++;
    return new Promise((res, rej) => { this.preps.set(reqId, { res, rej, onProgress }); this.post({ type: 'prepare', voice, reqId }); });
  }

  async synth(spoken: string, voice: string, speed = 1): Promise<Clip> {
    await this.ready;
    const id = this.seq++;
    return new Promise((res, rej) => { this.pending.set(id, { res, rej }); this.post({ type: 'synth', id, voice, spoken, speed }); });
  }
  terminate() { this.w.terminate(); }
}
