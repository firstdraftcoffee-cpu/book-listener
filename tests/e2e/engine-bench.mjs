import { chromium } from 'playwright-core';
const text = 'The beans were sorted by hand, one sack after another, until the light failed.';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:5173/tests/harness/engine.html');
await page.waitForFunction(() => window.ready);
const runs = [];
for (let i = 0; i < 4; i++) {
  const r = await page.evaluate(([t, v]) => window.runTts(t, v, 'http://127.0.0.1:8099/kokoro'), [text, 'bf_emma']);
  const secs = r.pcm.length / r.sr; runs.push({ secs: +secs.toFixed(2), ms: Math.round(r.ms), rtf: +(r.ms / 1000 / secs).toFixed(2) });
}
console.log(JSON.stringify(runs));
console.log('crossOriginIsolated:', await page.evaluate(() => self.crossOriginIsolated), 'cores:', await page.evaluate(() => navigator.hardwareConcurrency));
await browser.close();
