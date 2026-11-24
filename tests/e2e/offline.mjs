// Airplane-mode test: install, download voice, then cut the network completely, reload and keep listening.
import { chromium } from 'playwright-core';
const URL_ = 'http://127.0.0.1:4173/?models=http://127.0.0.1:8099/kokoro';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
const bad = [];
p.on('pageerror', (e) => bad.push(e.message));
await p.goto(URL_); await p.waitForSelector('.empty');
await p.evaluate(() => navigator.serviceWorker.ready.then(() => 'ok'));
console.log('service worker ready');
await p.setInputFiles('input[type=file]', 'tests/fixtures/book.docx');
await p.waitForSelector('.book');
await p.click('.book'); await p.waitForSelector('.prose .s');
await p.click('.tabs button:nth-child(3)'); await p.click('.play');
await p.waitForFunction(() => window.__app.narrator?.state === 'playing', null, { timeout: 240000 });
await p.waitForFunction(() => window.__app.narrator.idx >= 3, null, { timeout: 60000 });
await p.click('.play'); // pause
await p.waitForTimeout(500);
const before = await p.evaluate(() => ({ idx: window.__app.narrator.idx, block: window.__app.book.pos.block, off: window.__app.book.pos.offset }));
console.log('paused at', before);

await ctx.setOffline(true);
console.log('NETWORK OFF');
await p.reload(); await p.waitForSelector('.book', { timeout: 20000 });
console.log('app shell + library load offline: yes');
await p.waitForFunction(() => window.__app.narrator?.utts?.length > 0, null, { timeout: 20000 });
const after = await p.evaluate(() => ({ idx: window.__app.narrator.idx, block: window.__app.book.pos.block, off: window.__app.book.pos.offset }));
console.log('restored at', after, after.idx === before.idx ? 'SAME PLACE' : 'DIFFERENT PLACE');
await p.click('.tabs button:nth-child(3)'); await p.click('.play');
const t0 = Date.now();
await p.waitForFunction(() => window.__app.narrator?.state === 'playing', null, { timeout: 120000 });
console.log('offline playback started in ms:', Date.now() - t0);
await p.waitForFunction((i) => window.__app.narrator.idx >= i + 3, before.idx, { timeout: 90000 });
console.log('kept playing offline, now at sentence', await p.evaluate(() => window.__app.narrator.idx));
console.log('page errors:', bad);
await b.close();
