// Shared application state: the one speech engine, the cache, the player and whichever book is open.
import { TtsClient } from '../core/tts/client';
import { Player } from '../core/audio/player';
import { AudioCache } from '../core/audio/cache';
import { Narrator } from '../core/audio/narrator';
import { DEFAULT_NARRATION, type NarrationOptions } from '../core/text/utterances';
import { DEFAULT_MODEL_BASE, voiceById } from '../core/tts/voices';
import { getBook, getCover, listAnnotations } from '../core/store/db';
import type { Annotation, BookRecord } from '../core/types';
import { settings, updateSettings } from './settings';

export type Screen = 'library' | 'reader' | 'player' | 'settings';

class App {
  tts!: TtsClient;
  player = new Player();
  cache = new AudioCache(settings().cacheGB * 1024 ** 3);
  narrator?: Narrator;
  book?: BookRecord;
  annotations: Annotation[] = [];
  screen: Screen = 'library';
  voiceReady = new Set<string>();
  voiceLoading?: { voice: string; frac: number; what: string };
  private subs = new Set<() => void>();

  constructor() { this.makeTts(); }

  makeTts() {
    this.tts?.terminate();
    const q = new URLSearchParams(location.search).get('models');
    const base = q ?? settings().modelBase;
    this.tts = new TtsClient(base ? { kokoroBase: base, piperBase: `${base}/piper` } : {});
    this.voiceReady.clear();
  }
  on(fn: () => void) { this.subs.add(fn); return () => this.subs.delete(fn); }
  changed() { for (const s of this.subs) s(); }
  go(s: Screen) { this.screen = s; this.changed(); }

  narration(): NarrationOptions {
    const s = settings();
    return {
      ...DEFAULT_NARRATION,
      rules: [...s.globalRules, ...(this.book?.pronunciation ?? [])],
      irishLexicon: s.irishLexicon, narrateFootnotes: s.narrateFootnotes,
    };
  }

  async modelsBase() {
    const q = new URLSearchParams(location.search).get('models');
    const b = q ?? settings().modelBase;
    return { kokoro: b ?? DEFAULT_MODEL_BASE.kokoro, piper: b ? `${b}/piper` : DEFAULT_MODEL_BASE.piper };
  }

  /** Make sure a voice's files are on the device (downloads on first use, then works offline). */
  async ensureVoice(voice: string, onProgress?: (frac: number, what: string) => void): Promise<void> {
    if (this.voiceReady.has(voice)) return;
    this.voiceLoading = { voice, frac: 0, what: 'Starting' };
    this.changed();
    try {
      await this.tts.prepare(voice, (p) => {
        const frac = p.total ? p.loaded / p.total : 0;
        this.voiceLoading = { voice, frac, what: p.what };
        onProgress?.(frac, p.what);
        this.changed();
      });
      this.voiceReady.add(voice);
    } finally { this.voiceLoading = undefined; this.changed(); }
  }

  async open(id: string, start = false): Promise<void> {
    const book = await getBook(id);
    if (!book) return;
    if (this.narrator) this.narrator.dispose();
    this.book = book;
    updateSettings({ lastBook: id });
    this.annotations = await listAnnotations(id);
    this.cache.limitBytes = settings().cacheGB * 1024 ** 3;
    const n = new Narrator(book, this.narration(), { tts: this.tts, cache: this.cache, player: this.player });
    const cover = await getCover(id);
    if (cover) n.coverUrl = URL.createObjectURL(cover);
    n.pauseScale = settings().pauseScale;
    this.narrator = n;
    this.changed();
    await n.load();
    this.changed();
    if (start) this.go('player');
  }

  async refreshAnnotations() {
    if (this.book) this.annotations = await listAnnotations(this.book.id);
    this.changed();
  }

  /** Called when pronunciation / number settings change so the narrator rebuilds its sentence list. */
  async refreshNarration() { if (this.narrator) await this.narrator.reload(this.narration()); this.changed(); }

  voiceName(id = this.book?.voice ?? settings().voice) { return voiceById(id)?.name ?? id; }
}

export const app = new App();
