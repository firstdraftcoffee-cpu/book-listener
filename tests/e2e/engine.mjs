import { chromium } from 'playwright-core';
import fs from 'node:fs';
const [,, text = 'The beans were sorted by hand, one sack after another, until the light failed.', voice = 'bf_emma', out = '/tmp/js-out.wav'] = process.argv;
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://127.0.0.1:5173/tests/harness/engine.html');
await page.waitForFunction(() => window.ready, null, { timeout: 30000 });
const r = await page.evaluate(([t, v]) => window.runTts(t, v, 'http://127.0.0.1:8099/kokoro'), [text, voice]);
const pcm = Int16Array.from(r.pcm);
const secs = pcm.length / r.sr;
console.log(JSON.stringify({ spoken: r.spoken, seconds: +secs.toFixed(2), synthMs: Math.round(r.ms), prepMs: Math.round(r.prepMs), rtf: +(r.ms / 1000 / secs).toFixed(2) }));
// write wav
const hdr = Buffer.alloc(44); hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length * 2, 4); hdr.write('WAVEfmt ', 8); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(1, 22); hdr.writeUInt32LE(r.sr, 24); hdr.writeUInt32LE(r.sr * 2, 28); hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(pcm.length * 2, 40);
fs.writeFileSync(out, Buffer.concat([hdr, Buffer.from(pcm.buffer)]));
await browser.close();
