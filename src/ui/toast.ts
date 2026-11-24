import { h } from './dom';
export function toast(msg: string, ms = 3200) {
  const t = h('div.toast', { role: 'status' }, msg);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}
export function confirmDialog(msg: string, yes = 'Yes', danger = false): Promise<boolean> {
  return new Promise((res) => {
    const done = (v: boolean) => { s.remove(); res(v); };
    const s = h('div.sheet', { role: 'alertdialog', 'aria-label': msg },
      h('p.serif', { style: { fontSize: '18px', lineHeight: '1.45', margin: '0' } }, msg),
      h('div.row', null,
        h('button.btn' + (danger ? '.danger' : '.solid'), { onclick: () => done(true) }, yes),
        h('button.btn.quiet', { onclick: () => done(false) }, 'Cancel')));
    document.body.appendChild(s);
  });
}
