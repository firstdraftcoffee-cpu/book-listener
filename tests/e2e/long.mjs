// Big-book test: import a 300-page PDF and a 100,000-word text file, check speed, memory, chapters, and playback from a mid-book position.
import { chromium } from 'playwright-core';
const URL_ = 'http://127.0.0.1:4173/?models=http://127.0.0.1:8099/kokoro';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info'] });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(URL_); await p.waitForSelector('.empty');
const mem = () => p.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1048576));
for (const [file, name] of [['tests/fixtures/pdf-300pages.pdf', '300-page PDF'], ['tests/fixtures/book-100k.txt', '100,000-word text']]) {
  const n0 = await p.$$eval('.book', (e) => e.length);
  const t = Date.now();
  await p.setInputFiles('input[type=file]', file);
  await p.waitForFunction((n) => document.querySelectorAll('.book').length === n + 1, n0, { timeout: 300000 });
  console.log(`${name}: imported in ${((Date.now() - t) / 1000).toFixed(1)} s, JS heap ${await mem()} MB`);
  console.log('  ', await p.$$eval('.notice', (e) => e.map((x) => x.textContent).join(' | ')));
}
// open the newest (100k) book, jump to the middle, and play
await p.click('.book >> nth=0'); await p.waitForSelector('.prose .s');
const t1 = Date.now();
await p.waitForFunction(() => window.__app.narrator?.utts?.length > 1000, null, { timeout: 120000 });
const info = await p.evaluate(() => ({ utts: window.__app.narrator.utts.length, chapters: window.__app.book.chapters.filter((c) => c.included).length }));
console.log('narration list built:', info, 'JS heap', await mem(), 'MB');
await p.evaluate(() => window.__app.narrator.seekTo(Math.floor(window.__app.narrator.utts.length * 0.6)));
await p.click('.tabs button:nth-child(3)'); await p.click('.play');
await p.waitForFunction(() => window.__app.narrator.state === 'playing', null, { timeout: 120000 });
const s0 = await p.evaluate(() => window.__app.narrator.idx);
await p.waitForTimeout(40000);
const s1 = await p.evaluate(() => ({ idx: window.__app.narrator.idx, st: window.__app.narrator.state, q: window.__app.player.queuedSeconds, rtf: window.__app.narrator.snapshot().genMsPerSec }));
console.log(`mid-book playback: sentence ${s0} -> ${s1.idx} in 40 s, state ${s1.st}, ${s1.q.toFixed(0)} s queued, generation work/audio ${s1.rtf.toFixed(2)}`);
console.log('heap after playback', await mem(), 'MB; page errors:', errs);
await b.close();
