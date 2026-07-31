import { drawBee, drawButterfly, drawBoss, drawTractorBeam } from './sprites.js';
import { Bullet } from './bullet.js';

export const EnemyType = { BEE: 'bee', BUTTERFLY: 'butterfly', BOSS: 'boss' };

// Points: [inFormation, diving, escorted(boss only)]
const POINTS = {
  bee:       [50,  100, 0],
  butterfly: [80,  160, 0],
  boss:      [150, 400, 800],
};

const CANVAS_W = 448;
const CANVAS_H = 512;

export class Enemy {
  constructor(type, col, row) {
    this.type = type;
    this.col = col;
    this.row = row;

    // Target formation position (set by Formation)
    this.formX = 0;
    this.formY = 0;

    // Actual screen position
    this.x = 0;
    this.y = 0;

    this.hw = 7;
    this.hh = 6;

    this.hp = type === EnemyType.BOSS ? 2 : 1;
    this.dead = false;
    this.damaged = false; // boss took first hit

    // State: 'entering' | 'formation' | 'diving' | 'returning' | 'captureBeam' | 'escaped'
    this.state = 'entering';

    // Entry path: list of {x, y} waypoints driven by a parametric curve
    this.entryPath = null;
    this.entryT = 0;      // 0..1
    this.entrySpeed = 1.0; // units of t per second

    // Dive path (cubic bezier control points)
    this.divePoints = null;
    this.diveT = 0;
    this.diveSpeed = 0.55; // t/s

    // Tractor beam
    this.beamActive = false;
    this.beamTimer = 0;
    this.beamWidth = 28;
    this.beamHeight = 80;
    this.capturedPlayer = false; // true once beam captures the player

    this.hasCapturedShip = false;
    this.escortCount = 0;   // live butterfly escorts; boss scores 800 while > 0
    this.escortBoss = null; // set on butterflies that are part of an escort dive

    this.shootTimer = 0;
    this.bullets = [];

    this.flashTimer = 0; // hit flash
  }

  get points() {
    const p = POINTS[this.type];
    if (this.state === 'formation') return p[0];
    if (this.type === EnemyType.BOSS && this.escortCount > 0) return p[2];
    return p[1];
  }

  update(dt, playerX, playerY, stageSpeed, bullets, audio, onCapture, onBossKilled) {
    this.flashTimer = Math.max(0, this.flashTimer - dt);
    for (const b of this.bullets) b.update(dt, CANVAS_H);
    this.bullets = this.bullets.filter(b => !b.dead);

    if (this.state === 'entering') {
      this._updateEntry(dt);
    } else if (this.state === 'formation') {
      // Sway handled by Formation
    } else if (this.state === 'diving') {
      this._updateDive(dt, playerX, playerY, stageSpeed, audio, onBossKilled, onCapture);
    } else if (this.state === 'returning') {
      this._updateReturn(dt);
    } else if (this.state === 'captureBeam') {
      this._updateCaptureBeam(dt, playerX, playerY, audio, onCapture);
    }

    this._updateShooting(dt, playerX, playerY, stageSpeed, audio);
  }

  _updateEntry(dt) {
    if (!this.entryPath) {
      this.x = this.formX;
      this.y = this.formY;
      this.state = 'formation';
      return;
    }
    this.entryT = Math.min(1, this.entryT + this.entrySpeed * dt);
    const pos = evalCubicBezier(this.entryPath, this.entryT);
    this.x = pos.x;
    this.y = pos.y;
    if (this.entryT >= 1) {
      this.state = 'formation';
      this.x = this.formX;
      this.y = this.formY;
    }
  }

  _updateDive(dt, playerX, playerY, stageSpeed, audio, onBossKilled, onCapture) {
    if (!this.divePoints) {
      this.state = 'returning';
      return;
    }
    // Stage 1 dives at base speed; ramps gently, capped late-game
    const speed = this.diveSpeed * Math.min(2.4, 1 + (stageSpeed - 1) * 0.09);
    this.diveT = Math.min(1, this.diveT + speed * dt);
    const pos = evalCubicBezier(this.divePoints, this.diveT);
    this.x = pos.x;
    this.y = pos.y;

    if (this.diveT >= 1) {
      if (this._doCapture) {
        // Switch to tractor beam mode instead of returning
        this._doCapture = false;
        this.startCaptureBeam(audio);
      } else if (this.y > CANVAS_H + 20) {
        // Wrap to just above the screen and fly back to formation
        this.x = this.formX + (Math.random() - 0.5) * 40;
        this.y = -20;
        this._startReturn();
      } else {
        // Loop back to formation position from below
        this._startReturn();
      }
    }
  }

  _startReturn() {
    this.state = 'returning';
    // Fly back above screen, then snap to formation
    this._returnTarget = { x: this.formX, y: this.formY };
  }

  _updateReturn(dt) {
    // Move toward formation position
    const tx = this.formX;
    const ty = this.formY;
    const dx = tx - this.x;
    const dy = ty - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const speed = 200;
    if (dist < speed * dt) {
      this.x = tx;
      this.y = ty;
      this.state = 'formation';
    } else {
      this.x += (dx / dist) * speed * dt;
      this.y += (dy / dist) * speed * dt;
    }
  }

