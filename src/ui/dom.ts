// Tiny DOM helper: h('button.primary', {onclick}, 'Play')
type Child = Node | string | number | null | undefined | false | Child[];
type Props = Record<string, any>;

export function h(sel: string, props?: Props | null, ...kids: Child[]): any {
  const [tagPart, ...classes] = sel.split('.');
  const el = document.createElement(tagPart || 'div') as any;
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className += ' ' + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, kids);
  return el;
}
function append(el: Node, kids: Child[]) {
  for (const k of kids) {
    if (Array.isArray(k)) append(el, k);
    else if (k === null || k === undefined || k === false) continue;
    else el.appendChild(typeof k === 'object' ? k : document.createTextNode(String(k)));
  }
}
export function clear(el: Element) { while (el.firstChild) el.removeChild(el.firstChild); }
export function mount(el: Element, ...kids: Child[]) { clear(el); append(el, kids); }

export function fmtDuration(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '–';
  const m = Math.round(sec / 60);
  if (m < 1) return 'under a minute';
  if (m < 60) return `${m} min`;
  const hh = Math.floor(m / 60), mm = m % 60;
  return mm ? `${hh} h ${mm} min` : `${hh} h`;
}
export function fmtBytes(b: number): string {
  if (b < 1024 ** 2) return `${Math.max(1, Math.round(b / 1024))} KB`;
  if (b < 1024 ** 3) return `${Math.round(b / 1024 ** 2)} MB`;
  return `${(b / 1024 ** 3).toFixed(1)} GB`;
}
/** DD/MM/YY, the way Irish readers expect */
export function fmtDate(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${p(d.getFullYear() % 100)}`;
}
export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
