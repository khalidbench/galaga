import { Enemy, EnemyType, evalCubicBezier } from './enemy.js';

const CANVAS_W = 448;
const CANVAS_H = 512;

// Formation grid: 5 rows × 8 cols
// Row 0 = 2 bosses (center), Row 1-2 = butterflies, Row 3-4 = bees
const COLS = 8;
const ROWS = 5;
const CELL_W = 36;
const CELL_H = 28;
const FORM_LEFT = (CANVAS_W - COLS * CELL_W) / 2 + CELL_W / 2;  // left center of first col
const FORM_TOP = 60;

// Sway
const SWAY_AMP   = 12;   // pixels
const SWAY_SPEED = 0.4;  // cycles per second

export class Formation {
  constructor(audio, stage) {
    this.audio = audio;
    this.stage = stage;
    this.enemies = [];
    this.swayT = 0;
    this.swayDir = 1;

    this._diveTimer = 1.5 + Math.random();
    this._diveTimerMin = Math.max(0.6, 2.0 - stage * 0.08);
    this._diveTimerMax = Math.max(1.0, 3.5 - stage * 0.1);

    this._entryQueue = [];  // enemies waiting to enter
    this._entryDelay = 0;
    this._entriesPerGroup = 4;
    this._groupDelay = 0.25;

    this._buildFormation();
    this._scheduleEntry();
  }

  _buildFormation() {
    for (let row = 0; row < ROWS; row++) {
      const type = row === 0 ? EnemyType.BOSS
                 : row <= 2  ? EnemyType.BUTTERFLY
                             : EnemyType.BEE;
      const colCount = row === 0 ? 2 : COLS;
      const colOffset = row === 0 ? (COLS / 2 - 1) : 0; // center 2 bosses

      for (let ci = 0; ci < colCount; ci++) {
        const col = colOffset + ci;
        const e = new Enemy(type, col, row);
        e.formX = FORM_LEFT + col * CELL_W;
        e.formY = FORM_TOP  + row * CELL_H;
        // Start off-screen, will enter via curved path
        e.x = e.formX;
        e.y = -20;
        this.enemies.push(e);
      }
    }
  }

  _scheduleEntry() {
    // Queue enemies to fly in group by group, row by row
    // Shuffle for visual variety
    const groups = [];
    for (let row = ROWS - 1; row >= 0; row--) {
      const rowEnemies = this.enemies.filter(e => e.row === row);
      // split into groups of 4
      for (let i = 0; i < rowEnemies.length; i += 4) {
        groups.push(rowEnemies.slice(i, i + 4));
      }
    }
    this._entryQueue = groups;
    this._entryDelay = 0.1;
  }

  // Build a curved entry path for an enemy
  _buildEntryPath(e) {
    const side = e.col < COLS / 2 ? -1 : 1;
    const startX = side < 0 ? -30 : CANVAS_W + 30;
    const startY = 20 + Math.random() * 40;

    // Bezier: start offscreen → arc over top → settle at formation
    const cp1 = { x: startX + side * -80, y: startY + 60 };
    const cp2 = { x: e.formX + side * 40, y: e.formY - 80 };
    e.entryPath = [
      { x: startX, y: startY },
      cp1,
      cp2,
      { x: e.formX, y: e.formY },
    ];
    e.x = startX;
    e.y = startY;
    e.entryT = 0;
    e.entrySpeed = 0.7 + Math.random() * 0.3;
    e.state = 'entering';
  }

  allEntered() {
    return this._entryQueue.length === 0 &&
           this.enemies.every(e => e.state !== 'entering');
  }

  allDead() {
    return this.enemies.every(e => e.dead);
  }

  livingCount() {
    return this.enemies.filter(e => !e.dead).length;
  }

  update(dt, player, stageSpeed) {
    // Process entry queue
    this._entryDelay -= dt;
    if (this._entryDelay <= 0 && this._entryQueue.length > 0) {
      const group = this._entryQueue.shift();
      for (const e of group) this._buildEntryPath(e);
      this._entryDelay = this._groupDelay + Math.random() * 0.2;
    }

    // Sway formation
    this.swayT += SWAY_SPEED * 2 * Math.PI * dt;
    const swayOffset = Math.sin(this.swayT) * SWAY_AMP;

    // Update formation positions with sway
    for (const e of this.enemies) {
      if (e.state === 'formation') {
        e.x = e.formX + swayOffset;
        e.y = e.formY;
      }
    }

    // Trigger dives once all entered
    if (this.allEntered()) {
      this._diveTimer -= dt;
      if (this._diveTimer <= 0) {
        this._triggerDive(player, stageSpeed);
        this._diveTimer = this._diveTimerMin + Math.random() * (this._diveTimerMax - this._diveTimerMin);
      }
    }

    // Drain pending escort dives
    for (const e of this.enemies) {
      if (e._pendingDive) {
        e._pendingDive.delay -= dt;
        if (e._pendingDive.delay <= 0) {
          e.startDive(e._pendingDive.pts, this.audio);
          e._pendingDive = null;
        }
      }
    }

    // Update all enemies
    for (const e of this.enemies) {
      e.update(
        dt,
        player.x, player.y,
        stageSpeed,
        player.bullets,
        this.audio,
        (boss) => this._onCapture(boss, player),
        (boss) => this._onBossKilled(boss, player),
      );
    }

    // Collision: player bullets vs enemies
    for (const b of player.bullets) {
      for (const e of this.enemies) {
        if (e.dead || !b.isPlayer) continue;
        if (b.hits(e)) {
          b.dead = true;
          const pts = e.takeHit(b, this.audio,
            (boss) => this._onBossKilled(boss, player));
          if (pts > 0) player.score += pts;
        }
      }
    }

    // Collision: enemy bullets vs player
    if (!player.dead && !player.captured && !player.isInvincible()) {
      for (const e of this.enemies) {
        for (const b of e.bullets) {
          if (b.dead) continue;
          if (b.hits(player)) {
            b.dead = true;
            player.hit();
          }
        }
        // Direct enemy body collision with player (diving enemy)
        if (e.state === 'diving' || e.state === 'captureBeam') {
          if (Math.abs(e.x - player.x) < e.hw + player.hw &&
              Math.abs(e.y - player.y) < e.hh + player.hh) {
            e.dead = true;
            player.hit();
          }
        }
      }
    }

    // Clean dead enemies
    this.enemies = this.enemies.filter(e => !e.dead);
  }

