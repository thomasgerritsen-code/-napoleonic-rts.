'use strict';
// ---------- v0.5 navigation / collision ----------
const NAV_CELL = 52;
const navBuckets = new Map();
let navStats = { buckets: 0, overlapCorrections: 0 };

function navKey(x, y) {
  return `${Math.floor(x / NAV_CELL)},${Math.floor(y / NAV_CELL)}`;
}

function rebuildSpatialHash() {
  navBuckets.clear();
  for (const u of units) {
    if (u.dead) continue;
    const key = navKey(u.x, u.y);
    if (!navBuckets.has(key)) navBuckets.set(key, []);
    navBuckets.get(key).push(u);
  }
  navStats.buckets = navBuckets.size;
  navStats.overlapCorrections = 0;
}

function nearbyNavUnits(u) {
  const cx = Math.floor(u.x / NAV_CELL), cy = Math.floor(u.y / NAV_CELL);
  const result = [];
  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      const bucket = navBuckets.get(`${cx + ox},${cy + oy}`);
      if (bucket) result.push(...bucket);
    }
  }
  return result;
}

function navigationVector(u, tx, ty) {
  let dx = tx - u.x, dy = ty - u.y;
  const d = Math.hypot(dx, dy) || 1;
  let vx = dx / d, vy = dy / d;

  // Local separation: prevents large groups from collapsing into a single point.
  let sx = 0, sy = 0;
  for (const other of nearbyNavUnits(u)) {
    if (other === u || other.dead) continue;
    const ox = u.x - other.x, oy = u.y - other.y;
    const od = Math.hypot(ox, oy);
    const desired = TYPES[u.type].radius + TYPES[other.type].radius + (u.regimentId && u.regimentId === other.regimentId ? 2 : 7);
    if (od > 0.01 && od < desired * 1.35) {
      const weight = (desired * 1.35 - od) / (desired * 1.35);
      sx += ox / od * weight;
      sy += oy / od * weight;
    }
  }

  // Steer around completed buildings instead of walking through them.
  let ax = 0, ay = 0;
  for (const b of buildings) {
    if (b.dead) continue;
    const halfW = b.w / 2 + TYPES[u.type].radius + 12;
    const halfH = b.h / 2 + TYPES[u.type].radius + 12;
    const bx = u.x - b.x, by = u.y - b.y;
    if (Math.abs(bx) < halfW + 35 && Math.abs(by) < halfH + 35) {
      const nx = Math.max(-1, Math.min(1, bx / halfW));
      const ny = Math.max(-1, Math.min(1, by / halfH));
      const strength = 1 - Math.min(1, Math.max(Math.abs(bx) / (halfW + 35), Math.abs(by) / (halfH + 35)));
      ax += nx * strength;
      ay += ny * strength;
    }
  }

  vx += sx * 0.78 + ax * 1.25;
  vy += sy * 0.78 + ay * 1.25;
  const len = Math.hypot(vx, vy) || 1;
  return { x: vx / len, y: vy / len, distance: d };
}

// Replaces the v0.4 straight-line mover with local steering.
moveToward = function moveTowardV05(u, tx, ty, dt, speed = TYPES[u.type].speed) {
  const nav = navigationVector(u, tx, ty);
  if (nav.distance <= 2) return true;
  const step = Math.min(nav.distance, speed * dt);
  u.x += nav.x * step;
  u.y += nav.y * step;
  if (!u.regimentId || u.routing) u.facing = Math.atan2(nav.y, nav.x);
  return nav.distance <= 4;
};

function resolveUnitOverlaps() {
  const visited = new Set();
  for (const u of units) {
    if (u.dead) continue;
    for (const other of nearbyNavUnits(u)) {
      if (other.dead || other === u) continue;
      const pair = u.id < other.id ? `${u.id}:${other.id}` : `${other.id}:${u.id}`;
      if (visited.has(pair)) continue;
      visited.add(pair);

      let dx = other.x - u.x, dy = other.y - u.y;
      let d = Math.hypot(dx, dy);
      const minD = TYPES[u.type].radius + TYPES[other.type].radius + 1.5;
      if (d >= minD) continue;
      if (d < 0.001) { dx = 1; dy = 0; d = 1; }
      const sameRegiment = u.regimentId && u.regimentId === other.regimentId;
      const correction = (minD - d) * (sameRegiment ? 0.18 : 0.42);
      const nx = dx / d, ny = dy / d;
      u.x -= nx * correction;
      u.y -= ny * correction;
      other.x += nx * correction;
      other.y += ny * correction;
      navStats.overlapCorrections++;
    }
  }
}
