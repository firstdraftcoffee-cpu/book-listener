# Architecture

## Decision: web app (PWA) first, native iOS shell later
| | PWA (built) | Native Swift app |
|---|---|---|
| Testable in the build environment (Linux) | Yes | No, needs a Mac and Xcode |
| Install | Add to Home Screen, no App Store | App Store or TestFlight, Apple developer account |
| Speech engine | ONNX Runtime Web (WebAssembly) | Core ML or ONNX Runtime Mobile |
| Reliable lock-screen audio | Known WebKit problems (see below) | Solid |
| Cost | Free hosting | Developer fee, Mac |

The PWA was chosen because it is the only version that could be built and tested end to end here. The playback layer sits behind a small interface (`src/core/audio/player.ts`), so a native or Capacitor shell can replace it later without touching document parsing, text preparation or storage.

### Verified iPhone browser facts (from WebKit bug reports and Apple forums, not from a device)
Home-screen web apps on iOS have had open bugs where audio goes silent after the app is reopened (WebKit 291892, 295518), where lock-screen controls stop after about 30 seconds paused (198277), and where ended/next-track events do not fire in the background (173332, 221413, 261858). Mitigations built in, all **awaiting physical-device verification**:
- Audio plays from an AudioWorklet queue (no `ended` events needed to advance).
- `navigator.audioSession.type = 'playback'` where available.
- A silent looping `<audio>` element plus the Media Session API for lock-screen and Bluetooth controls.
- On returning to the app, the audio context is resumed and the position is saved on every hide.
- A large look-ahead and "prepare ahead" so playback does not depend on generating audio while the screen is locked.

## Modules (`src/core`)
| Folder | Job |
|---|---|
| `doc/` | Import PDF, EPUB, DOCX, TXT, Markdown, pasted text. Finds chapters, removes running headers/footers/page numbers, repairs hyphenated line breaks, keeps paragraphs, detects footnotes and bibliography/index, never rewrites the author's text. |
| `text/` | Turns display text into speech text only: numbers, dates, money, abbreviations, Roman numerals, Irish names (built-in lexicon), user pronunciation rules, sentence splitting, pauses. Display text is never changed. |
| `tts/` | Kokoro-82M and Piper through ONNX Runtime Web in a worker; voice catalogue; model download and storage. |
| `audio/` | Cache of generated sentences (IndexedDB, size-capped, least-recently-used), pitch-preserving speed (WSOLA), gapless AudioWorklet player, the narrator that keeps audio queued ahead and saves position. |
| `store/` | IndexedDB: books, chapters, covers, notes/flags, settings, audio. |
| `export/` | Notes as Markdown, chapter audio as WAV. |

UI is in `src/ui` (vanilla TypeScript, no framework): Library, Reader, Player, Settings.

## Data flow
1. File chosen, then parsed in the page (PDF.js, JSZip). Blocks and chapters saved to IndexedDB.
2. On play, the narrator builds a sentence list (`Utterance`), each pointing at an exact character range of the author's text.
3. Sentences are synthesised in a worker, stored in the audio cache, sped to the chosen rate, and queued to the AudioWorklet. A few minutes are kept queued ahead.
4. The sentence being spoken is highlighted; position is saved about every 1.5 seconds and on every pause, hide, and error.

## Position safety
Position is stored as (paragraph, character offset), not as a time. Changing speed, voice, pronunciation rules or pause length rebuilds the sentence list and finds the same place again.

## Hosting requirements
Two response headers (in `public/_headers`): `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. These switch on multi-threaded WebAssembly, which measured about 1.5 to 2 times faster. Without them the app still works, single-threaded.

## Voice file layout for self-hosting
```
<base>/onnx/model_quantized.onnx            (Kokoro engine, about 92 MB)
<base>/voices/<voice id>.bin                (Kokoro voices, about 0.5 MB each)
<base>/piper/<name>.onnx and .onnx.json     (Piper voices)
```
Serve with `Access-Control-Allow-Origin: *` and `Cross-Origin-Resource-Policy: cross-origin`.
