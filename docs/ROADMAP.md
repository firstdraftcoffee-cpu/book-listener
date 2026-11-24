# Roadmap

## Next (before anyone else uses it)
1. Install on your iPhone and run the checklist in `TEST-REPORT.md` under "Not tested". Report what breaks.
2. Listen to every voice; choose a default. Tell me which Irish names are wrong and I fix the lexicon.
3. Try three of your own chapters and check chapter detection, header/footer removal and footnotes.

## Then
4. If lock-screen or background audio is unreliable on iOS: wrap the same app in a small native shell (Capacitor) with real background audio and remote controls. Needs a Mac and Xcode.
5. Evaluate Supertonic and Pocket TTS against Kokoro for quality and speed on a real iPhone.
6. Local OCR for scanned PDFs (Tesseract compiled to WebAssembly, loaded only when needed).
7. M4B export with chapter markers (WebCodecs AAC plus a small MP4 writer), feature-checked per browser.
8. Replace eSpeak NG with a permissively licensed pronunciation front end (needed for any commercial release).
9. Host voice files on your own storage (for example Cloudflare R2, free tier) so the app does not depend on Hugging Face.

## Later
10. Whole-book "Prepare" that continues while charging, with a clear progress screen.
11. Pronunciation sharing between books; import/export of rule lists.
12. Review workflow: filter by flag type, mark resolved in bulk, export to Word.
13. Commercial packaging: payment, licence checks, privacy policy for the store, support page. (Deliberately not started.)
