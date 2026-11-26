import { chromium } from 'playwright-core';
import fs from 'node:fs';
const URL_ = 'http://127.0.0.1:4173/?models=http://127.0.0.1:8099/kokoro';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
const ok = (name, v) => console.log(v ? 'PASS' : 'FAIL', name);
await p.goto(URL_); await p.waitForSelector('.empty');
await p.setInputFiles('input[type=file]', 'tests/fixtures/book.epub'); await p.waitForSelector('.book');
await p.click('.book'); await p.waitForSelector('.prose .s');
// tap a sentence -> actions, bookmark, flag with note
await p.click('.prose p .s >> nth=1'); await p.waitForSelector('.sheet.actions');
await p.fill('.sheet.actions textarea', 'check this date'); await p.click('.sheet.actions >> text=Check fact'); await p.waitForTimeout(400);
await p.click('.prose p .s >> nth=0'); await p.click('.sheet.actions >> text=Bookmark'); await p.waitForTimeout(400);
ok('2 annotations saved', (await p.evaluate(() => window.__app.annotations.length)) === 2);
// proofread review + export
await p.click('text=Proofread'); await p.waitForSelector('text=Review ·');
ok('review list shows flagged passage', (await p.locator('text=check this date').count()) > 0);
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('text=Export all notes (.md)')]);
const md = fs.readFileSync(await dl.path(), 'utf8'); ok('notes export has passage + note', md.includes('check this date') && md.includes('Check fact') && md.includes('>'));
// play from tapped sentence
await p.click('text=Proofread');
await p.click('.prose p .s >> nth=2'); await p.click('.sheet.actions >> text=Play from here');
await p.waitForFunction(() => window.__app.narrator.state === 'playing', null, { timeout: 240000 });
ok('tap-to-start plays', true);
// skip, chapter nav, speed, sleep timer
await p.click('.tabs button:nth-child(3)');
const i0 = await p.evaluate(() => window.__app.narrator.idx);
await p.click('[aria-label="Forward 30 seconds"]'); await p.waitForTimeout(300);
ok('+30 s moves forward', (await p.evaluate(() => window.__app.narrator.idx)) > i0);
await p.click('[aria-label="Next chapter"]'); await p.waitForTimeout(300);
const ch1 = await p.evaluate(() => window.__app.narrator.snapshot().chapter); ok('next chapter', ch1 > 0);
await p.click('.chip:has-text("1.5×")'); await p.waitForTimeout(500);
ok('speed 1.5 applied', (await p.evaluate(() => window.__app.player.rate)) === 1.5);
await p.click('.chip:has-text("30 min")'); ok('sleep timer set', (await p.evaluate(() => !!window.__app.narrator.snapshot().sleep)));
// pronunciation rule changes the spoken text
await p.evaluate(async () => { const a = window.__app; const w = (a.narrator.utts.map((u) => u.spoken.match(/\b[A-Z][a-z]{5,}\b/)).find(Boolean) || [])[0]; window.__word = w; a.book.pronunciation = [{ id: 'x', match: w, say: 'Zzyzx Leery' }]; await a.refreshNarration(); });
ok('pronunciation rule applied', await p.evaluate(() => window.__app.narrator.utts.some((u) => /Zzyzx Leery/.test(u.spoken))));
// chapter WAV export (tiny book, so it finishes quickly)
await p.click('.tabs button:nth-child(1)'); await p.waitForSelector('.add');
await p.setInputFiles('input[type=file]', { name: 'tiny.txt', mimeType: 'text/plain', buffer: Buffer.from('Chapter 1\n\nThe kettle boiled. Siobhán poured the coffee.\n\nIt cost €2.50.') });
await p.waitForSelector('.book:has-text("tiny")'); await p.click('.book:has-text("tiny")'); await p.waitForTimeout(1500);
await p.click('.tabs button:nth-child(4)'); await p.waitForSelector('text=Export chapter as WAV');
const [wav] = await Promise.all([p.waitForEvent('download', { timeout: 240000 }), p.click('text=Export chapter as WAV')]);
const buf = fs.readFileSync(await wav.path()); ok(`WAV export valid (${(buf.length / 1e6).toFixed(2)} MB)`, buf.toString('ascii', 0, 4) === 'RIFF' && buf.length > 50000);
// delete everything
p.once('dialog', () => {});
await p.click('text=Delete everything on this device'); await p.click('.sheet >> text=Delete everything'); await p.waitForTimeout(2500);
await p.waitForSelector('.empty', { timeout: 20000 });
ok('delete everything leaves an empty library', true);
const left = await p.evaluate(async () => ({ dbs: (await indexedDB.databases()).map((d) => d.name), caches: (await caches.keys()).filter((k) => !k.includes('shell')) }));
console.log('left behind:', left, 'page errors:', errs);
await b.close();
