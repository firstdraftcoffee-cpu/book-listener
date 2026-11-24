# Voice engine evaluation

Goal: the most natural narration that runs fully on the phone, with permission for commercial redistribution, and with Irish, British and American voices, male and female.

## What was actually measured
Only Kokoro could be run in the build environment (Hugging Face and similar hosts were blocked, so other engines' model files were unreachable). All speeds below are on a small 2-core cloud CPU, which is **slower than a recent iPhone should be, but this is not confirmed on an iPhone**. "RTF" is time taken divided by audio length; below 1.0 is faster than real time.

| Test (same 4.3 s sentence, Kokoro-82M, int8) | RTF |
|---|---|
| Native Python, `kokoro-onnx` | 0.62 to 0.68 |
| Chrome, WebAssembly, single thread | 1.3 to 1.5 |
| Chrome, WebAssembly, 2 threads (with the two headers) | 0.79 to 1.04 |

The in-browser output matched the Python reference length (4.28 s vs 4.29 s), which shows the browser pipeline (phonemes, tokens, voice style, model) is correct. In the full app on a 100,000-word book, generation ran at about 0.9 seconds of work per second of audio on the same CPU, with 27 seconds of audio queued ahead and no gaps over 40 seconds of play.

Consequence: on slow devices generation is close to real time, so the app keeps minutes of narration queued ahead and offers **Prepare chapter / rest of book**, which makes audio in advance and stores it.

## Candidates
| Engine | Quality (as published by its authors) | Size | Licence of weights | Irish accent | Status here |
|---|---|---|---|---|---|
| **Kokoro-82M** | Highest-rated small open voice; per-voice grades published (best: Heart A, Bella A-) | about 92 MB int8 + about 0.5 MB per voice | Apache-2.0 | None | **Chosen. Benchmarked.** Includes British (Emma, Isabella, Alice, Lily, George, Fable, Lewis, Daniel) and American voices |
| **Piper** (VITS) | Good, plainer delivery | about 60 MB per voice | Voice-specific; Jenny (Dioco) allows commercial use with credit | **Yes: Jenny (Dioco), Irish-accented female** | **Chosen for the Irish voice.** Code path written; model not downloadable here, so **not benchmarked and not yet heard** |
| Supertonic | Not assessed here | not verified | OpenRAIL-M (use restrictions apply) | not verified | Not benchmarked. Evaluate next |
| Pocket TTS | Not assessed here | not verified | CC-BY-4.0 reported | not verified | Not benchmarked. Evaluate next |

I could not hear any audio. Whether the Kokoro voices sound natural enough for a 300-page book, and whether Jenny's accent is convincingly Irish, are **judgements only you can make** by ear. The Settings screen has a Preview button for each voice for exactly this.

## Why Kokoro plus Piper
- Kokoro gives the best quality per megabyte with a clear commercial licence, and has the widest choice of British and American voices.
- No small open model with an Irish-accent voice at Kokoro's quality was found; Piper's Jenny (Dioco) is the one Irish-accented voice with a commercial-use dataset licence.
- Both go through the same ONNX Runtime Web engine, so adding more voices is a catalogue entry.

## Pronunciation
Both engines turn text into sounds through eSpeak NG. On top of that the app has a built-in lexicon of about 200 Irish names, places and terms (Siobhán, Dún Laoghaire, Ó Súilleabháin, taoiseach, and so on) written as pronunciations from published guides. **They are not verified by ear.** Fix any that are wrong with a pronunciation rule (Reader: tap a sentence, Fix a pronunciation; or Settings).

## Speed control
0.5x to 2.5x using a pitch-preserving stretch (WSOLA), applied to stored audio, so changing speed never regenerates anything. Unit-tested for duration and pitch at 0.5, 0.8, 1.25, 1.5, 2.0 and 2.5. Speech above about 2x loses some clarity, as with any stretch method.
