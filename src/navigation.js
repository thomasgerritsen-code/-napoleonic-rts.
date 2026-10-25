'use strict';
// ---------- v0.5 navigation / collision ----------
const NAV_CELL = 52;
const navBuckets = new Map();
const navColumns = new Map();
let navStats = { buckets: 0, overlapCorrections: 0 };

function navKey(x, y) {
  return `${Math.floor(x / NAV_CELL)},${Math.floor(y / NAV_CELL)}`;
}

function rebuildSpatialHash() {
  navBuckets.clear();
  navColumns.clear();
  for (const u of units) {
    if (u.dead) continue;
    const cx = Math.floor(u.x / NAV_CELL), cy = Math.floor(u.y / NAV_CELL);
    let column = navColumns.get(cx);
    if (!column) { column = new Map(); navColumns.set(cx, column); }
    let bucket = column.get(cy);
    if (!bucket) { bucket = []; column.set(cy, bucket); navBuckets.set(`${cx},${cy}`, bucket); }
    bucket.push(u);
  }
  navStats.buckets = navBuckets.size;
  navStats.overlapCorrections = 0;
}

function nearbyNavUnits(u) {
  const cx = Math.floor(u.x / NAV_CELL), cy = Math.floor(u.y / NAV_CELL);
  const result = [];
  for (let ox = -1; ox <= 1; ox++) {
    const column = navColumns.get(cx + ox);
    if (!column) continue;
    for (let oy = -1; oy <= 1; oy++) {
      const bucket = column.get(cy + oy);
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
    // Pick a shared right-hand convention BEFORE a head-on encounter. Pure
    // radial repulsion has no lateral solution on the centreline: both men stop,
    // then repeated collision impulses push them backwards into the same spot.
    if(u.side===other.side&&(!u.regimentId||u.regimentId!==other.regimentId)){
      const oxTarget=(other.targetX??other.x)-other.x,oyTarget=(other.targetY??other.y)-other.y;
      const remaining=Math.hypot(oxTarget,oyTarget),otherSpeed=remaining>5?TYPES[other.type].speed:0;
      const rvx=(remaining?oxTarget/remaining:0)*otherSpeed-vx*TYPES[u.type].speed;
      const rvy=(remaining?oyTarget/remaining:0)*otherSpeed-vy*TYPES[u.type].speed;
      const rx=-ox,ry=-oy,relativeSpeed2=rvx*rvx+rvy*rvy;
      const time=relativeSpeed2>1?Math.max(0,Math.min(1.1,-(rx*rvx+ry*rvy)/relativeSpeed2)):0;
      const closest=Math.hypot(rx+rvx*time,ry+rvy*time),ahead=rx*vx+ry*vy;
      if(ahead>-desired*.3&&closest<desired+5&&od<desired+65){
        const weight=Math.min(1,(desired+5-closest)/(desired+5))*Math.min(1,(desired+65-od)/35);
        sx+=-vy*weight*1.65;sy+=vx*weight*1.65;
        continue;
      }
    }
    if (od > 0.01 && od < desired * 1.35) {
      const weight = (desired * 1.35 - od) / (desired * 1.35);
      sx += ox / od * weight;
      sy += oy / od * weight;
    }
  }

  // Separation may slow a man or send him sideways, but must not reverse his
  // intended walk every frame when several friendly neighbours are close.
  const backwards=sx*vx+sy*vy;
  if(backwards<-.65){sx-=vx*(backwards+.65);sy-=vy*(backwards+.65);}

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
