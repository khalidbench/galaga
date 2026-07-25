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

    // Update bullets
    for (const b of this.bullets) b.update(dt, CANVAS_H);
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

  _maxBullets() {
    switch (this.powerup) {
      case 'RAPID':  return 8;
      case 'TRIPLE': return 9;
      case 'DOUBLE': return 6;
      default:       return MAX_BULLETS;
    }
  }

  _shoot() {
    if (this.bullets.length >= this._maxBullets()) return;
    this.audio.shoot();
    const spawn = (x, vx = 0) => {
      const b = new Bullet(x, this.y - this.hh, -BULLET_SPEED, true);
      b.vx = vx;
      this.bullets.push(b);
    };
    if (this.powerup === 'TRIPLE') {
      // Fan of three: straight + two angled
      spawn(this.x);
      spawn(this.x - 4, -110);
      spawn(this.x + 4, 110);
    } else if (this.powerup === 'DOUBLE') {
      spawn(this.x - 5);
      spawn(this.x + 5);
    } else {
      spawn(this.x);
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
