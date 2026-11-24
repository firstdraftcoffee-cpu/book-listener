# Outstanding limitations

Most important first.

1. **Not yet run on an iPhone.** Background and lock-screen playback depend on iOS web-app behaviour with known open bugs. If they prove unreliable, the fix is a thin native wrapper (see roadmap); the rest of the app is reusable.
2. **eSpeak NG (GPL-3.0) is inside the speech pipeline.** Fine for personal use; must be resolved before selling. See `LICENSES.md`.
3. **Generation speed on phones is unmeasured.** On the slow test CPU it ran at about real time, so a long listen may briefly show "Preparing the next passage" until the buffer builds. Use **Prepare rest of book** before a long journey.
4. **Voice quality and accents unjudged.** Nobody has heard these voices through the app yet, including the Irish voice, and the Irish name lexicon has not been checked by ear.
5. **Default voice download path unverified.** Hugging Face was blocked in the build environment. If the default address has changed, set a different one in Settings or host the files yourself.
6. **No OCR.** Scanned PDFs are detected but cannot be read yet.
7. **No M4B export.** Chapter audio exports as one WAV file per chapter (large; about 170 MB per hour).
8. **Speed above about 2x** sounds more processed; this is inherent to time-stretching.
9. **Storage.** About 1.4 GB per 8 hours of narration if you prepare a whole book. The cache limit is adjustable; iOS may evict storage for apps not on the Home Screen.
10. **Only English voices.** Other languages are not offered.
11. **One book narrates at a time**, and changing voice mid-book re-generates audio from that point.
12. **Complex layouts** (multi-column PDFs, tables, sidebars) are read in the order the PDF stores them, which may be wrong. Footnote detection uses type size and position and can miss or over-detect.
13. **Tracked changes** in DOCX: deletions are skipped, insertions are read as final text.
14. **Accessibility** is designed for (real buttons, labels, focus, reduced motion) but not tested with VoiceOver.
