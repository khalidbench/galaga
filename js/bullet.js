import { drawBullet, drawEnemyBullet } from './sprites.js';

export class Bullet {
  constructor(x, y, vy, isPlayer) {
    this.x = x;
    this.y = y;
    this.vy = vy;       // pixels per second (negative = up)
    this.vx = 0;
    this.isPlayer = isPlayer;
    this.dead = false;
    // Collision half-sizes
    this.hw = 2;
    this.hh = 4;
  }

  update(dt, canvasHeight) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.y < -10 || this.y > canvasHeight + 10) {
      this.dead = true;
    }
  }

  draw(ctx) {
    if (this.isPlayer) {
      drawBullet(ctx, this.x, this.y, '#ff0');
    } else {
      drawEnemyBullet(ctx, this.x, this.y);
    }
  }

  // AABB collision check against a rect {x, y, hw, hh}
  hits(obj) {
    return (
      Math.abs(this.x - obj.x) < this.hw + obj.hw &&
      Math.abs(this.y - obj.y) < this.hh + obj.hh
    );
  }
}
