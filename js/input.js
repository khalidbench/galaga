// Keyboard and touch input handler
export class Input {
  constructor() {
    this.keys = {};
    this.justPressed = {};
    this._prev = {};

    window.addEventListener('keydown', e => {
      this.keys[e.code] = true;
      e.preventDefault();
    });
    window.addEventListener('keyup', e => {
      this.keys[e.code] = false;
    });

    this._setupTouch();
  }

  _setupTouch() {
    // Show touch controls on touch devices
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      const controls = document.getElementById('touch-controls');
      if (controls) controls.style.display = 'flex';
    }

    const map = {
      'btn-left':  'ArrowLeft',
      'btn-right': 'ArrowRight',
      'btn-fire':  'Space',
    };

    for (const [id, code] of Object.entries(map)) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.addEventListener('touchstart', e => { e.preventDefault(); this.keys[code] = true; }, { passive: false });
      el.addEventListener('touchend',   e => { e.preventDefault(); this.keys[code] = false; }, { passive: false });
    }
  }

  // Call once per frame before update to compute justPressed
  poll() {
    for (const code of Object.keys(this.keys)) {
      this.justPressed[code] = this.keys[code] && !this._prev[code];
    }
    // Clear justPressed for keys no longer held
    for (const code of Object.keys(this._prev)) {
      if (!this.keys[code]) this.justPressed[code] = false;
    }
    this._prev = { ...this.keys };
  }

  isDown(code) {
    return !!this.keys[code];
  }

  wasJustPressed(code) {
    return !!this.justPressed[code];
  }
}
