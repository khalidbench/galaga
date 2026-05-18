// Pickup definitions and effect application logic.

export const PICKUP_TYPES = {
  KAFKA: {
    id: 'KAFKA',
    name: 'Kafka',
    color: '#ff8a3d',
    description: 'Triple fire rate (10s)',
    duration: 10,
  },
  PRECISELY: {
    id: 'PRECISELY',
    name: 'Precisely',
    color: '#ffe659',
    description: 'Next 5 shots crit (2x dmg)',
    duration: 0,
  },
  OPENSEARCH: {
    id: 'OPENSEARCH',
    name: 'OpenSearch',
    color: '#41d3ff',
    description: 'Reveal enemies (15s)',
    duration: 15,
  },
  DMS: {
    id: 'DMS',
    name: 'DMS',
    color: '#a875ff',
    description: 'Teleport to safe spot',
    duration: 0,
  },
  CONTROLM: {
    id: 'CONTROLM',
    name: 'Control-M',
    color: '#7df5a3',
    description: 'Auto turret (20s)',
    duration: 20,
  },
  CFT: {
    id: 'CFT',
    name: 'CFT',
    color: '#ff5577',
    description: 'Heavy shell next shot',
    duration: 0,
  },
  WAS: {
    id: 'WAS',
    name: 'WAS',
    color: '#9bd9ff',
    description: 'Shield: absorbs 2 hits',
    duration: 0,
  },
  IBMMQ: {
    id: 'IBMMQ',
    name: 'IBM-MQ',
    color: '#5ea7ff',
    description: 'Triple-shot queue',
    duration: 0,
  },
  ROCKETES: {
    id: 'ROCKETES',
    name: 'ROCKET ES',
    color: '#ff4ed4',
    description: '+75% speed (12s)',
    duration: 12,
  },
};

export const PICKUP_LIST = Object.values(PICKUP_TYPES);

export function randomPickupType() {
  return PICKUP_LIST[Math.floor(Math.random() * PICKUP_LIST.length)];
}

// Pickup index for audio variant
export function pickupIndex(typeId) {
  return PICKUP_LIST.findIndex(p => p.id === typeId);
}

// Apply a pickup to a tank's state. Mutates tank.
// Returns an object describing the immediate effect (for client-side feedback).
export function applyPickup(tank, typeId, ctx) {
  const now = ctx.now;
  switch (typeId) {
    case 'KAFKA':
      tank.buffs.kafka = now + 10;
      break;
    case 'PRECISELY':
      tank.buffs.preciselyShots = 5;
      break;
    case 'OPENSEARCH':
      tank.buffs.opensearch = now + 15;
      break;
    case 'DMS':
      ctx.teleportRandom(tank);
      break;
    case 'CONTROLM':
      ctx.deployTurret(tank, now + 20);
      tank.buffs.controlm = now + 20;
      break;
    case 'CFT':
      tank.buffs.cftShots = (tank.buffs.cftShots || 0) + 1;
      break;
    case 'WAS':
      tank.buffs.shieldHits = (tank.buffs.shieldHits || 0) + 2;
      break;
    case 'IBMMQ':
      tank.buffs.queuedShots = (tank.buffs.queuedShots || 0) + 3;
      break;
    case 'ROCKETES':
      tank.buffs.rocketes = now + 12;
      break;
  }
}

// Build a buff display list for the HUD.
export function describeBuffs(tank, now) {
  const out = [];
  if (tank.buffs.kafka && tank.buffs.kafka > now)
    out.push({ name: 'KAFKA', time: tank.buffs.kafka - now, color: PICKUP_TYPES.KAFKA.color });
  if (tank.buffs.preciselyShots > 0)
    out.push({ name: `PRECISELY x${tank.buffs.preciselyShots}`, time: null, color: PICKUP_TYPES.PRECISELY.color });
  if (tank.buffs.opensearch && tank.buffs.opensearch > now)
    out.push({ name: 'OPENSEARCH', time: tank.buffs.opensearch - now, color: PICKUP_TYPES.OPENSEARCH.color });
  if (tank.buffs.controlm && tank.buffs.controlm > now)
    out.push({ name: 'CTRL-M', time: tank.buffs.controlm - now, color: PICKUP_TYPES.CONTROLM.color });
  if (tank.buffs.cftShots > 0)
    out.push({ name: `CFT x${tank.buffs.cftShots}`, time: null, color: PICKUP_TYPES.CFT.color });
  if (tank.buffs.shieldHits > 0)
    out.push({ name: `WAS x${tank.buffs.shieldHits}`, time: null, color: PICKUP_TYPES.WAS.color });
  if (tank.buffs.queuedShots > 0)
    out.push({ name: `MQ x${tank.buffs.queuedShots}`, time: null, color: PICKUP_TYPES.IBMMQ.color });
  if (tank.buffs.rocketes && tank.buffs.rocketes > now)
    out.push({ name: 'ROCKET-ES', time: tank.buffs.rocketes - now, color: PICKUP_TYPES.ROCKETES.color });
  return out;
}

export function newBuffsState() {
  return {
    kafka: 0,
    preciselyShots: 0,
    opensearch: 0,
    controlm: 0,
    cftShots: 0,
    shieldHits: 0,
    queuedShots: 0,
    rocketes: 0,
  };
}
