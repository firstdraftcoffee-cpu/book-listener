// Audio-thread player. Plays a queue of sentence clips back to back with no gaps, and tells the app
// exactly when each one starts and ends. Plain JavaScript because it runs inside the AudioWorklet scope.
class BookPlayer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.q = [];            // { uid, data: Float32Array, tail: number }
    this.cur = null;
    this.off = 0;           // sample offset inside cur.data + tail
    this.playing = false;
    this.gain = 0;          // current gain for click-free start/stop
    this.target = 0;
    this.underrun = false;
    this.holding = false;   // when true, wait before starting the next clip (lets the app build a buffer)
    this.sinceReport = 0;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'push') this.q.push({ uid: m.uid, data: m.data, tail: m.tail });
      else if (m.type === 'play') { this.playing = true; this.target = 1; }
      else if (m.type === 'pause') { this.target = 0; this.pausing = true; }
      else if (m.type === 'clear') { this.q = []; this.cur = null; this.off = 0; this.underrun = false; }
      else if (m.type === 'hold') { this.holding = true; }
      else if (m.type === 'release') { this.holding = false; this.underrun = false; }
      else if (m.type === 'volume') { this.vol = m.value; }
    };
    this.vol = 1;
  }
  nextItem() {
    this.cur = this.q.shift() || null;
    this.off = 0;
    if (this.cur) { this.underrun = false; this.port.postMessage({ type: 'start', uid: this.cur.uid }); }
  }
  process(_in, outputs) {
    const out = outputs[0][0];
    const n = out.length;
    if (!this.playing && this.gain === 0) { out.fill(0); return true; }
    const step = 1 / 256; // ~5 ms ramp at 48 kHz
    for (let i = 0; i < n; i++) {
      if (this.gain < this.target) this.gain = Math.min(this.target, this.gain + step);
      else if (this.gain > this.target) this.gain = Math.max(this.target, this.gain - step);
      let s = 0;
      if (this.target > 0 || this.gain > 0) {
        if (!this.cur && this.playing && !this.holding) this.nextItem();
        if (this.cur) {
          const len = this.cur.data.length;
          s = this.off < len ? this.cur.data[this.off] : 0;
          // while ramping to pause, hold position
          if (this.target > 0 || this.gain > 0.0001) this.off++;
          if (this.off >= len + this.cur.tail) {
            const uid = this.cur.uid;
            this.cur = null;
            this.port.postMessage({ type: 'end', uid });
          }
        } else if (this.playing && !this.underrun && !this.holding) {
          this.underrun = true;
          this.port.postMessage({ type: 'underrun' });
        }
      }
      out[i] = s * this.gain * this.vol;
    }
    if (this.target === 0 && this.gain === 0 && this.pausing) { this.pausing = false; this.playing = false; this.port.postMessage({ type: 'paused', uid: this.cur ? this.cur.uid : null, off: this.off }); }
    this.sinceReport += n;
    if (this.sinceReport > 12000 && this.cur) { this.sinceReport = 0; this.port.postMessage({ type: 'pos', uid: this.cur.uid, off: this.off }); }
    return true;
  }
}
registerProcessor('book-player', BookPlayer);
