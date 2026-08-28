'use strict';
// ---------- Napoleonic RTS v0.6.9: smooth road locomotion ----------

const V069_VERSION = '0.6.9';
document.title = `Napoleonic RTS v${V069_VERSION}`;
const v069VersionBadge = document.querySelector('.version');
if (v069VersionBadge) v069VersionBadge.textContent = `v${V069_VERSION}`;

const V069_MOTION_STATS = {
  sameGroupOverlapSkips: 0,
  combatSoftCorrections: 0,
  roadRetargetFixes: 0
};

function roadArcPositionV069(road, hit) {
  if (!road || !hit) return 0;
  let distance = 0;
  for (let i = 1; i <= hit.segmentIndex; i++) {
    const a = road.points[i - 1], b = road.points[i];
    distance += Math.hypot(b.x - a.x, b.y - a.y);
  }
  const a = road.points[hit.segmentIndex], b = road.points[hit.segmentIndex + 1];
  if (a && b) distance += Math.hypot(b.x - a.x, b.y - a.y) * (hit.t || 0);
  return distance;
}

function sameRoadPathV069(start, goal, startHit, goalHit) {
  if (!startHit?.road || !goalHit?.road || startHit.road.id !== goalHit.road.id) return null;
  const road = startHit.road;
  const startArc = roadArcPositionV069(road, startHit);
  const goalArc = roadArcPositionV069(road, goalHit);
  const points = [];
  if (goalArc >= startArc) {
    for (let i = startHit.segmentIndex + 1; i <= goalHit.segmentIndex; i++) {
      const p = road.points[i];
      if (p) points.push({ x:p.x, y:p.y });
    }
  } else {
    for (let i = startHit.segmentIndex; i > goalHit.segmentIndex; i--) {
      const p = road.points[i];
      if (p) points.push({ x:p.x, y:p.y });
    }
  }
  points.push({ x:goal.x, y:goal.y });
  return dedupePathV065(points);
}

function trimInitialBacktrackV069(path, start, goal) {
  if (!Array.isArray(path) || path.length < 2) return path;
  const gx = goal.x - start.x, gy = goal.y - start.y;
  const gl = Math.hypot(gx, gy);
  if (gl < 1) return path;
  const ux = gx / gl, uy = gy / gl;
  const out = [...path];
  while (out.length > 1) {
    const p = out[0], dx = p.x - start.x, dy = p.y - start.y;
    const d = Math.hypot(dx, dy), forward = dx * ux + dy * uy;
    if (d > 300 || forward >= -6) break;
    out.shift();
  }
  return out;
}

const orderGroupPathV068ForV069 = orderGroupPathV06;
orderGroupPathV06 = function orderGroupPathV069(reg, x, y, formation = reg.formation, finalFacing = null) {
  if (!reg || reg.destroyed) return;
  const membersBefore = regimentMembers(reg);
  const start = membersBefore.length ? centroid(membersBefore) : { x:reg.targetX || x, y:reg.targetY || y };
  const oldSpeed = Number.isFinite(reg.marchV063?.speedV064) ? reg.marchV063.speedV064 : 0;
  const startHit = roadNetworkAtV066(start.x, start.y);
  const goalHit = roadNetworkAtV066(x, y);

  orderGroupPathV068ForV069(reg, x, y, formation, finalFacing);
  if (!reg.marchV063?.v064 || groupKindV06(reg) === 'artillery' || !reg.path?.length) return;

  let changed = false;
  const directRoad = sameRoadPathV069(start, {x,y}, startHit, goalHit);
  if (directRoad?.length) {
    reg.path = directRoad;
    reg.pathIndex = 0;
    reg.routeRoadsV066 = [{ id:startHit.road.id, name:startHit.road.name, roadClass:startHit.road.roadClass }];
    if (typeof routeCrossingsForPathV067 === 'function') reg.routeCrossingsV067 = routeCrossingsForPathV067(start, reg.path);
    reg.routePlanV065 = { ...(reg.routePlanV065 || {}), choice:'road', reason:'same-road-direct', kind:groupKindV06(reg) };
    changed = true;
  } else {
    const trimmed = trimInitialBacktrackV069(reg.path, start, {x,y});
    if (trimmed.length !== reg.path.length) {
      reg.path = trimmed;
      reg.pathIndex = 0;
      if (typeof routeCrossingsForPathV067 === 'function') reg.routeCrossingsV067 = routeCrossingsForPathV067(start, reg.path);
      changed = true;
    }
  }

  if (!changed) return;
  V069_MOTION_STATS.roadRetargetFixes++;
  const first = reg.path[0] || {x,y};
  const heading = Math.atan2(first.y - start.y, first.x - start.x);
  const march = reg.marchV063;
  march.anchorX = start.x;
  march.anchorY = start.y;
  march.marchFacing = heading;
  march.slotOffsetsV064 = seedFormationOffsetsV064(reg, march, heading);
  march.speedV064 = Math.max(0, Math.min(oldSpeed, desiredGroupSpeedV064(reg, march, !!startHit)));
  setLocomotionTargetsV064(reg, march, !!startHit);
};

