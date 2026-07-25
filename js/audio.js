// WebAudio-generated retro SFX — no external files
export class Audio {
  constructor() {
    this._ctx = null;
    this._muted = false;
    this._masterGain = null;
  }

  _init() {
    if (this._ctx) return;
    this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    this._masterGain = this._ctx.createGain();
    this._masterGain.gain.value = 0.3;
    this._masterGain.connect(this._ctx.destination);
  }

  toggleMute() {
    this._muted = !this._muted;
    if (this._masterGain) {
      this._masterGain.gain.value = this._muted ? 0 : 0.3;
    }
    return this._muted;
  }

  // Generic oscillator helper
  _play(type, freq, startFreq, duration, gainVal = 0.4, vibratoRate = 0, vibratoDepth = 0) {
    this._init();
    if (this._muted) return;
    const ctx = this._ctx;
    const g = ctx.createGain();
    g.connect(this._masterGain);
    g.gain.setValueAtTime(gainVal, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq || freq, ctx.currentTime);
    if (startFreq && startFreq !== freq) {
      osc.frequency.exponentialRampToValueAtTime(freq, ctx.currentTime + duration * 0.8);
    }

    if (vibratoRate > 0) {
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = vibratoRate;
      lfoGain.gain.value = vibratoDepth;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start(ctx.currentTime);
      lfo.stop(ctx.currentTime + duration);
    }

    osc.connect(g);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  }

  shoot() {
    this._play('square', 400, 800, 0.1, 0.3);
  }

  enemyHit() {
    this._play('square', 100, 600, 0.15, 0.5);
  }

  playerExplosion() {
    this._init();
    if (this._muted) return;
    const ctx = this._ctx;
    // Long loud noise burst — the crash must be unmissable
    const bufSize = ctx.sampleRate * 0.8;
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(1.0, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    src.connect(g);
    g.connect(this._masterGain);
    src.start(ctx.currentTime);

    // Deep boom + descending scream layered under the noise
    this._play('sine', 30, 120, 0.7, 0.9);
    this._play('sawtooth', 40, 400, 0.6, 0.5);
    this._play('square', 60, 900, 0.35, 0.35);
  }

  enemyDive() {
    // Descending pitch
    this._play('square', 150, 600, 0.5, 0.25);
  }

  tractorBeam() {
    // Warbling tone
    this._play('triangle', 220, 220, 0.6, 0.3, 8, 60);
  }

  capture() {
    this._init();
    if (this._muted) return;
    // Ascending then silent
    const ctx = this._ctx;
    const freqs = [200, 300, 400, 200];
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.1);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.09);
      osc.connect(g);
      g.connect(this._masterGain);
      osc.start(ctx.currentTime + i * 0.1);
      osc.stop(ctx.currentTime + i * 0.1 + 0.09);
    });
  }

  rescue() {
    this._init();
    if (this._muted) return;
    const ctx = this._ctx;
    const melody = [523, 659, 784, 1047];
    melody.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.35, ctx.currentTime + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.11);
      osc.connect(g);
      g.connect(this._masterGain);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.11);
    });
  }

  stageClear() {
    this._init();
    if (this._muted) return;
    const ctx = this._ctx;
    const melody = [523, 659, 784, 659, 784, 1047];
    melody.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.1);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.09);
      osc.connect(g);
      g.connect(this._masterGain);
      osc.start(ctx.currentTime + i * 0.1);
      osc.stop(ctx.currentTime + i * 0.1 + 0.09);
    });
  }

  extraShip() {
    this._init();
    if (this._muted) return;
    const ctx = this._ctx;
    // Fast ascending arpeggio — the classic "extra life" moment
    const melody = [392, 523, 659, 784, 1047, 1319];
    melody.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.4, ctx.currentTime + i * 0.07);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.07 + 0.15);
      osc.connect(g);
      g.connect(this._masterGain);
      osc.start(ctx.currentTime + i * 0.07);
      osc.stop(ctx.currentTime + i * 0.07 + 0.15);
    });
  }

  bonusCount() {
    this._play('square', 880, 880, 0.05, 0.25);
  }
}
