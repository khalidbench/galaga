// Procedural sound effects via Web Audio API. No external files.

const MUTE_KEY = 'tankbrawl.mute';

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.muted = localStorage.getItem(MUTE_KEY) === '1';
  }

  ensure() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 0.45;
    this.masterGain.connect(this.ctx.destination);
  }

  resume() {
    this.ensure();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    if (this.masterGain) this.masterGain.gain.value = m ? 0 : 0.45;
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  isMuted() { return this.muted; }

  // helpers
  _osc(type, freq, dur, gain = 0.3, attack = 0.005, release = 0.05) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.masterGain);
    o.start(t);
    o.stop(t + dur + release);
    return { o, g, t };
  }

  _noise(dur, gain = 0.3, filterFreq = 1200, filterType = 'lowpass') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const bufSize = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, t);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.masterGain);
    src.start(t);
    src.stop(t + dur);
    return { src, g, filter, t };
  }

  // ---------- Effects ----------

  fire() {
    this.ensure();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(this.masterGain);
    o.start(t); o.stop(t + 0.22);
    this._noise(0.12, 0.25, 800, 'lowpass');
  }

  hitTank() {
    this.ensure();
    if (!this.ctx) return;
    this._noise(0.18, 0.45, 600, 'lowpass');
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(50, t + 0.15);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(this.masterGain);
    o.start(t); o.stop(t + 0.2);
  }

  hitWall() {
    this.ensure();
    if (!this.ctx) return;
    this._noise(0.06, 0.25, 2200, 'highpass');
  }

  explosion() {
    this.ensure();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._noise(0.55, 0.55, 1400, 'lowpass');
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(35, t + 0.5);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(g).connect(this.masterGain);
    o.start(t); o.stop(t + 0.6);
  }

  pickup(variant = 0) {
    this.ensure();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const base = 520 + (variant * 37) % 240;
    [0, 0.07, 0.14].forEach((d, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(base * Math.pow(1.26, i), t + d);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t + d);
      g.gain.linearRampToValueAtTime(0.22, t + d + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.18);
      o.connect(g).connect(this.masterGain);
      o.start(t + d); o.stop(t + d + 0.2);
    });
  }

  respawn() {
    this.ensure();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(380, t);
    o.frequency.exponentialRampToValueAtTime(880, t + 0.22);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(this.masterGain);
    o.start(t); o.stop(t + 0.28);
  }

  matchStart() {
    this.ensure();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = [440, 554, 740];
    notes.forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(f, t + i * 0.18);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t + i * 0.18);
      g.gain.linearRampToValueAtTime(0.25, t + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.22);
      o.connect(g).connect(this.masterGain);
      o.start(t + i * 0.18); o.stop(t + i * 0.18 + 0.25);
    });
  }

  matchEnd(win = true) {
    this.ensure();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = win ? [523, 659, 784, 1047] : [784, 659, 523, 392];
    notes.forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f, t + i * 0.22);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t + i * 0.22);
      g.gain.linearRampToValueAtTime(0.28, t + i * 0.22 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.22 + 0.32);
      o.connect(g).connect(this.masterGain);
      o.start(t + i * 0.22); o.stop(t + i * 0.22 + 0.36);
    });
  }
}

export const audio = new AudioEngine();
