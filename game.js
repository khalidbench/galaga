// Tank Brawl — main game module.
// Wires up UI, host-authoritative simulation, networking, rendering, audio.

import { audio } from './audio.js';
import { Net } from './network.js';
import {
  PICKUP_TYPES, applyPickup,
  newBuffsState, pickupIndex,
} from './pickups.js';

// ---------- Constants ----------

const WORLD_W = 1280;
const WORLD_H = 720;
const TANK_R = 18;
const BULLET_R = 4;
const BIG_BULLET_R = 11;
const BASE_TANK_SPEED = 180;
const BULLET_SPEED = 460;
const HEAVY_BULLET_SPEED = 280;
const TURRET_BULLET_SPEED = 380;
const BASE_FIRE_COOLDOWN = 0.45; // seconds
const KAFKA_FIRE_COOLDOWN = 0.15;
const MQ_FIRE_GAP = 0.12;
const RESPAWN_TIME = 7;
const MATCH_DURATION = 300; // 5 minutes
const MATCH_KILL_LIMIT = 20;
const PICKUP_INTERVAL = 25;
const TURRET_RANGE = 240;
const TURRET_FIRE_COOLDOWN = 0.7;
const NAME_KEY = 'tankbrawl.name';
const TICK_RATE = 60; // host simulation
const SNAPSHOT_RATE = 25; // host -> clients

// ---------- Map — infrastructure grid ----------
//
// 3×3 grid of named service blocks in the centre.
// Columns at x 300, 590, 880  (each 100 wide)
// Rows    at y 123, 333, 543  (each 54  tall)
//
// px/py = world position where that block's pickup floats (in the corridor next to the block).

const INFRA_BLOCKS = [
  // Row 1 — streaming / search / app tier
  { id: 'KAFKA',      x: 300, y: 123, w: 100, h: 54, pickup: 'KAFKA',      color: '#ff8a3d', label: 'Kafka',      px: 350, py: 207 },
  { id: 'OPENSEARCH', x: 590, y: 123, w: 100, h: 54, pickup: 'OPENSEARCH', color: '#41d3ff', label: 'OpenSearch', px: 640, py: 207 },
  { id: 'WAS',        x: 880, y: 123, w: 100, h: 54, pickup: 'WAS',        color: '#9bd9ff', label: 'WAS',        px: 930, py: 207 },
  // Row 2 — orchestration / control tier
  { id: 'PRECISELY',  x: 300, y: 333, w: 100, h: 54, pickup: 'PRECISELY',  color: '#ffe659', label: 'Precisely',  px: 350, py: 303 },
  { id: 'CONTROLM',   x: 590, y: 333, w: 100, h: 54, pickup: 'CONTROLM',   color: '#7df5a3', label: 'Control-M',  px: 640, py: 303 },
  { id: 'IBMMQ',      x: 880, y: 333, w: 100, h: 54, pickup: 'IBMMQ',      color: '#5ea7ff', label: 'IBM-MQ',     px: 930, py: 303 },
  // Row 3 — integration / migration / transfer tier
  { id: 'DMS',        x: 300, y: 543, w: 100, h: 54, pickup: 'DMS',        color: '#a875ff', label: 'DMS',        px: 350, py: 513 },
  { id: 'CFT',        x: 590, y: 543, w: 100, h: 54, pickup: 'CFT',        color: '#ff5577', label: 'CFT',        px: 640, py: 513 },
  { id: 'ROCKETES',   x: 880, y: 543, w: 100, h: 54, pickup: 'ROCKETES',   color: '#ff4ed4', label: 'ROCKET ES',  px: 930, py: 513 },
];

// Four light barriers — just enough cover to break line-of-sight, map stays open.
const COVER_WALLS = [
  { x: 200, y: 290, w: 22, h: 140 },               // blue-side central barrier
  { x: WORLD_W - 222, y: 290, w: 22, h: 140 },     // red-side mirror
  { x: 570, y: 160, w: 140, h: 22 },               // top mid crossbar
  { x: 570, y: 538, w: 140, h: 22 },               // bottom mid crossbar
];

// Infra blocks are DRIVE-THROUGH zones — not solid walls.
// Only the cover walls block movement.
const WALLS = [...COVER_WALLS];

// Network topology connections (pairs of INFRA_BLOCKS indices) drawn as cables.
const BLOCK_CONNECTIONS = [
  [0,1],[1,2],[3,4],[4,5],[6,7],[7,8],   // horizontal per row
  [0,3],[3,6],[1,4],[4,7],[2,5],[5,8],   // vertical per column
];

const BASE_BLUE = { x: 90, y: WORLD_H / 2, r: 60 };
const BASE_RED = { x: WORLD_W - 90, y: WORLD_H / 2, r: 60 };

const SPAWN_POINTS = {
  blue: [
    { x: 90, y: WORLD_H / 2 - 50 },
    { x: 90, y: WORLD_H / 2 + 50 },
    { x: 130, y: WORLD_H / 2 },
    { x: 70, y: WORLD_H / 2 - 80 },
    { x: 70, y: WORLD_H / 2 + 80 },
  ],
  red: [
    { x: WORLD_W - 90, y: WORLD_H / 2 - 50 },
    { x: WORLD_W - 90, y: WORLD_H / 2 + 50 },
    { x: WORLD_W - 130, y: WORLD_H / 2 },
    { x: WORLD_W - 70, y: WORLD_H / 2 - 80 },
    { x: WORLD_W - 70, y: WORLD_H / 2 + 80 },
  ],
};

// ---------- Math helpers ----------

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function dist2(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }

function circleHitsRect(cx, cy, cr, r) {
  const nx = clamp(cx, r.x, r.x + r.w);
  const ny = clamp(cy, r.y, r.y + r.h);
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < cr * cr;
}

function lineIntersectsRect(x1, y1, x2, y2, r) {
  // Quick: walk the segment in steps; cheap and good enough for short bullet steps
  const dx = x2 - x1, dy = y2 - y1;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 6));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x1 + dx * t, y = y1 + dy * t;
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
  }
  return false;
}

function tankBlocked(x, y) {
  if (x < TANK_R || x > WORLD_W - TANK_R || y < TANK_R || y > WORLD_H - TANK_R) return true;
  for (const w of WALLS) if (circleHitsRect(x, y, TANK_R, w)) return true;
  return false;
}

