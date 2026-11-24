// Catalogue of narrator voices. Kokoro voices share one ~92 MB model plus a ~0.5 MB file per voice.
// Piper voices are one ~60 MB file each. Nothing is downloaded until the person chooses it.

export type Accent = 'Irish' | 'British' | 'American';
export type EngineId = 'kokoro' | 'piper';

export interface VoiceInfo {
  id: string;
  name: string;
  engine: EngineId;
  accent: Accent;
  gender: 'female' | 'male';
  /** Kokoro: letter prefix tells espeak which English to use */
  lang: 'en-us' | 'en-gb';
  /** Kokoro's own published quality grade for the voice, where known (A best) */
  grade?: string;
  note?: string;
  /** bytes, approximate, shown before download */
  size: number;
  credit?: string;
}

const k = (id: string, name: string, accent: Accent, gender: 'female' | 'male', grade: string, note?: string): VoiceInfo => ({
  id, name, engine: 'kokoro', accent, gender, lang: accent === 'American' ? 'en-us' : 'en-gb', grade, note, size: 520_000,
});

export const VOICES: VoiceInfo[] = [
  // Irish-accented (Piper). Credit required by the dataset licence.
  {
    id: 'piper:en_GB-jenny_dioco-medium', name: 'Jenny', engine: 'piper', accent: 'Irish', gender: 'female', lang: 'en-gb',
    size: 63_200_000, credit: 'Jenny (Dioco) — Irish-accented voice, Dioco Group. Commercial use permitted with attribution.',
    note: 'Irish-accented. Plainer delivery than the Kokoro voices.',
  },
  // British
  k('bf_emma', 'Emma', 'British', 'female', 'B-', 'Warm, steady. A good all-round audiobook voice.'),
  k('bf_isabella', 'Isabella', 'British', 'female', 'C'),
  k('bf_alice', 'Alice', 'British', 'female', 'D'),
  k('bf_lily', 'Lily', 'British', 'female', 'D'),
  k('bm_george', 'George', 'British', 'male', 'C', 'Calm, measured.'),
  k('bm_fable', 'Fable', 'British', 'male', 'C', 'Storyteller tone.'),
  k('bm_lewis', 'Lewis', 'British', 'male', 'D+'),
  k('bm_daniel', 'Daniel', 'British', 'male', 'D'),
  // American
  k('af_heart', 'Heart', 'American', 'female', 'A', 'Kokoro’s highest-rated voice.'),
  k('af_bella', 'Bella', 'American', 'female', 'A-'),
  k('af_nicole', 'Nicole', 'American', 'female', 'B-', 'Soft, close-mic feel.'),
  k('af_sarah', 'Sarah', 'American', 'female', 'C+'),
  k('af_kore', 'Kore', 'American', 'female', 'C+'),
  k('af_aoede', 'Aoede', 'American', 'female', 'C+'),
  k('af_sky', 'Sky', 'American', 'female', 'C-'),
  k('am_michael', 'Michael', 'American', 'male', 'C+'),
  k('am_fenrir', 'Fenrir', 'American', 'male', 'C+'),
  k('am_puck', 'Puck', 'American', 'male', 'C+'),
  k('am_adam', 'Adam', 'American', 'male', 'F+'),
];

export const DEFAULT_VOICE = 'bf_emma';

export function voiceById(id: string): VoiceInfo | undefined {
  return VOICES.find((v) => v.id === id);
}

export const KOKORO_SAMPLE_RATE = 24_000;
export const PIPER_SAMPLE_RATE = 22_050;

/** Where model files come from. Self-host by changing this in Settings > Storage. */
export const DEFAULT_MODEL_BASE = {
  kokoro: 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main',
  piper: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/jenny_dioco/medium',
};