  _updateCaptureBeam(dt, playerX, playerY, audio, onCapture) {
    this.beamTimer -= dt;
    if (!this.capturedPlayer) {
      // Check if player is in beam cone
      const bx = this.x;
      const by = this.y + this.hh;
      const dx = playerX - bx;
      const dy = playerY - by;
      const halfW = (this.beamWidth / 2) * (dy / this.beamHeight);
      if (dy > 0 && dy < this.beamHeight && Math.abs(dx) < halfW + 4) {
        this.capturedPlayer = true;
        this.hasCapturedShip = true;
        onCapture(this);
      }
    }
    if (this.beamTimer <= 0) {
      this.beamActive = false;
      this._startReturn();
    }
  }

  _updateShooting(dt, playerX, playerY, stageSpeed, audio) {
    const attacking = this.state === 'diving' || this.state === 'captureBeam';
    // From stage 5, enemies also snipe while flying in to formation
    const entryFire = this.state === 'entering' && stageSpeed >= 5;
    if (!attacking && !entryFire) return;
    this.shootTimer -= dt;
    if (this.shootTimer <= 0) {
      this.shootTimer = entryFire
        ? 1.5 + Math.random() * 1.5
        : Math.max(0.35, 0.8 + Math.random() * 1.2 - stageSpeed * 0.05);
      this._fireAt(playerX, playerY, stageSpeed);
    }
  }

  _fireAt(tx, ty, stageSpeed = 1) {
    let dx = tx - this.x;
    // Always fire downward with at least 80px of vertical clearance,
    // and cap horizontal spread to 45° from straight down so bullets
    // are always dodgeable by left/right movement.
    let dy = Math.max(ty - this.y, 80);
    if (Math.abs(dx) > dy) dx = Math.sign(dx) * dy; // clamp to 45°
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    // Stage 1 shoots at base speed; ramps gently, capped late-game
    const speed = Math.min(340, 200 + (stageSpeed - 1) * 7);
    const b = new Bullet(this.x, this.y, (dy / dist) * speed, false);
    b.vx = (dx / dist) * speed;
    this.bullets.push(b);
  }

  startDive(divePoints, audio) {
    this.state = 'diving';
    this.diveT = 0;
    this.divePoints = divePoints;
    audio.enemyDive();
    this.shootTimer = 0.5;
  }

  startCaptureBeam(audio) {
    this.state = 'captureBeam';
    this.beamActive = true;
    this.beamTimer = 2.5;
    this.capturedPlayer = false;
    this.diveT = 0;
    audio.tractorBeam();
    this.shootTimer = 999;
  }

  // Hit by player bullet — returns points if killed, 0 if just damaged
  takeHit(bullet, audio, onBossKilled) {
    this.flashTimer = 0.1;
    this.hp--;
    if (this.hp <= 0) {
      this.dead = true;
      audio.enemyHit();
      // Notify escort boss that this butterfly escort is gone
      if (this.escortBoss && !this.escortBoss.dead) {
        this.escortBoss.escortCount = Math.max(0, this.escortBoss.escortCount - 1);
      }
      // Only rescue the captured ship if the boss is actively diving (not in formation).
      // Killing a formation boss loses the captured ship (classic Galaga rule).
      if (this.hasCapturedShip && onBossKilled &&
          (this.state === 'diving' || this.state === 'captureBeam' || this.state === 'returning')) {
        onBossKilled(this);
      }
      return this.points;
    }
    // Boss took first hit
    this.damaged = true;
    audio.enemyHit();
    return 0;
  }

  draw(ctx) {
    if (this.dead) return;

    ctx.save();
    if (this.flashTimer > 0) {
      ctx.globalAlpha = 0.5;
    }

    switch (this.type) {
      case EnemyType.BEE:       drawBee(ctx, this.x, this.y); break;
      case EnemyType.BUTTERFLY: drawButterfly(ctx, this.x, this.y); break;
      case EnemyType.BOSS:      drawBoss(ctx, this.x, this.y, this.damaged); break;
    }

    // Draw captured ship icon under boss
    if (this.hasCapturedShip) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(this.x + 10, this.y - 3, 5, 7);
    }

    ctx.restore();

    // Tractor beam
    if (this.beamActive) {
      const alpha = 0.3 + 0.2 * Math.sin(Date.now() * 0.01);
      drawTractorBeam(ctx, this.x, this.y + this.hh, this.beamWidth, this.beamHeight, alpha);
    }

    // Draw enemy bullets
    for (const b of this.bullets) b.draw(ctx);
  }
}

// Evaluate a cubic bezier at t ∈ [0,1]
// pts: [{x,y}, {x,y}, {x,y}, {x,y}]
export function evalCubicBezier(pts, t) {
  const u = 1 - t;
  return {
    x: u*u*u*pts[0].x + 3*u*u*t*pts[1].x + 3*u*t*t*pts[2].x + t*t*t*pts[3].x,
    y: u*u*u*pts[0].y + 3*u*u*t*pts[1].y + 3*u*t*t*pts[2].y + t*t*t*pts[3].y,
  };
}
