import { drawPlayer, drawLifeIcon } from './sprites.js';
import { Bullet } from './bullet.js';

const PLAYER_SPEED  = 180; // px/s
const BULLET_SPEED  = 420; // px/s upward
const MAX_BULLETS   = 2;
const INVINCIBLE_MS = 2500;
const CANVAS_W      = 448;
const CANVAS_H      = 512;

export class Player {
  constructor(audio) {
    this.audio = audio;
    this.reset();
  }

  reset() {
    this.x = CANVAS_W / 2;
    this.y = CANVAS_H - 40;
    this.lives = 3;
    this.score = 0;
    this.hw = 7;
    this.hh = 5;
    this.dead = false;
    this.invincibleTimer = 0;
    this.captured = false;       // ship captured by boss
    this.dual = false;           // dual fighter mode
    this.capturedShipX = 0;     // screen position of captured ship (in formation)
    this.capturedShipY = 0;
    this.rescuing = false;       // animation state for rescue
    this.rescueTimer = 0;
    this.bullets = [];
    this.events = [];            // {type:'explosion', x, y} drained by Game
    this.powerup = null;         // 'DOUBLE' | 'RAPID' | 'TRIPLE' from bonus flies
    this.powerupTimer = 0;
    this._fireCooldown = 0;
    this.gunLevel = 1;           // permanent bonus gun: 1 single, 2 double, 3 triple
    this.streak = 0;             // SLA streak: consecutive bullet hits
    this.bulletSpeedFactor = 1;  // <1 during NETWORK LATENCY incidents
  }

  // ── SLA streak: hits build a score multiplier, misses erode it ────────
  registerHit()  { this.streak++; }
  registerMiss() { this.streak = Math.max(0, this.streak - 5); }
  scoreMult() {
    if (this.streak >= 20) return 5;
    if (this.streak >= 10) return 3;
    if (this.streak >= 5)  return 2;
    return 1;
  }

  // Weapon upgrade earned by killing a bonus (ticket) fly
  grantPowerup(type, duration = 8) {
    this.powerup = type;
    this.powerupTimer = duration;
  }

  // Called each frame
  update(dt, input) {
    // Invincibility countdown after death
    if (this.invincibleTimer > 0) {
      this.invincibleTimer -= dt * 1000;
    }

    // Movement
    if (!this.dead && !this.captured) {
      if (input.isDown('ArrowLeft') || input.isDown('KeyA')) {
        this.x -= PLAYER_SPEED * dt;
      }
      if (input.isDown('ArrowRight') || input.isDown('KeyD')) {
        this.x += PLAYER_SPEED * dt;
      }

      // Clamp to canvas
      const minX = this.dual ? this.hw + 10 : this.hw;
      const maxX = this.dual ? CANVAS_W - this.hw - 10 : CANVAS_W - this.hw;
      this.x = Math.max(minX, Math.min(maxX, this.x));
    }

    // Powerup countdown
    if (this.powerupTimer > 0) {
      this.powerupTimer -= dt;
      if (this.powerupTimer <= 0) this.powerup = null;
    }
    this._fireCooldown -= dt;

    // Shoot — RAPID lets you hold Space for continuous fire
    if (!this.dead && !this.captured) {
      if (this.powerup === 'RAPID') {
        if (input.isDown('Space') && this._fireCooldown <= 0) {
          this._shoot();
          this._fireCooldown = 0.12;
        }
      } else if (input.wasJustPressed('Space')) {
        this._shoot();
      }
    }

    // Update bullets; a bullet that dies without hitting anything is a miss
    for (const b of this.bullets) b.update(dt, CANVAS_H);
    for (const b of this.bullets) {
      if (b.dead && !b.hit) this.registerMiss();
    }
    this.bullets = this.bullets.filter(b => !b.dead);

    // Rescue animation
    if (this.rescuing) {
      this.rescueTimer -= dt * 1000;
      if (this.rescueTimer <= 0) {
        this.rescuing = false;
        this.dual = true;
      }
    }
  }

  // Temporary powerups STACK on the permanent gun level — they never
  // downgrade it. DOUBLE adds one barrel, TRIPLE adds two (cap 5).
  // RAPID keeps the current barrels and adds hold-to-autofire.
  _barrels() {
    let n = Math.min(3, this.gunLevel);
    if (this.powerup === 'DOUBLE') n += 1;
    if (this.powerup === 'TRIPLE') n += 2;
    return Math.min(5, n);
  }

  _maxBullets() {
    const n = this._barrels();
    let max = n === 1 ? MAX_BULLETS : n * 3;
    if (this.powerup === 'RAPID') max = Math.max(max, 10);
    return max;
  }

  _shoot() {
    if (this.bullets.length >= this._maxBullets()) return;
    this.audio.shoot();
    const spawn = (x, vx = 0) => {
      const b = new Bullet(x, this.y - this.hh, -BULLET_SPEED * this.bulletSpeedFactor, true);
      b.vx = vx;
      this.bullets.push(b);
    };
    switch (this._barrels()) {
      case 1:
        spawn(this.x);
        break;
      case 2:
        spawn(this.x - 5); spawn(this.x + 5);
        break;
      case 3: // parallel pair + straight center... classic fan
        spawn(this.x);
        spawn(this.x - 4, -110); spawn(this.x + 4, 110);
        break;
      case 4: // parallel pair + angled fan
        spawn(this.x - 5); spawn(this.x + 5);
        spawn(this.x - 4, -110); spawn(this.x + 4, 110);
        break;
      default: // 5: center + inner fan + outer fan
        spawn(this.x);
        spawn(this.x - 4, -70);  spawn(this.x + 4, 70);
        spawn(this.x - 6, -140); spawn(this.x + 6, 140);
        break;
    }
    if (this.dual) spawn(this.x + 16);
  }

  // Player was hit — returns true if game over
  hit() {
    if (this.invincibleTimer > 0 || this.dead) return false;
    this.audio.playerExplosion();
    this.events.push({ type: 'explosion', x: this.x, y: this.y });

    if (this.dual) {
      // Lose the dual component first
      this.dual = false;
      this.invincibleTimer = INVINCIBLE_MS;
      return false;
    }

    this.lives--;
    this.dead = true;   // trigger death animation regardless of remaining lives
    return this.lives <= 0;
  }

  // Called when boss captures the player
  beCaptured() {
    this.captured = true;
    this.dual = false;
  }

  // Called when captured ship is freed
  triggerRescue(shipX, shipY) {
    this.captured = false;
    this.rescuing = true;
    this.rescueTimer = 800; // ms for join animation
    this.audio.rescue();
  }

  isInvincible() {
    return this.invincibleTimer > 0;
  }

  draw(ctx) {
    if (this.dead) return;

    const blink = this.invincibleTimer > 0 && Math.floor(this.invincibleTimer / 100) % 2 === 0;
    if (blink) return;

    drawPlayer(ctx, this.x, this.y);

    // Draw second ship for dual mode
    if (this.dual) {
      drawPlayer(ctx, this.x + 16, this.y);
    }

    // Draw all bullets
    for (const b of this.bullets) b.draw(ctx);
  }

  drawHUD(ctx) {
    // Lives icons bottom-left
    for (let i = 0; i < this.lives - 1; i++) {
      drawLifeIcon(ctx, 8 + i * 16, CANVAS_H - 16);
    }
  }
}
