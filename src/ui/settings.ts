// Small, synchronous app settings. Held in localStorage (device only) so they are available at start-up.
import { DEFAULT_VOICE } from '../core/tts/voices';
import type { PronunciationRule } from '../core/types';

export interface Settings {
  voice: string;
  speed: number;
  theme: 'auto' | 'light' | 'dark';
  pauseScale: number;
  irishLexicon: boolean;
  narrateFootnotes: boolean;
  readerSize: number; // px
  modelBase?: string; // override for self-hosted model files
  cacheGB: number;
  globalRules: PronunciationRule[];
  lastBook?: string;
}
const KEY = 'bl-settings-v1';
const DEFAULTS: Settings = {
  voice: DEFAULT_VOICE, speed: 1, theme: 'auto', pauseScale: 1, irishLexicon: true, narrateFootnotes: false,
  readerSize: 19, cacheGB: 1.5, globalRules: [],
};
let cur: Settings | null = null;
export function settings(): Settings {
  if (cur) return cur;
  try { cur = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { cur = { ...DEFAULTS }; }
  return cur!;
}
export function updateSettings(p: Partial<Settings>): Settings {
  cur = { ...settings(), ...p };
  try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch { /* private mode */ }
  applyTheme();
  return cur;
}
export function applyTheme() {
  const t = settings().theme;
  document.documentElement.dataset.theme = t === 'auto' ? '' : t;
  document.documentElement.style.setProperty('--read-size', `${settings().readerSize}px`);
}
