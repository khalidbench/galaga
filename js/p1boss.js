import { Bullet } from './bullet.js';

const CANVAS_W = 448;
const CANVAS_H = 512;

const P1_INCIDENTS = [
  'DATABASE DOWN', 'DNS OUTAGE', 'CERT EXPIRED', 'DISK FULL',
  'K8S CRASHLOOP', 'LB 502 STORM', 'VPN MELTDOWN', 'BACKUP FAILED',
];

// Huge boss fly that sweeps across the screen from stage 8 onward.
// Very tanky, fires bullet spreads, escapes if not killed in time.
export class P1Boss {
  constructor(stage) {
    this.incident = P1_INCIDENTS[Math.floor(Math.random() * P1_INCIDENTS.length)];
    this.name  = 'P1: ' + this.incident;
    this.color = '#f22';

    const over = Math.max(0, stage - 8);
    this.maxHp  = 15 + over * 2;
    this.hp     = this.maxHp;
    this.points = 5000 + over * 500;

    this.hw = 34;
    this.hh = 24;

    // Sweep in from a random side at boss height, sine-bobbing
    this.dir = Math.random() < 0.5 ? 1 : -1;
    this.x = this.dir === 1 ? -60 : CANVAS_W + 60;
    this.y = 140;
    this.speed = 34 + Math.min(30, stage); // px/s — slow, menacing

    this.dead = false;
    this.escaped = false;
    this.flashTimer = 0;
    this.bullets = [];
    this.shootTimer = 1.5;
    this._bulletSpeed = Math.min(300, 170 + stage * 4);
  }

  update(dt, playerX, playerY) {
    this.flashTimer = Math.max(0, this.flashTimer - dt);

    this.x += this.dir * this.speed * dt;
    this.y = 140 + Math.sin(this.x * 0.018) * 46;

    // Escaped off the far side — no reward
    if ((this.dir === 1 && this.x > CANVAS_W + 60) ||
        (this.dir === -1 && this.x < -60)) {
      this.dead = true;
      this.escaped = true;
    }

    // Fire a 3-way downward spread at the player
    this.shootTimer -= dt;
    if (this.shootTimer <= 0) {
      this.shootTimer = 1.1 + Math.random() * 0.6;
      for (const angle of [-0.35, 0, 0.35]) {
        let dx = playerX - this.x;
        let dy = Math.max(playerY - this.y, 100);
        if (Math.abs(dx) > dy) dx = Math.sign(dx) * dy;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const ux = (dx / dist) * cos - (dy / dist) * sin;
        const uy = (dx / dist) * sin + (dy / dist) * cos;
        const b = new Bullet(this.x, this.y + this.hh, uy * this._bulletSpeed, false);
        b.vx = ux * this._bulletSpeed;
        this.bullets.push(b);
      }
    }

    for (const b of this.bullets) b.update(dt, CANVAS_H);
    this.bullets = this.bullets.filter(b => !b.dead);
  }

  // Returns full points when killed, 0 while it still has HP
  takeHit(audio) {
    this.flashTimer = 0.1;
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
    ctx.save();

    // Pulsing red threat ring
    ctx.globalAlpha = 0.25 + 0.15 * Math.sin(Date.now() * 0.008);
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = this.flashTimer > 0 ? 0.5 : 1;

    // Big menacing body: wide dark diamond with spikes and a red core
    ctx.fillStyle = '#600';
    ctx.beginPath();
    ctx.moveTo(this.x, this.y - 26);
    ctx.lineTo(this.x + 36, this.y);
    ctx.lineTo(this.x, this.y + 20);
    ctx.lineTo(this.x - 36, this.y);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y - 18);
    ctx.lineTo(this.x + 26, this.y);
    ctx.lineTo(this.x, this.y + 14);
    ctx.lineTo(this.x - 26, this.y);
    ctx.closePath();
    ctx.fill();

    // Spikes
    ctx.fillStyle = '#f80';
    for (const sx of [-30, -15, 0, 15, 30]) {
      ctx.fillRect(this.x + sx - 2, this.y - 30, 4, 8);
    }

    // Core "eye"
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(this.x, this.y - 2, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(this.x, this.y - 2, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;

    // Name label above, always with a wide HP bar
    ctx.font = 'bold 11px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    const w = ctx.measureText(this.name).width + 16;
    let lx = Math.max(w / 2 + 2, Math.min(CANVAS_W - w / 2 - 2, this.x));
    const top = this.y - 64;
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(lx - w / 2, top, w, 18);
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(lx - w / 2, top, w, 18);
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.name, lx, top + 10);
    ctx.shadowBlur = 0;

    // HP bar
    const bw = 70, bh = 5;
    ctx.fillStyle = '#333';
    ctx.fillRect(this.x - bw / 2, top - 9, bw, bh);
    ctx.fillStyle = this.hp / this.maxHp > 0.35 ? '#f22' : '#ff0';
    ctx.fillRect(this.x - bw / 2, top - 9, bw * (this.hp / this.maxHp), bh);

    ctx.restore();

    for (const b of this.bullets) b.draw(ctx);
  }
}