function isSafeSpot(x, y, tanks, minDist = 80) {
  if (tankBlocked(x, y)) return false;
  for (const t of tanks.values()) {
    if (!t.alive) continue;
    if (Math.hypot(t.x - x, t.y - y) < minDist) return false;
  }
  return true;
}

function findSafeSpot(tanks) {
  for (let i = 0; i < 80; i++) {
    const x = 80 + Math.random() * (WORLD_W - 160);
    const y = 80 + Math.random() * (WORLD_H - 160);
    if (isSafeSpot(x, y, tanks)) return { x, y };
  }
  return { x: WORLD_W / 2, y: WORLD_H / 2 };
}

function pickSpawnPoint(team, tanks) {
  const candidates = SPAWN_POINTS[team] || [];
  const sorted = candidates
    .map(p => ({ p, score: nearestEnemyDist(p, team, tanks) }))
    .sort((a, b) => b.score - a.score);
  for (const c of sorted) {
    if (!tankBlocked(c.p.x, c.p.y)) return { x: c.p.x, y: c.p.y };
  }
  return team === 'blue' ? { x: BASE_BLUE.x, y: BASE_BLUE.y } : { x: BASE_RED.x, y: BASE_RED.y };
}

function nearestEnemyDist(p, team, tanks) {
  let min = Infinity;
  for (const t of tanks.values()) {
    if (!t.alive || t.team === team) continue;
    const d = Math.hypot(t.x - p.x, t.y - p.y);
    if (d < min) min = d;
  }
  return min;
}

// ---------- Game state ----------

const net = new Net();
let role = null; // 'host' | 'client'
let myName = '';
let myTeam = null;

// Host-only authoritative state
let host = null;
function newHostState() {
  // Each infrastructure block owns exactly one pickup that respawns there.
  const blockPickups = INFRA_BLOCKS.map((b, i) => ({
    blockId:   b.id,
    type:      b.pickup,
    x:         b.x + b.w / 2,   // centre of the zone
    y:         b.y + b.h / 2,
    active:    true,
    respawnAt: 0,
    id:        i + 1,
  }));
  return {
    tanks: new Map(),
    bullets: [],
    blockPickups,         // one entry per INFRA_BLOCKS element
    turrets: [],
    inputs: new Map(),
    nextBulletId: 1,
    nextPickupId: INFRA_BLOCKS.length + 1,
    matchStart: 0,
    matchEnd: 0,
    scores: { blue: 0, red: 0 },
    over: false,
    events: [],
    lastTick: 0,
    lastSnapshot: 0,
  };
}

// Client view of latest snapshot
let view = null;
let myInput = { mx: 0, my: 0, ax: 0, ay: 0, fireDown: false, fire: false };

// ---------- DOM ----------

const $ = (id) => document.getElementById(id);
const screens = ['name', 'mode', 'join', 'lobby', 'game', 'end'];
function showScreen(name) {
  for (const s of screens) {
    const el = $('screen-' + s);
    if (el) el.classList.toggle('active', s === name);
  }
}

// Wire up name screen
function initLobbyUI() {
  const stored = localStorage.getItem(NAME_KEY) || '';
  $('name-input').value = stored;
  if (stored) $('name-continue').focus();

  $('name-continue').addEventListener('click', () => {
    const v = ($('name-input').value || '').trim().slice(0, 16);
    if (!v) return;
    myName = v;
    localStorage.setItem(NAME_KEY, v);
    $('mode-name').textContent = v;
    showScreen('mode');
  });
  $('name-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('name-continue').click();
  });

  $('btn-back-name').addEventListener('click', () => showScreen('name'));
  $('btn-back-mode').addEventListener('click', () => showScreen('mode'));

  $('btn-create').addEventListener('click', async () => {
    role = 'host';
    bindNetCallbacks();
    try {
      const code = await net.createRoom(myName);
      $('room-code-display').textContent = code;
      $('lobby-status').textContent = 'Room created. Share the code, then choose a team.';
      $('btn-start').disabled = false;
      $('host-hint').textContent = 'You are the host. Press Start Match when ready.';
      showScreen('lobby');
    } catch (e) {
      alert('Failed to create room: ' + (e.message || e));
    }
  });

  $('btn-join').addEventListener('click', () => {
    showScreen('join');
    $('room-input').focus();
  });

  $('btn-join-go').addEventListener('click', async () => {
    const code = ($('room-input').value || '').trim().toUpperCase();
    if (!code) return;
    role = 'client';
    bindNetCallbacks();
    $('join-error').textContent = 'Connecting...';
    try {
      await net.joinRoom(myName, code);
      $('join-error').textContent = '';
      $('room-code-display').textContent = code;
      $('lobby-status').textContent = 'Connected. Pick a team and wait for the host to start.';
      $('btn-start').disabled = true;
      $('host-hint').textContent = 'Waiting for host to start the match...';
      showScreen('lobby');
    } catch (e) {
      $('join-error').textContent = (e && e.message) || 'Could not connect';
    }
  });
  $('room-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('btn-join-go').click();
  });

  $('copy-code').addEventListener('click', async () => {
    const code = $('room-code-display').textContent;
    try {
      await navigator.clipboard.writeText(code);
      $('copy-code').textContent = 'Copied';
      setTimeout(() => ($('copy-code').textContent = 'Copy'), 1200);
    } catch (_) {}
  });

  $('btn-team-blue').addEventListener('click', () => {
    myTeam = 'blue';
    net.setMyTeam('blue');
  });
  $('btn-team-red').addEventListener('click', () => {
    myTeam = 'red';
    net.setMyTeam('red');
  });

  $('btn-start').addEventListener('click', () => {
    if (role !== 'host') return;
    startMatchAsHost();
  });

  $('btn-rematch').addEventListener('click', () => {
    showScreen('lobby');
    if (role === 'host') {
      net.returnToLobby();
      $('lobby-status').textContent = 'Lobby. Choose teams and start when ready.';
    } else {
      $('lobby-status').textContent = 'Waiting for host to start a new match...';
    }
  });

  $('mute-toggle').addEventListener('click', () => {
    const muted = audio.toggleMute();
    $('mute-toggle').textContent = muted ? '🔇' : '🔊';
    $('mute-toggle').title = muted ? 'Unmute' : 'Mute';
  });
  $('mute-toggle').textContent = audio.isMuted() ? '🔇' : '🔊';
}

