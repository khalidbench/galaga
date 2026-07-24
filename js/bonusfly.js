import { drawBonusFly, drawBonusLabel } from './sprites.js';
import { Bullet } from './bullet.js';
import { evalCubicBezier } from './enemy.js';

const CANVAS_W = 448;
const CANVAS_H = 512;

// Each bonus fly: name, color, points, hp
export const BONUS_FLIES = [
  { name: 'PRECISELY',  color: '#00e5ff', points: 500,  hp: 3 },
  { name: 'MQ',         color: '#ff6d00', points: 600,  hp: 3 },
  { name: 'BMC',        color: '#d500f9', points: 700,  hp: 4 },
  { name: 'KAFKA',      color: '#ff1744', points: 800,  hp: 4 },
  { name: 'ROCKET ES',  color: '#ff9100', points: 750,  hp: 4 },
  { name: 'ROCKET ED',  color: '#ffea00', points: 750,  hp: 4 },
  { name: 'DATADOG',    color: '#632ca6', points: 900,  hp: 5 },
  { name: 'OPENSEARCH', color: '#00bfa5', points: 1000, hp: 5 },
  { name: 'DMS',        color: '#76ff03', points: 850,  hp: 4 },
  { name: 'DB2',        color: '#2979ff', points: 1200, hp: 6 },
];

export class BonusFly {
  constructor(def) {
    this.name   = def.name;
    this.color  = def.color;
    this.points = def.points;
    this.hp     = def.hp;
    this.maxHp  = def.hp;

    // Start above screen at a random x
    this.x = 60 + Math.random() * (CANVAS_W - 120);
    this.y = -30;

    // Collision half-sizes (bigger than regular enemies)
    this.hw = 16;
    this.hh = 12;

    this.dead   = false;
    this.state  = 'diving'; // always diving — bonus flies never form up

    this.flashTimer = 0;
    this.bullets = [];
    this.shootTimer = 1.0;
    this.diveSpeed  = 0.38;
    this.diveT      = 0;

    // Build a sweeping bezier that crosses the screen and exits the bottom
    const exitX = 60 + Math.random() * (CANVAS_W - 120);
    const midX  = CANVAS_W / 2 + (Math.random() - 0.5) * 180;
    this.divePoints = [
      { x: this.x,  y: -30 },
      { x: midX,    y: CANVAS_H * 0.25 },
      { x: exitX,   y: CANVAS_H * 0.65 },
      { x: exitX + (Math.random() - 0.5) * 60, y: CANVAS_H + 40 },
    ];
  }

  update(dt, playerX, playerY, audio) {
    this.flashTimer = Math.max(0, this.flashTimer - dt);

    // Move along dive path
    this.diveT = Math.min(1, this.diveT + this.diveSpeed * dt);
    const pos = evalCubicBezier(this.divePoints, this.diveT);
    this.x = pos.x;
    this.y = pos.y;
    if (this.diveT >= 1) this.dead = true; // escaped off-screen

    // Shoot at player
    this.shootTimer -= dt;
    if (this.shootTimer <= 0) {
      this.shootTimer = 1.2 + Math.random() * 0.8;
      this._fireAt(playerX, playerY);
    }

    // Update bullets
    for (const b of this.bullets) b.update(dt, CANVAS_H);
    this.bullets = this.bullets.filter(b => !b.dead);
  }

  _fireAt(tx, ty) {
    let dx = tx - this.x;
    let dy = Math.max(ty - this.y, 80);
    if (Math.abs(dx) > dy) dx = Math.sign(dx) * dy;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const speed = 180;
    const b = new Bullet(this.x, this.y + this.hh, (dy / dist) * speed, false);
    b.vx = (dx / dist) * speed;
    this.bullets.push(b);
  }

  // Returns points earned (0 if just damaged, full value if killed)
  takeHit(audio) {
    this.flashTimer = 0.12;
    this.hp--;
    audio.enemyHit();
    if (this.hp <= 0) {
      this.dead = true;
      return this.points;
    }
    return 0;
  }

  draw(ctx) {
    if (this.dead) return;

    // HP bar above label (only if damaged)
    if (this.hp < this.maxHp) {
      const bw = 30, bh = 3;
      const bx = this.x - bw / 2;
      const by = this.y - 34;
      ctx.fillStyle = '#333';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = this.color;
      ctx.fillRect(bx, by, bw * (this.hp / this.maxHp), bh);
    }

    drawBonusLabel(ctx, this.x, this.y, this.name, this.color);
    drawBonusFly(ctx, this.x, this.y, this.color, this.flashTimer);

    for (const b of this.bullets) b.draw(ctx);
  }
}