  _triggerDive(player, stageSpeed) {
    const eligible = this.enemies.filter(
      e => e.state === 'formation' && !e.dead
    );
    if (eligible.length === 0) return;

    // From stage 2 onward, 35% chance of a coordinated escort formation attack
    const bosses = eligible.filter(e => e.type === EnemyType.BOSS);
    const butterflies = eligible.filter(e => e.type === EnemyType.BUTTERFLY);
    if (this.stage >= 2 && bosses.length > 0 && butterflies.length >= 2 &&
        Math.random() < 0.35) {
      this._startEscortAttack(bosses[0], butterflies, player);
      return;
    }

    // Regular dive: 1–3 random enemies
    const count = Math.min(eligible.length, 1 + Math.floor(Math.random() * 2));
    const divers = shuffle(eligible).slice(0, count);
    for (const e of divers) {
      if (e.type === EnemyType.BOSS && !player.captured && Math.random() < 0.30) {
        this._startCaptureRun(e, player);
      } else {
        this._startDiveRun(e, player);
      }
    }
  }

  // Boss + 2 butterfly escorts dive in a tight V formation.
  // Escorts flank the boss at ±24 px horizontal offset, matching its path.
  // Boss scores 800 pts while any escort is still alive.
  _startEscortAttack(boss, butterflies, player) {
    const px = player.x;
    const midX = px + (Math.random() - 0.5) * 80;

    // Shared bezier shape for the boss; escorts mirror it with offset
    const basePts = [
      { x: boss.x,  y: boss.y },
      { x: boss.x + (midX - boss.x) * 0.25, y: boss.y + 90 },
      { x: midX,    y: CANVAS_H * 0.55 },
      { x: midX + (Math.random() - 0.5) * 40, y: CANVAS_H + 30 },
    ];

    // Pick 2 butterflies closest to the boss horizontally
    const sorted = [...butterflies].sort(
      (a, b) => Math.abs(a.x - boss.x) - Math.abs(b.x - boss.x)
    );
    const escorts = sorted.slice(0, 2);

    // Wire up escort relationship BEFORE starting dive so points are live
    boss.escortCount = escorts.length;
    for (const bf of escorts) {
      bf.escortBoss = boss;
    }

    // Launch boss
    boss.startDive(basePts, this.audio);

    // Launch each butterfly with the same curve shape, offset sideways.
    // Give them a tiny pendingDive so they launch on the next update tick
    // rather than mid-frame, keeping state transitions clean.
    const offsets = [-24, 24];
    escorts.forEach((bf, i) => {
      const ox = offsets[i];
      bf._pendingDive = {
        pts: basePts.map(p => ({ x: p.x + ox, y: p.y })),
        delay: i * 0.08, // seconds
      };
    });
  }

  _startDiveRun(e, player) {
    const px = player.x;
    // Bezier: from current pos, sweep toward player, exit bottom
    const midX = px + (Math.random() - 0.5) * 120;
    const pts = [
      { x: e.x, y: e.y },
      { x: e.x + (midX - e.x) * 0.3, y: e.y + 100 },
      { x: midX, y: CANVAS_H * 0.6 },
      { x: midX + (Math.random() - 0.5) * 60, y: CANVAS_H + 30 },
    ];
    e.startDive(pts, this.audio);
  }

  _startCaptureRun(e, player) {
    // Fly down to center above player, open beam, then return
    const pts = [
      { x: e.x, y: e.y },
      { x: e.x, y: e.y + 60 },
      { x: player.x, y: CANVAS_H * 0.4 },
      { x: player.x, y: CANVAS_H * 0.5 },
    ];
    e.divePoints = pts;
    e.diveT = 0;
    e.state = 'diving';
    // After dive completes, switch to capture beam — handled in enemy update
    // We use a flag so the enemy switches on its own
    e._doCapture = true;
    this.audio.enemyDive();
  }

  _onCapture(boss, player) {
    // Player is captured — the boss continues its captureBeam state until
    // beamTimer expires, then _updateCaptureBeam calls _startReturn itself.
    player.beCaptured();
    this.audio.capture();
  }

  _onBossKilled(boss, player) {
    // Free the captured ship
    if (player.captured || boss.hasCapturedShip) {
      player.triggerRescue(boss.x, boss.y);
    }
  }

  draw(ctx) {
    for (const e of this.enemies) e.draw(ctx);
  }
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