function bindNetCallbacks() {
  net.onLobbyUpdate = renderLobby;
  net.onError = (msg) => { $('join-error').textContent = msg || ''; };
  net.onStartMatch = (init) => onStartMatch(init);
  net.onStateMsg = (snap, evt) => {
    if (snap) view = snap;
    if (evt) handleEvent(evt);
  };
  net.onEndMatch = (stats) => showEndScreen(stats);
  net.onInput = (pid, input) => {
    if (host) host.inputs.set(pid, input);
  };
  net.onDisconnected = (peerId) => {
    if (role === 'client' && peerId === 'host') {
      alert('Disconnected from host');
      location.reload();
    }
  };
}

function renderLobby(state) {
  if (!state) {
    // Returned to lobby
    $('lobby-status').textContent = role === 'host'
      ? 'Lobby. Choose teams and start when ready.'
      : 'Waiting for host to start a new match...';
    showScreen('lobby');
    return;
  }
  const blue = state.players.filter(p => p.team === 'blue');
  const red = state.players.filter(p => p.team === 'red');
  $('list-blue').innerHTML = blue.map(p =>
    `<li>${escape(p.name)}${p.isHost ? ' <span class="host-tag">HOST</span>' : ''}</li>`).join('');
  $('list-red').innerHTML = red.map(p =>
    `<li>${escape(p.name)}${p.isHost ? ' <span class="host-tag">HOST</span>' : ''}</li>`).join('');
  if (role === 'host') {
    const canStart = blue.length >= 1 && red.length >= 1;
    $('btn-start').disabled = !canStart;
    $('host-hint').textContent = canStart
      ? 'Both teams have at least one player. Start when ready.'
      : 'Need at least 1 player on each team.';
  }
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Host: match start ----------

function startMatchAsHost() {
  const lobby = net._lobbyState();
  const players = lobby.players.filter(p => p.team === 'blue' || p.team === 'red');
  if (players.length < 2) return;
  if (!players.some(p => p.team === 'blue') || !players.some(p => p.team === 'red')) return;

  host = newHostState();
  const now = performance.now() / 1000;
  host.matchStart = now;
  host.matchEnd = now + MATCH_DURATION;
  host.nextPickupAt = now + 8; // first pickup a bit later
  host.lastTick = now;
  host.lastSnapshot = now;

  // Spawn tanks
  for (const p of players) {
    const sp = pickSpawnPoint(p.team, host.tanks);
    host.tanks.set(p.id, makeTank(p, sp));
  }

  const init = {
    players: players.map(p => ({ id: p.id, name: p.name, team: p.team })),
    matchEnd: host.matchEnd,
    seed: Math.floor(Math.random() * 1e9),
  };
  net.startMatch(init);
}

function makeTank(player, spawn) {
  return {
    id: player.id,
    name: player.name,
    team: player.team,
    x: spawn.x, y: spawn.y,
    angle: player.team === 'blue' ? 0 : Math.PI,
    turret: player.team === 'blue' ? 0 : Math.PI,
    hp: 100,
    alive: true,
    respawnAt: 0,
    buffs: newBuffsState(),
    lastShotAt: 0,
    nextQueuedAt: 0,
    kills: 0,
    deaths: 0,
  };
}

// ---------- Host: per-tick simulation ----------

function hostTick(dt, now) {
  if (!host || host.over) return;

  // Apply inputs to tanks
  for (const tank of host.tanks.values()) {
    const inp = host.inputs.get(tank.id);
    if (!tank.alive) {
      if (now >= tank.respawnAt) respawnTank(tank);
      continue;
    }
    if (inp) {
      // WoT-style movement: hull rotates with A/D, W/S drives forward/reverse
      const TURN_SPEED = 2.2; // rad/s
      const rotate = clamp(inp.rotate || 0, -1, 1);
      const forward = clamp(inp.forward || 0, -1, 1);
      tank.angle += rotate * TURN_SPEED * dt;

      let speed = BASE_TANK_SPEED;
      if (tank.buffs.rocketes && tank.buffs.rocketes > now) speed *= 1.75;
      const nx = tank.x + Math.cos(tank.angle) * forward * speed * dt;
      const ny = tank.y + Math.sin(tank.angle) * forward * speed * dt;
      if (!tankBlocked(nx, tank.y)) tank.x = nx;
      if (!tankBlocked(tank.x, ny)) tank.y = ny;

      // Aim (turret follows mouse independently of hull)
      const ax = (inp.ax ?? tank.x) - tank.x;
      const ay = (inp.ay ?? tank.y) - tank.y;
      tank.turret = Math.atan2(ay, ax);

      // Fire (queued shots fire over time after a click)
      const cooldown = (tank.buffs.kafka && tank.buffs.kafka > now) ? KAFKA_FIRE_COOLDOWN : BASE_FIRE_COOLDOWN;

      // IBM-MQ: arm the queue on the next fire input, then auto-drain
      if (tank.buffs.queuedShots > 0 && (inp.fire || inp.fireDown)) tank.mqArmed = true;
      if (tank.mqArmed && tank.buffs.queuedShots > 0 && now >= tank.nextQueuedAt) {
        spawnBullet(tank, now);
        tank.buffs.queuedShots--;
        tank.nextQueuedAt = now + MQ_FIRE_GAP;
        if (tank.buffs.queuedShots === 0) tank.mqArmed = false;
      } else if ((inp.fire || inp.fireDown) && tank.buffs.queuedShots === 0 && now >= tank.lastShotAt + cooldown) {
        spawnBullet(tank, now);
        tank.lastShotAt = now;
      }
      // Consume one-shot edge trigger; fireDown is held-state managed by client
      inp.fire = false;
    }
  }

  // Tank-to-tank solid collision — push overlapping tanks apart.
  // Run 3 iterations so multi-tank pileups settle without tunnelling.
  const aliveTanks = [...host.tanks.values()].filter(t => t.alive);
  const MIN_TANK_DIST = TANK_R * 2 + 1;
  for (let iter = 0; iter < 3; iter++) {
    for (let i = 0; i < aliveTanks.length; i++) {
      for (let j = i + 1; j < aliveTanks.length; j++) {
        const a = aliveTanks[i], b = aliveTanks[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist >= MIN_TANK_DIST || dist < 0.001) continue;
        const push = (MIN_TANK_DIST - dist) / 2;
        const nx = dx / dist, ny = dy / dist;
        // Push each tank half the overlap away from the other
        if (!tankBlocked(a.x - nx * push, a.y - ny * push)) {
          a.x -= nx * push; a.y -= ny * push;
        }
        if (!tankBlocked(b.x + nx * push, b.y + ny * push)) {
          b.x += nx * push; b.y += ny * push;
        }
      }
    }
  }

  // Move bullets
  const remainingBullets = [];
  for (const b of host.bullets) {
    const px = b.x, py = b.y;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // Out of bounds
    if (b.x < -20 || b.x > WORLD_W + 20 || b.y < -20 || b.y > WORLD_H + 20) continue;

    // Wall hit
    let hitWall = false;
    for (const w of WALLS) {
      if (lineIntersectsRect(px, py, b.x, b.y, w)) { hitWall = true; break; }
    }
    if (hitWall) {
      pushEvent({ k: 'hitWall', x: b.x, y: b.y });
      continue;
    }

    // Tank hit
    let consumed = false;
    for (const t of host.tanks.values()) {
      if (!t.alive) continue;
      if (t.id === b.ownerId) continue;
      if (t.team === b.team) continue; // no friendly fire
      const r = b.big ? BIG_BULLET_R : BULLET_R;
      const dx = t.x - b.x, dy = t.y - b.y;
      if (dx * dx + dy * dy < (TANK_R + r) * (TANK_R + r)) {
        damageTank(t, b, now);
        consumed = true;
        break;
      }
    }
    if (!consumed) remainingBullets.push(b);
  }
  host.bullets = remainingBullets;

  // Per-block pickup respawn and collection.
  // Collection triggers when the tank drives INTO the block zone (no need to hit a point).
  for (const bp of host.blockPickups) {
    if (!bp.active) {
      if (now >= bp.respawnAt) { bp.active = true; bp.id = host.nextPickupId++; }
      continue;
    }
    const blk = INFRA_BLOCKS.find(b => b.id === bp.blockId);
    if (!blk) continue;
    for (const t of host.tanks.values()) {
      if (!t.alive) continue;
      // Tank centre overlaps the block rectangle (with a small margin = TANK_R)
      if (t.x > blk.x - TANK_R && t.x < blk.x + blk.w + TANK_R &&
          t.y > blk.y - TANK_R && t.y < blk.y + blk.h + TANK_R) {
        applyPickupHost(t, bp.type, now);
        pushEvent({ k: 'pickup', x: t.x, y: t.y, t: bp.type, pid: t.id });
        bp.active = false;
        bp.respawnAt = now + PICKUP_INTERVAL;
        break;
      }
    }
  }

  // Turret AI
  const liveTurrets = [];
  for (const tu of host.turrets) {
    if (now >= tu.expiresAt) continue;
    // Find nearest enemy in range
    let target = null, best = TURRET_RANGE * TURRET_RANGE;
    for (const t of host.tanks.values()) {
      if (!t.alive || t.team === tu.team) continue;
      const d = (t.x - tu.x) ** 2 + (t.y - tu.y) ** 2;
      if (d < best) { best = d; target = t; }
    }
    if (target && now >= tu.lastShotAt + TURRET_FIRE_COOLDOWN) {
      const ang = Math.atan2(target.y - tu.y, target.x - tu.x);
      host.bullets.push({
        id: host.nextBulletId++,
        x: tu.x, y: tu.y,
        vx: Math.cos(ang) * TURRET_BULLET_SPEED,
        vy: Math.sin(ang) * TURRET_BULLET_SPEED,
        ownerId: tu.ownerId, team: tu.team,
        dmg: 12, big: false,
      });
      tu.lastShotAt = now;
      pushEvent({ k: 'fire', x: tu.x, y: tu.y, turret: true });
    }
    liveTurrets.push(tu);
  }
  host.turrets = liveTurrets;

  // Match end conditions
  if (now >= host.matchEnd ||
      host.scores.blue >= MATCH_KILL_LIMIT ||
      host.scores.red >= MATCH_KILL_LIMIT) {
    finishMatch();
  }
}

function spawnBullet(tank, now) {
  const ang = tank.turret;
  const big = tank.buffs.cftShots > 0;
  let dmg = 20;
  if (tank.buffs.preciselyShots > 0) {
    dmg *= 2;
    tank.buffs.preciselyShots--;
  }
  if (big) {
    dmg = 60;
    tank.buffs.cftShots--;
  }
  const speed = big ? HEAVY_BULLET_SPEED : BULLET_SPEED;
  const muzzle = TANK_R + 6;
  host.bullets.push({
    id: host.nextBulletId++,
    x: tank.x + Math.cos(ang) * muzzle,
    y: tank.y + Math.sin(ang) * muzzle,
    vx: Math.cos(ang) * speed,
    vy: Math.sin(ang) * speed,
    ownerId: tank.id, team: tank.team,
    dmg, big,
  });
  pushEvent({ k: 'fire', x: tank.x, y: tank.y, big });
}

function damageTank(tank, bullet, now) {
  if (tank.buffs.shieldHits > 0) {
    tank.buffs.shieldHits--;
    pushEvent({ k: 'shield', x: tank.x, y: tank.y });
    return;
  }
  tank.hp -= bullet.dmg;
  pushEvent({ k: 'hitTank', x: tank.x, y: tank.y });
  if (tank.hp <= 0) {
    tank.hp = 0;
    tank.alive = false;
    tank.deaths++;
    tank.respawnAt = now + RESPAWN_TIME;
    pushEvent({ k: 'explosion', x: tank.x, y: tank.y });
    const killer = host.tanks.get(bullet.ownerId);
    if (killer && killer.team !== tank.team) {
      killer.kills++;
      host.scores[killer.team]++;
    }
  }
}

function respawnTank(tank) {
  const sp = pickSpawnPoint(tank.team, host.tanks);
  tank.x = sp.x; tank.y = sp.y;
  tank.angle = tank.team === 'blue' ? 0 : Math.PI;
  tank.turret = tank.angle;
  tank.hp = 100;
  tank.alive = true;
  tank.respawnAt = 0;
  tank.buffs = newBuffsState();
  tank.mqArmed = false;
  pushEvent({ k: 'respawn', x: tank.x, y: tank.y, pid: tank.id });
}

function applyPickupHost(tank, typeId, now) {
  applyPickup(tank, typeId, {
    now,
    teleportRandom: (t) => {
      const sp = findSafeSpot(host.tanks);
      t.x = sp.x; t.y = sp.y;
    },
    deployTurret: (t, expiresAt) => {
      host.turrets.push({
        ownerId: t.id, team: t.team,
        x: t.x, y: t.y,
        expiresAt, lastShotAt: 0,
      });
    },
  });
}

function pushEvent(evt) {
  host.events.push(evt);
  if (host.events.length > 50) host.events.shift();
}

// ---------- Host: snapshot building ----------

function buildSnapshot(now) {
  const tanks = [];
  for (const t of host.tanks.values()) {
    tanks.push({
      id: t.id, name: t.name, team: t.team,
      x: Math.round(t.x), y: Math.round(t.y),
      angle: +t.angle.toFixed(3), turret: +t.turret.toFixed(3),
      hp: t.hp, alive: t.alive,
      respawnIn: t.alive ? 0 : Math.max(0, t.respawnAt - now),
      kills: t.kills, deaths: t.deaths,
      buffs: {
        kafka: t.buffs.kafka > now ? t.buffs.kafka - now : 0,
        preciselyShots: t.buffs.preciselyShots,
        opensearch: t.buffs.opensearch > now ? t.buffs.opensearch - now : 0,
        controlm: t.buffs.controlm > now ? t.buffs.controlm - now : 0,
        cftShots: t.buffs.cftShots,
        shieldHits: t.buffs.shieldHits,
        queuedShots: t.buffs.queuedShots,
        rocketes: t.buffs.rocketes > now ? t.buffs.rocketes - now : 0,
      },
    });
  }
  return {
    tanks,
    bullets: host.bullets.map(b => ({
      id: b.id, x: Math.round(b.x), y: Math.round(b.y),
      vx: b.vx, vy: b.vy,
      team: b.team, big: b.big,
    })),
    pickups: host.blockPickups.filter(bp => bp.active).map(bp => ({ id: bp.id, x: bp.x, y: bp.y, t: bp.type })),
    turrets: host.turrets.map(tu => ({
      x: tu.x, y: tu.y, team: tu.team,
      expiresIn: Math.max(0, tu.expiresAt - now),
    })),
    scores: { ...host.scores },
    timeLeft: Math.max(0, host.matchEnd - now),
  };
}

function finishMatch() {
  if (host.over) return;
  host.over = true;
  const stats = computeStats();
  net.endMatch(stats);
}

function computeStats() {
  const players = [];
  for (const t of host.tanks.values()) {
    players.push({ id: t.id, name: t.name, team: t.team, kills: t.kills, deaths: t.deaths });
  }
  let winner;
  if (host.scores.blue > host.scores.red) winner = 'blue';
  else if (host.scores.red > host.scores.blue) winner = 'red';
  else winner = 'draw';
  return { players, winner, scores: { ...host.scores } };
}

// ---------- Match start (both host and clients) ----------

let matchPlayers = [];
function onStartMatch(init) {
  matchPlayers = init.players;
  myTeam = (matchPlayers.find(p => p.id === net.myId) || {}).team || myTeam;
  showScreen('game');
  audio.resume();
  audio.matchStart();
  startInputCapture();
  if (role === 'host') startHostLoop();
  else startClientLoop();
}

// ---------- Input capture ----------

const keys = new Set();
let mouseScreen = { x: 0, y: 0 };

function startInputCapture() {
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  const cv = $('game-canvas');
  cv.addEventListener('mousemove', onMouseMove);
  cv.addEventListener('mousedown', onMouseDown);
  cv.addEventListener('mouseup', onMouseUp);
  cv.addEventListener('contextmenu', e => e.preventDefault());
}

function onKeyDown(e) {
  if (['w','a','s','d','W','A','S','D'].includes(e.key)) keys.add(e.key.toLowerCase());
}
function onKeyUp(e) {
  if (['w','a','s','d','W','A','S','D'].includes(e.key)) keys.delete(e.key.toLowerCase());
}
function onMouseMove(e) {
  const cv = $('game-canvas');
  const rect = cv.getBoundingClientRect();
  mouseScreen.x = ((e.clientX - rect.left) / rect.width) * WORLD_W;
  mouseScreen.y = ((e.clientY - rect.top) / rect.height) * WORLD_H;
}
function onMouseDown(e) {
  if (e.button !== 0) return;
  audio.resume();
  myInput.fireDown = true;
  myInput.fire = true;
}
function onMouseUp(e) {
  if (e.button !== 0) return;
  myInput.fireDown = false;
}

function readMyInput() {
  let forward = 0, rotate = 0;
  if (keys.has('w')) forward = 1;
  if (keys.has('s')) forward = -1;
  if (keys.has('a')) rotate = -1;
  if (keys.has('d')) rotate = 1;
  return {
    forward, rotate,
    ax: mouseScreen.x, ay: mouseScreen.y,
    fire: myInput.fire,
    fireDown: myInput.fireDown,
  };
}

// ---------- Loops ----------

let rafId = null;
let lastFrame = 0;
let inputTickAccum = 0;

function startHostLoop() {
  cancelAnimationFrame(rafId);
  lastFrame = performance.now();
  inputTickAccum = 0;
  const tick = (ts) => {
    rafId = requestAnimationFrame(tick);
    const now = ts / 1000;
    const dt = Math.min(0.05, (ts - lastFrame) / 1000);
    lastFrame = ts;

    // Capture local input as host
    const inp = readMyInput();
    const prev = host.inputs.get(net.myId) || {};
    if (inp.fire || prev.fire) inp.fire = inp.fire || prev.fire;
    host.inputs.set(net.myId, inp);
    myInput.fire = false; // consume locally

    hostTick(dt, now);

    // Build snapshot at SNAPSHOT_RATE
    if (now - host.lastSnapshot >= 1 / SNAPSHOT_RATE) {
      const snap = buildSnapshot(now);
      net.broadcastState(snap);
      view = snap; // local view as well
      // Send queued events
      if (host.events.length > 0) {
        for (const e of host.events) net.broadcastEvent(e);
        for (const e of host.events) handleEvent(e); // local audio/effects
        host.events.length = 0;
      }
      host.lastSnapshot = now;
    }

    render(now);
  };
  rafId = requestAnimationFrame(tick);
}

let clientInputInterval = null;
function startClientLoop() {
  cancelAnimationFrame(rafId);
  lastFrame = performance.now();
  if (clientInputInterval) clearInterval(clientInputInterval);
  clientInputInterval = setInterval(() => {
    if (role !== 'client') return;
    const inp = readMyInput();
    net.sendInput(inp);
    if (myInput.fire) myInput.fire = false;
  }, 33);
  const tick = (ts) => {
    rafId = requestAnimationFrame(tick);
    const now = ts / 1000;
    render(now);
  };
  rafId = requestAnimationFrame(tick);
}

// ---------- Events (audio cues) ----------

function handleEvent(evt) {
  if (!evt) return;
  switch (evt.k) {
    case 'fire': audio.fire(); break;
    case 'hitTank': audio.hitTank(); break;
    case 'hitWall': audio.hitWall(); break;
    case 'explosion': audio.explosion(); break;
    case 'pickup':
      audio.pickup(pickupIndex(evt.t));
      if (evt.pid === net.myId) showPickupToast(evt.t);
      break;
    case 'respawn': audio.respawn(); break;
    case 'shield': audio.hitWall(); break;
  }
}

// ---------- Pickup toast notification ----------

const PICKUP_DESCRIPTIONS = {
  KAFKA:      { icon: '⚡', desc: 'Triple fire rate for 10s' },
  PRECISELY:  { icon: '🎯', desc: 'Next 5 shots deal double damage' },
  OPENSEARCH: { icon: '👁', desc: 'Enemy positions revealed for 15s' },
  DMS:        { icon: '🌀', desc: 'Teleported to a safe location' },
  CONTROLM:   { icon: '🤖', desc: 'Auto-turret deployed for 20s' },
  CFT:        { icon: '💥', desc: 'Next shot fires a 60-damage shell' },
  WAS:        { icon: '🛡', desc: 'Shield absorbs your next 2 hits' },
  IBMMQ:      { icon: '📦', desc: 'Click to unleash 3 rapid shots' },
  ROCKETES:   { icon: '🚀', desc: '+75% movement speed for 12s' },
};

let _toastTimer = null;
function showPickupToast(typeId) {
  const def = PICKUP_TYPES[typeId];
  const extra = PICKUP_DESCRIPTIONS[typeId] || {};
  if (!def) return;
  const container = $('pickup-notify');

  const toast = document.createElement('div');
  toast.className = 'pickup-toast';
  toast.style.borderLeftColor = def.color;
  toast.innerHTML = `
    <span class="toast-icon">${extra.icon || '★'}</span>
    <span class="toast-name" style="color:${def.color}">${def.name}</span>
    <span class="toast-desc">— ${extra.desc || def.description || ''}</span>
  `;

  container.appendChild(toast);

  // Remove element after animation completes (2.5s visible + 0.35s fade)
  setTimeout(() => toast.remove(), 2900);
}

// ---------- Rendering ----------

const cv = $('game-canvas');
const ctx2d = cv.getContext('2d');

function render(now) {
  if (!view) return;
  const ctx = ctx2d;

  // Floor
  ctx.fillStyle = '#070d1e';
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  // Fine grid (datacenter floor tiles)
  ctx.strokeStyle = 'rgba(255,255,255,0.025)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= WORLD_W; x += 48) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD_H); ctx.stroke();
  }
  for (let y = 0; y <= WORLD_H; y += 48) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD_W, y); ctx.stroke();
  }

  // Cloud region boundary
  drawCloudRegion(ctx);

  // Bases
  drawDataCenter(ctx, BASE_BLUE.x, BASE_BLUE.y, '#3aa4ff', 'BLUE DC');
  drawDataCenter(ctx, BASE_RED.x, BASE_RED.y, '#ff5a5a', 'RED DC');

  // Network cable connections between blocks
  drawNetworkLines(ctx, now);

  // Infrastructure station zones (drive-through floor panels)
  for (const b of INFRA_BLOCKS) {
    const isActive = view.pickups.some(p => p.t === b.pickup);
    drawInfraZone(ctx, b, isActive, now);
  }

  // Cover walls — simple concrete barriers between blocks
  for (const w of COVER_WALLS) {
    ctx.fillStyle = '#1e2a4a';
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.strokeStyle = '#2e3f6e';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(w.x + 0.5, w.y + 0.5, w.w - 1, w.h - 1);
    // Subtle diagonal hatch to read as solid barrier
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let i = -w.h; i < w.w + w.h; i += 12) {
      ctx.beginPath();
      ctx.moveTo(w.x + i, w.y);
      ctx.lineTo(w.x + i + w.h, w.y + w.h);
      ctx.stroke();
    }
  }

  // Pickup collectibles (float near their block)
  for (const p of view.pickups) drawPickup(ctx, p, now);

  // Turrets
  for (const tu of view.turrets) drawTurret(ctx, tu);

  // Bullets
  for (const b of view.bullets) drawBullet(ctx, b);

  // Tanks
  const me = view.tanks.find(t => t.id === net.myId);
  const opensearchActive = me && me.buffs && me.buffs.opensearch > 0;
  for (const t of view.tanks) {
    drawTank(ctx, t, me, opensearchActive, now);
  }

  // HUD
  updateHUD(now, me);
}

