# Book Listener

A private audiobook reader. Add a manuscript (PDF, EPUB, Word, text, Markdown or pasted text) and it reads it aloud to you, in a natural voice, entirely on your own device. Nothing is uploaded. After the voice is downloaded once, it works with the internet switched off.

Version 0.1. Built as a web app (PWA) that you add to your iPhone Home Screen.

> **Honest status.** Everything below marked "tested" was run in desktop Chrome, phone-sized. Nothing has yet been run on a physical iPhone. Lock-screen and background playback are built but **awaiting physical-device verification**. See `docs/TEST-REPORT.md` and `docs/LIMITATIONS.md`.

## What you need
- A computer to build it (once), with Node.js 20 or newer.
- A free Cloudflare account to put it online (any static host works, but it must send two special headers, and Cloudflare Pages does this with the included `_headers` file).
- An iPhone (iOS 17 or newer recommended) to use it.

## Try it on your computer first
1. Open Terminal in this folder.
2. Type `npm install` and press Return. Wait for it to finish.
3. Type `npm run build` and press Return.
4. Type `npm run preview` and press Return.
5. Open the address it prints (http://127.0.0.1:4173) in Chrome.
6. Click **Add a book**, pick a file, press **Play** on the Player tab. The first play downloads the voice (about 90 MB, one time).

## Put it online (Cloudflare Pages, free)
Easiest way, no Git needed:
1. Run `npm run build`. This makes a folder called `dist`.
2. Go to https://dash.cloudflare.com, then **Workers & Pages**, then **Create**, then **Pages**, then **Upload assets**.
3. Name it (for example `book-listener`), drag the whole `dist` folder in, press **Deploy**.
4. Cloudflare gives you an address like `https://book-listener.pages.dev`.

If you prefer to deploy from GitHub, connect the repository in Cloudflare Pages with build command `npm run build` and output folder `dist`. After that, each update is this block:

```
cd ~/book-listener
git add .
git commit -m "Describe the change"
git push
```

(First time only: `git init`, then `git remote add origin <your repo address>`.)

## Put it on your iPhone
1. On the iPhone, open your address in **Safari** (it must be Safari).
2. Tap the Share button, then **Add to Home Screen**, then **Add**.
3. Open Book Listener from the Home Screen icon. Add a book. Press Play on the Player tab and let the voice download over Wi-Fi.
4. Tap **Prepare rest of book** on the Player tab if you want to be sure it plays through a locked screen or on a flight without pausing.

## Checking it works offline
Open the app, play for a few seconds, then switch on Airplane Mode and close and reopen the app from the Home Screen. Your book and place should still be there and Play should work.

## Using your own copy of the voice files
By default the app downloads voices from Hugging Face. To host them yourself, copy the folder layout in `docs/ARCHITECTURE.md` to your own host (with CORS enabled) and paste its address in **Settings, Voice file source**.

## Commands
| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Type-check, build, and write the offline service worker into `dist` |
| `npm run preview` | Serve `dist` locally |
| `npm test` | Run the unit tests |
| `npm run fixtures` | Make the synthetic test books in `tests/fixtures` |

## The documents
- `docs/ARCHITECTURE.md`: how it is built and why a web app first
- `docs/TTS-EVALUATION.md`: the voice engines compared, and the measured speeds
- `docs/LICENSES.md`: every dependency and voice, with commercial-use notes
- `docs/PRIVACY.md`: exactly what is stored and what touches the network
- `docs/TEST-REPORT.md`: what was tested, what passed, what is still unverified
- `docs/LIMITATIONS.md`: what does not work yet
- `docs/ROADMAP.md`: what comes next
