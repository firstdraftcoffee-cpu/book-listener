// After `vite build`: write dist/sw.js with the exact list of files to keep for offline use.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
const dist = 'dist';
// The speech engine loads its WebAssembly from /ort/ (set in the worker), so the bundler's second copy is dead weight.
for (const f of fs.readdirSync('dist/assets')) if (/^ort-wasm.*\.wasm$/.test(f)) fs.unlinkSync(`dist/assets/${f}`);
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else files.push(path.relative(dist, p).split(path.sep).join('/')); } })(dist);
const list = files.filter((f) => !/^assets\/ort-wasm.*\.wasm$/.test(f) && f !== 'sw.js' && f !== '_headers' && !f.endsWith('.map'));
const hash = crypto.createHash('sha1'); hash.update(fs.readFileSync('scripts/sw-template.js'));
for (const f of list) hash.update(f).update(fs.readFileSync(path.join(dist, f)));
const version = hash.digest('hex').slice(0, 10);
const src = fs.readFileSync('scripts/sw-template.js', 'utf8').replace('__VERSION__', version).replace('__FILES__', JSON.stringify(['./', ...list]));
fs.writeFileSync(path.join(dist, 'sw.js'), src);
console.log(`sw.js: ${list.length} files, version ${version}`);