// ---------- Infrastructure visuals ----------

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawCloudRegion(ctx) {
  const x = 248, y = 72, w = 784, h = 576, r = 18;
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = '#4080ff';
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(80,140,255,0.22)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([10, 14]);
  roundRect(ctx, x, y, w, h, r);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(80,140,255,0.35)';
  ctx.font = 'bold 11px Menlo, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('☁  CLOUD REGION', x + 14, y + 10);
}

function drawNetworkLines(ctx, now) {
  ctx.save();
  ctx.strokeStyle = 'rgba(100,150,255,0.18)';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 14]);
  for (const [ai, bi] of BLOCK_CONNECTIONS) {
    const a = INFRA_BLOCKS[ai], b = INFRA_BLOCKS[bi];
    const ax = a.x + a.w / 2, ay = a.y + a.h / 2;
    const bx = b.x + b.w / 2, by = b.y + b.h / 2;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  }
  // Base → nearest column connections
  const blueConn = [INFRA_BLOCKS[0], INFRA_BLOCKS[3], INFRA_BLOCKS[6]];
  const redConn  = [INFRA_BLOCKS[2], INFRA_BLOCKS[5], INFRA_BLOCKS[8]];
  ctx.strokeStyle = 'rgba(58,164,255,0.13)';
  for (const b of blueConn) {
    ctx.beginPath(); ctx.moveTo(BASE_BLUE.x, BASE_BLUE.y); ctx.lineTo(b.x, b.y + b.h / 2); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,90,90,0.13)';
  for (const b of redConn) {
    ctx.beginPath(); ctx.moveTo(BASE_RED.x, BASE_RED.y); ctx.lineTo(b.x + b.w, b.y + b.h / 2); ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

function drawInfraZone(ctx, block, isActive, now) {
  const { x, y, w, h, color, label } = block;
  ctx.save();

  // Floor fill — bright when bonus available, dim when recharging
  ctx.globalAlpha = isActive ? 0.22 : 0.07;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;

  // Border — pulsing glow when active, dashed when recharging
  if (isActive) {
    const pulse = 0.55 + 0.35 * Math.sin(now * 5);
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = color;
    ctx.globalAlpha = pulse;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  } else {
    ctx.strokeStyle = color + '40';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.setLineDash([]);
  }

  // Corner tick marks so the zone reads clearly even when dim
  const tick = 10, lw = 2;
  ctx.strokeStyle = color + (isActive ? 'cc' : '50');
  ctx.lineWidth = lw;
  [[x,y],[x+w,y],[x,y+h],[x+w,y+h]].forEach(([cx,cy],i) => {
    const sx = i % 2 === 0 ? 1 : -1, sy = i < 2 ? 1 : -1;
    ctx.beginPath(); ctx.moveTo(cx + sx*tick, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + sy*tick); ctx.stroke();
  });

  // Label
  ctx.fillStyle = isActive ? color : color + '55';
  ctx.font = `bold ${isActive ? 12 : 10}px Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2);

  ctx.restore();
}

function drawDataCenter(ctx, cx, cy, color, label) {
  const w = 130, h = 190;
  const x = cx - w / 2, y = cy - h / 2;
  ctx.save();
  // Glow
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.shadowBlur = 0;

  // Body
  ctx.fillStyle = 'rgba(7,13,30,0.88)';
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);

  // Top bar
  ctx.fillStyle = color + '28';
  ctx.fillRect(x + 1, y + 1, w - 2, 22);
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, w - 2, 4);

  // Rack units (stacked sub-rects)
  for (let i = 0; i < 5; i++) {
    const ry = y + 30 + i * 28;
    ctx.fillStyle = color + '14';
    ctx.fillRect(x + 8, ry, w - 16, 22);
    ctx.strokeStyle = color + '35';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 8.5, ry + 0.5, w - 17, 21);
    const blink = Math.sin(performance.now() / 500 + i * 1.3) > 0;
    ctx.fillStyle = blink ? '#5be38a' : color + 'aa';
    ctx.beginPath(); ctx.arc(x + w - 14, ry + 11, 3, 0, Math.PI * 2); ctx.fill();
  }

  // Label below building
  ctx.fillStyle = color;
  ctx.font = 'bold 11px Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(label, cx, y + h + 6);

  // Spawn zone dashed ring
  ctx.strokeStyle = color + '35';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 8]);
  ctx.beginPath(); ctx.arc(cx, cy, BASE_BLUE.r, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}


function drawPickup(ctx, p, now) {
  const def = Object.values(PICKUP_TYPES).find(d => d.id === p.t);
  const color = def ? def.color : '#fff';
  const name = def ? def.name : p.t;
  const bob = Math.sin(now * 3 + p.id) * 2;
  ctx.save();
  ctx.translate(p.x, p.y + bob);
  // Halo
  const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 28);
  g.addColorStop(0, color + 'aa');
  g.addColorStop(1, color + '00');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, 28, 0, Math.PI * 2); ctx.fill();
  // Diamond box
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = color;
  ctx.fillRect(-12, -12, 24, 24);
  ctx.strokeStyle = '#0a0f24';
  ctx.lineWidth = 2;
  ctx.strokeRect(-12, -12, 24, 24);
  ctx.rotate(-Math.PI / 4);
  // Label
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.lineWidth = 3;
  ctx.strokeText(name, 0, 26);
  ctx.fillText(name, 0, 26);
  ctx.restore();
}

function drawTurret(ctx, tu) {
  const color = tu.team === 'blue' ? '#3aa4ff' : '#ff5a5a';
  ctx.save();
  ctx.translate(tu.x, tu.y);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0a0f24';
  ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = color;
  ctx.fillRect(-2, -16, 4, 14);
  ctx.fillRect(-16, -2, 14, 4);
  ctx.fillRect(2, -2, 14, 4);
  ctx.fillRect(-2, 2, 4, 14);
  ctx.restore();
}

function drawBullet(ctx, b) {
  const color = b.team === 'blue' ? '#9bd9ff' : '#ffb09b';
  const r = b.big ? BIG_BULLET_R : BULLET_R;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.fill();
  if (b.big) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.stroke();
  }
}

function drawTank(ctx, t, me, opensearchActive, now) {
  if (!t.alive) {
    // Show death marker
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#444';
    ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.ceil(t.respawnIn)}s`, 0, 4);
    ctx.restore();
    return;
  }
  const color = t.team === 'blue' ? '#3aa4ff' : '#ff5a5a';
  const colorDark = t.team === 'blue' ? '#1763b8' : '#b8201d';
  const isMe = me && t.id === me.id;
  const enemyVisible = !me || t.team === me.team || opensearchActive;

  ctx.save();
  ctx.translate(t.x, t.y);

  // Highlight via opensearch
  if (opensearchActive && me && t.team !== me.team) {
    ctx.shadowColor = '#41d3ff';
    ctx.shadowBlur = 16;
  }

  // Chassis (hull rotated to tank.angle; +x = front)
  ctx.rotate(t.angle);
  // Tread tracks
  ctx.fillStyle = '#1a2240';
  ctx.fillRect(-22, -19, 44, 7);
  ctx.fillRect(-22, 12, 44, 7);
  // Hull body
  ctx.fillStyle = colorDark;
  ctx.fillRect(-20, -13, 40, 26);
  ctx.fillStyle = color;
  ctx.fillRect(-18, -11, 36, 22);
  // Front slope (tapers to a nose — clearly marks the front)
  ctx.fillStyle = colorDark;
  ctx.beginPath();
  ctx.moveTo(18, -11);
  ctx.lineTo(22, -6);
  ctx.lineTo(22, 6);
  ctx.lineTo(18, 11);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.55;
  ctx.fillRect(17, -9, 5, 18); // bright front stripe
  ctx.globalAlpha = 1;
  // Rear dark panel — marks the back
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(-22, -9, 5, 18);
  ctx.rotate(-t.angle);

  // Turret
  ctx.rotate(t.turret);
  ctx.fillStyle = colorDark;
  ctx.fillRect(0, -3, 26, 6);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = colorDark;
  ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(-t.turret);

  ctx.shadowBlur = 0;

  // Shield aura
  if (t.buffs && t.buffs.shieldHits > 0) {
    ctx.strokeStyle = '#9bd9ff';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.arc(0, 0, TANK_R + 6, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // HP bar
  const hpw = 36;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(-hpw / 2 - 1, -28 - 1, hpw + 2, 6);
  ctx.fillStyle = t.hp > 60 ? '#5be38a' : (t.hp > 30 ? '#ffd86b' : '#ff7a7a');
  ctx.fillRect(-hpw / 2, -28, (t.hp / 100) * hpw, 4);

  // Name
  ctx.fillStyle = isMe ? '#ffd86b' : (t.team === 'blue' ? '#9bd9ff' : '#ffb09b');
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.lineWidth = 3;
  ctx.font = 'bold 12px Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.strokeText(t.name, 0, -36);
  ctx.fillText(t.name, 0, -36);

  ctx.restore();

  // Friendly arrow indicator for self
  if (isMe) {
    ctx.save();
    ctx.translate(t.x, t.y - 50);
    ctx.fillStyle = '#ffd86b';
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.lineTo(-6, -2);
    ctx.lineTo(6, -2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

// ---------- HUD ----------

function updateHUD(now, me) {
  if (!view) return;
  $('score-blue').textContent = view.scores.blue;
  $('score-red').textContent = view.scores.red;
  const tl = view.timeLeft || 0;
  const m = Math.floor(tl / 60), s = Math.floor(tl % 60);
  $('match-timer').textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

  if (me) {
    const hp = clamp(me.hp, 0, 100);
    const fill = $('hp-fill');
    fill.style.width = hp + '%';
    fill.style.background = hp > 60
      ? 'linear-gradient(90deg, #5be38a, #36a35a)'
      : (hp > 30
        ? 'linear-gradient(90deg, #ffd86b, #c79a25)'
        : 'linear-gradient(90deg, #ff7a7a, #b8201d)');

    // Buffs
    const buffsEl = $('buffs');
    const list = describeBuffsForView(me.buffs || {});
    buffsEl.innerHTML = list.map(b => `
      <div class="buff" style="border-color:${b.color}">
        <span class="name" style="color:${b.color}">${b.name}</span>
        ${b.time !== null ? `<span class="time">${Math.ceil(b.time)}s</span>` : ''}
      </div>
    `).join('');
  }
}

function describeBuffsForView(buffs) {
  const out = [];
  if (buffs.kafka > 0) out.push({ name: 'KAFKA', time: buffs.kafka, color: PICKUP_TYPES.KAFKA.color });
  if (buffs.preciselyShots > 0) out.push({ name: `PRECISELY x${buffs.preciselyShots}`, time: null, color: PICKUP_TYPES.PRECISELY.color });
  if (buffs.opensearch > 0) out.push({ name: 'OPENSEARCH', time: buffs.opensearch, color: PICKUP_TYPES.OPENSEARCH.color });
  if (buffs.controlm > 0) out.push({ name: 'CTRL-M', time: buffs.controlm, color: PICKUP_TYPES.CONTROLM.color });
  if (buffs.cftShots > 0) out.push({ name: `CFT x${buffs.cftShots}`, time: null, color: PICKUP_TYPES.CFT.color });
  if (buffs.shieldHits > 0) out.push({ name: `WAS x${buffs.shieldHits}`, time: null, color: PICKUP_TYPES.WAS.color });
  if (buffs.queuedShots > 0) out.push({ name: `MQ x${buffs.queuedShots}`, time: null, color: PICKUP_TYPES.IBMMQ.color });
  if (buffs.rocketes > 0) out.push({ name: 'ROCKET-ES', time: buffs.rocketes, color: PICKUP_TYPES.ROCKETES.color });
  return out;
}

// ---------- End screen ----------

function showEndScreen(stats) {
  cancelAnimationFrame(rafId);
  if (clientInputInterval) { clearInterval(clientInputInterval); clientInputInterval = null; }
  document.removeEventListener('keydown', onKeyDown);
  document.removeEventListener('keyup', onKeyUp);
  const me = stats.players.find(p => p.id === net.myId);
  let title;
  if (stats.winner === 'draw') title = 'DRAW';
  else if (me && me.team === stats.winner) title = 'VICTORY';
  else title = 'DEFEAT';
  const titleEl = $('end-title');
  titleEl.textContent = title;
  titleEl.classList.remove('win', 'lose');
  if (title === 'VICTORY') titleEl.classList.add('win');
  if (title === 'DEFEAT') titleEl.classList.add('lose');

  $('end-subtitle').textContent =
    stats.winner === 'draw'
      ? `Final: Blue ${stats.scores.blue} — Red ${stats.scores.red}`
      : `${stats.winner.toUpperCase()} wins ${stats.scores[stats.winner]}–${stats.scores[stats.winner === 'blue' ? 'red' : 'blue']}`;

  audio.matchEnd(title === 'VICTORY' || title === 'DRAW');

  const tbody = $('end-stats').querySelector('tbody');
  tbody.innerHTML = stats.players
    .slice()
    .sort((a, b) => b.kills - a.kills)
    .map(p => `
      <tr>
        <td>${escape(p.name)}</td>
        <td class="team-cell ${p.team}">${p.team.toUpperCase()}</td>
        <td>${p.kills}</td>
        <td>${p.deaths}</td>
      </tr>
    `).join('');

  showScreen('end');
}

// ---------- Boot ----------

initLobbyUI();
showScreen('name');