const moveTowardV068ForV069 = moveToward;
moveToward = function moveTowardV069(u, tx, ty, dt, speed = TYPES[u.type].speed) {
  const reg = u.regimentId ? getRegiment(u.regimentId) : null;
  const march = reg?.marchV063;
  if (!u.routing && march?.v064 && groupKindV06(reg) !== 'artillery') {
    const dx = tx - u.x, dy = ty - u.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= .55) {
      u.x = tx; u.y = ty; u.arrivedAtTarget = true;
      return true;
    }
    const roadHit = roadNetworkAtV066(march.anchorX, march.anchorY);
    const terrainFactor = roadHit
      ? (roadHit.road.roadClass === 'chaussee' ? 1.24 : roadHit.road.roadClass === 'secondary' ? 1.16 : 1.09)
      : fieldSpeedFactorV066(march.anchorX, march.anchorY, groupKindV06(reg));
    const catchUp = 1 + Math.min(.42, distance / 180 * .42);
    const step = Math.min(distance, speed * terrainFactor * catchUp * dt);
    u.x += dx / distance * step;
    u.y += dy / distance * step;
    u.arrivedAtTarget = distance <= 1.4;
    if (u.type !== 'artillery') u.facing = reg.facing;
    return u.arrivedAtTarget;
  }
  return moveTowardV068ForV069(u, tx, ty, dt, speed);
};

// Formal slots already maintain intra-battalion spacing. Repeated same-group collision
// impulses made soldiers oscillate around those slots, especially on roads.
resolveUnitOverlaps = function resolveUnitOverlapsV069() {
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
      if (d < .001) {
        const angle = ((u.id * 37 + other.id * 53) % 360) * Math.PI / 180;
        dx = Math.cos(angle); dy = Math.sin(angle); d = 1;
      }
      const sameGroup = u.regimentId && u.regimentId === other.regimentId;
      const reg = sameGroup ? getRegiment(u.regimentId) : null;
      const sameFormalMarch = !!(sameGroup && reg?.marchV063?.v064 && !u.routing && !other.routing);
      if (sameFormalMarch && d >= minD * .48) {
        V069_MOTION_STATS.sameGroupOverlapSkips++;
        continue;
      }
      const regA = u.regimentId ? getRegiment(u.regimentId) : null;
      const regB = other.regimentId ? getRegiment(other.regimentId) : null;
      const softCombatContact = u.side !== other.side && !!(regA?.engagementV069 || regB?.engagementV069);
      const bothSettled = u.arrivedAtTarget && other.arrivedAtTarget;
      const correction = (minD - d) * (
        sameFormalMarch ? .025 :
        sameGroup ? .065 :
        softCombatContact ? .11 :
        bothSettled ? .12 : .30
      );
      if (softCombatContact) V069_MOTION_STATS.combatSoftCorrections++;
      const nx = dx / d, ny = dy / d;
      u.x -= nx * correction; u.y -= ny * correction;
      other.x += nx * correction; other.y += ny * correction;
      navStats.overlapCorrections++;
    }
  }
  if (typeof syncAllBatteryCrewV061 === 'function') syncAllBatteryCrewV061(0);
};
