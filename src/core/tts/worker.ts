/// <reference lib="webworker" />
// Runs speech synthesis off the main thread so the interface stays smooth.
import * as ort from 'onnxruntime-web/wasm';
import { phonemize } from 'phonemizer';
import { KokoroEngine } from './kokoro';
import { PiperEngine, type PiperConfig } from './piper';
import { fetchCached } from './model-store';
import { KOKORO_SAMPLE_RATE, voiceById } from './voices';

export type WorkerIn =
  | { type: 'init'; wasmBase: string; kokoroBase: string; piperBase: string; threads: number }
  | { type: 'prepare'; voice: string; reqId: number }
  | { type: 'synth'; id: number; voice: string; spoken: string; speed: number };
export type WorkerOut =
  | { type: 'ready' }
  | { type: 'progress'; reqId: number; loaded: number; total: number; what: string }
  | { type: 'prepared'; reqId: number; voice: string }
  | { type: 'audio'; id: number; pcm: Int16Array; sampleRate: number; ms: number }
  | { type: 'error'; id?: number; reqId?: number; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let cfg!: Extract<WorkerIn, { type: 'init' }>;
let kokoro: KokoroEngine | null = null;
const piper = new Map<string, PiperEngine>();
const ph = (t: string, l: string) => phonemize(t, l);

async function sessionFrom(buf: ArrayBuffer) {
  return ort.InferenceSession.create(new Uint8Array(buf), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
}

async function prepare(voiceId: string, reqId: number) {
  const v = voiceById(voiceId);
  if (!v) throw new Error(`Unknown voice ${voiceId}`);
  const prog = (what: string) => (p: { loaded: number; total: number }) => ctx.postMessage({ type: 'progress', reqId, what, ...p } satisfies WorkerOut);
  if (v.engine === 'kokoro') {
    if (!kokoro) {
      const model = await fetchCached(`${cfg.kokoroBase}/onnx/model_quantized.onnx`, prog('Voice engine'));
      const session = await sessionFrom(model);
      kokoro = new KokoroEngine(ort as any, session, ph, async (id) => {
        const b = await fetchCached(`${cfg.kokoroBase}/voices/${id}.bin`);
        return new Float32Array(b);
      });
    }
    await fetchCached(`${cfg.kokoroBase}/voices/${v.id}.bin`, prog(`Voice: ${v.name}`));
  } else {
    if (!piper.has(v.id)) {
      const name = v.id.split(':')[1];
      const model = await fetchCached(`${cfg.piperBase}/${name}.onnx`, prog(`Voice: ${v.name}`));
      const conf = JSON.parse(new TextDecoder().decode(await fetchCached(`${cfg.piperBase}/${name}.onnx.json`))) as PiperConfig;
      piper.set(v.id, new PiperEngine(ort as any, await sessionFrom(model), conf, ph));
    }
  }
}

function toInt16(a: Float32Array): Int16Array {
  const o = new Int16Array(a.length);
  for (let i = 0; i < a.length; i++) { const s = Math.max(-1, Math.min(1, a[i])); o[i] = s < 0 ? s * 0x8000 : s * 0x7fff; }
  return o;
}

ctx.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const m = e.data;
  try {
    if (m.type === 'init') {
      cfg = m;
      ort.env.wasm.wasmPaths = { mjs: `${m.wasmBase}ort-wasm-simd-threaded.mjs`, wasm: `${m.wasmBase}ort-wasm-simd-threaded.wasm` } as any;
      ort.env.wasm.numThreads = (self as any).crossOriginIsolated ? Math.max(1, Math.min(4, m.threads)) : 1;
      ort.env.wasm.proxy = false;
      ctx.postMessage({ type: 'ready' } satisfies WorkerOut);
    } else if (m.type === 'prepare') {
      await prepare(m.voice, m.reqId);
      ctx.postMessage({ type: 'prepared', reqId: m.reqId, voice: m.voice } satisfies WorkerOut);
    } else if (m.type === 'synth') {
      const t0 = performance.now();
      const v = voiceById(m.voice)!;
      await prepare(m.voice, -1);
      let pcm: Float32Array; let sr: number;
      if (v.engine === 'kokoro') { pcm = await kokoro!.synth(m.spoken, v.id, v.lang, m.speed); sr = KOKORO_SAMPLE_RATE; }
      else { const p = piper.get(v.id)!; pcm = await p.synth(m.spoken, m.speed); sr = p.sampleRate; }
      const out = toInt16(pcm);
      ctx.postMessage({ type: 'audio', id: m.id, pcm: out, sampleRate: sr, ms: performance.now() - t0 } satisfies WorkerOut, [out.buffer]);
    }
  } catch (err) {
    ctx.postMessage({ type: 'error', id: (m as any).id, reqId: (m as any).reqId, message: String((err as Error)?.message ?? err) } satisfies WorkerOut);
  }
};
