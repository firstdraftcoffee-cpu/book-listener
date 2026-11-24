import '@fontsource-variable/newsreader';
import '@fontsource-variable/newsreader/wght-italic.css';
import '@fontsource-variable/instrument-sans';
import './ui/style.css';
import { h, mount } from './ui/dom';
import { app, type Screen } from './ui/app';
import { applyTheme, settings } from './ui/settings';
import { renderLibrary, enableDrop } from './ui/screens/library';
import { renderReader } from './ui/screens/reader';
import { renderPlayer } from './ui/screens/player';
import { renderSettings } from './ui/screens/settings';

applyTheme();
const root = document.getElementById('app')!;
const screenEl = h('main.screen', { id: 'screen' });
const tabsEl = h('nav.tabs', { 'aria-label': 'Main' });
mount(root, screenEl, tabsEl);
enableDrop(screenEl);

const TABS: Array<[Screen, string]> = [['library', 'Library'], ['reader', 'Reader'], ['player', 'Player'], ['settings', 'Settings']];
let shown: Screen | null = null;

async function render() {
  screenEl.removeAttribute('style');
  switch (app.screen) {
    case 'library': await renderLibrary(screenEl); break;
    case 'reader': await renderReader(screenEl); break;
    case 'player': renderPlayer(screenEl); break;
    case 'settings': await renderSettings(screenEl); break;
  }
  mount(tabsEl, ...TABS.map(([id, label]) => h('button', { 'aria-current': app.screen === id ? 'page' : undefined, onclick: () => app.go(id) }, label)));
}

let lastTick = 0;
app.on(() => {
  if (shown !== app.screen) { shown = app.screen; screenEl.scrollTop = 0; screenEl.classList.remove('enter'); void screenEl.offsetWidth; screenEl.classList.add('enter'); void render(); return; }
  const now = performance.now();
  if (app.screen === 'player') app.narrator?.ping();
  else if (app.screen === 'settings' && app.voiceLoading && now - lastTick > 400) { lastTick = now; void renderSettings(screenEl); }
});

// Come back from the lock screen, a call or another app: wake the audio and keep the user's place.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void app.player.resumeContext();
  else void app.narrator?.savePosition(true);
});
window.addEventListener('pagehide', () => void app.narrator?.savePosition(true));

(window as any).__app = app; // handy for tests

shown = 'library';
void render().then(async () => {
  const last = settings().lastBook;
  if (last) { try { await app.open(last); } catch { /* book may have been deleted */ } }
});

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => { /* offline shell is optional */ });
}
