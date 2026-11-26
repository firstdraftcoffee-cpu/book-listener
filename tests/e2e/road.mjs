import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
const ok = (name, c) => console.log(c ? 'PASS' : 'FAIL', name);
await p.goto('http://127.0.0.1:4173/?models=http://127.0.0.1:8099/kokoro'); await p.waitForSelector('.empty');
await p.setInputFiles('input[type=file]', 'tests/fixtures/book.docx'); await p.waitForSelector('.book');
await p.click('.book'); await p.waitForSelector('.prose .s'); await p.click('.tabs button:nth-child(3)');
// flag this spot
await p.click('[aria-label="Flag this spot"]'); await p.waitForTimeout(500);
const flags = await p.evaluate(() => window.__app.annotations.filter((a) => a.kind === 'flag').length);
ok('flag this spot saves a flag', flags === 1);
await p.click('text=Flagged spots (1)'); await p.waitForSelector('.sheet.flags');
ok('flagged spots sheet lists it', (await p.locator('.sheet.flags .serif').count()) === 1);
await p.click('.sheet.flags >> text=Done'); await p.waitForTimeout(300);
ok('marking done empties the list', (await p.locator('.sheet.flags .serif').count()) === 0);
await p.click('.sheet.flags >> text=Close');
// fix a pronunciation from the player
await p.click('text=Fix a pronunciation'); await p.waitForSelector('.sheet');
await p.locator('.sheet .chip').first().click();
await p.fill('[aria-label="How it should sound"]', 'Zzyzx Leery');
await p.click('.sheet >> text=Save'); await p.waitForTimeout(1500);
ok('pronunciation saved from player', (await p.evaluate(() => window.__app.book.pronunciation.length)) === 1);
ok('rule reaches narration', await p.evaluate(() => window.__app.narrator.utts.some((u) => /Zzyzx Leery/.test(u.spoken))));
// prepare next hour
await p.click('text=Next hour');
await p.waitForSelector('text=Keep Book Listener open', { timeout: 20000 });
await p.waitForTimeout(8000);
const prog = await p.evaluate(() => document.querySelector('.bar i')?.style.width);
ok('prepare shows progress', !!prog);
await p.click('text=Stop'); await p.waitForTimeout(500);
ok('stop returns to the options', await p.locator('text=Next 2 hours').count() === 1);
console.log('page errors:', errs);
await b.close();
