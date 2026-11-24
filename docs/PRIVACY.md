# Privacy

## In plain words
Your books never leave your device. There are no accounts, no analytics, no tracking, no advertising, and no servers of ours.

## What is stored, and where
All of it is inside this app's storage on your device and nowhere else:
- Books (text and chapter structure), covers, your position, bookmarks, notes and flags, pronunciation rules, settings.
- Generated narration audio (a cache you can clear).
- Downloaded voice files.
- The app's own files, so it opens offline.

## What uses the network
- Downloading the app itself from where you host it.
- Downloading voice files, one time per voice, from the address in Settings (Hugging Face by default). That request says which file you want and reveals your IP address to that host, as any download does. It never contains your text.
- Nothing else. The app contains no analytics, crash reporting, fonts from a font service, or other third-party calls. (Fonts are bundled.)

You can confirm this: switch on Airplane Mode after the voice has downloaded, and everything still works. The test suite includes this check (`tests/e2e/offline.mjs`).

## Deleting
- Delete a book: Library, Delete. This also removes its notes and saved audio.
- Delete everything: Settings, Delete everything on this device. Removes books, notes, audio, voices, settings and the offline app files.
- Removing the app from the Home Screen normally clears its storage too (iOS behaviour, not checked on a device).

## Limits to be aware of
- Exporting a file (notes or chapter audio) saves it where you choose; after that it is outside the app.
- iOS may clear web-app storage if the app is unused for a long time unless it is on the Home Screen. Settings shows whether storage is protected.
