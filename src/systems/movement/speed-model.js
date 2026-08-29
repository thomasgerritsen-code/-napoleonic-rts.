'use strict';
// ---------- Architecture v2: canonical battalion speed model ----------
// Behaviour-compatible extraction of the active v0.7.1 speed-parity layer.

const V071_ROAD_MULTIPLIERS = window.NRTS_CONFIG?.movement?.roadMultipliers || Object.freeze({ chaussee:1.24, secondary:1.13, track:1.05 });
const V071_INTERMEDIATE_TRAVEL_FLOOR = window.NRTS_CONFIG?.movement?.intermediateTravelFloor || Object.freeze({ road:0.95, field:0.92 });

function canonicalBaseSpeedV071(kind) {
  if (kind === 'cavalry') return TYPES.cavalry.speed;
  if (kind === 'infantry') return TYPES.infantry.speed;
  return null;
}

function canonicalRoadMultiplierV071(roadOrClass) {
  const roadClass = typeof roadOrClass === 'string' ? roadOrClass : roadOrClass?.roadClass;
  return V071_ROAD_MULTIPLIERS[roadClass] || V071_ROAD_MULTIPLIERS.secondary;
}

function canonicalTerrainSpeedV071(kind, x, y) {
  const base = canonicalBaseSpeedV071(kind);
  if (!Number.isFinite(base)) return null;
  const hit = roadNetworkAtV066(x, y);
  if (hit) return base * canonicalRoadMultiplierV071(hit.road);
  return base * fieldSpeedFactorV066(x, y, kind);
}

function intermediateArrivalFactorV071(reg, march) {
  const path = reg?.path || [];
  const index = Number.isFinite(reg?.pathIndex) ? reg.pathIndex : 0;
  const waypoint = path[index];
  if (!waypoint || index >= path.length - 1) return 1;
  const distance = Math.hypot(waypoint.x - march.anchorX, waypoint.y - march.anchorY);
  return clampV064(distance / 52, 0.58, 1);
}

function trafficRestrictedV071(reg, march) {
  if (reg?.crossingTrafficV068 && reg.crossingTrafficV068.state !== 'clearing') return true;
  return Boolean(crossingAtV067(march.anchorX, march.anchorY));
}

if (V071_ACTIVE) {
  const legacyGroupTravelSpeedsV071 = groupTravelSpeedsV065;
  const legacyRoadSpeedV071 = roadSpeedV066;
  const legacyDesiredGroupSpeedV071 = desiredGroupSpeedV064;
  const legacyUpdateMotionSpeedV071 = updateMotionSpeedV064;
  const legacyOrderGroupPathV071 = orderGroupPathV06;

  groupTravelSpeedsV065 = function groupTravelSpeedsV071Parity(kind = 'infantry') {
    const base = canonicalBaseSpeedV071(kind);
    if (!Number.isFinite(base)) return legacyGroupTravelSpeedsV071(kind);
    return { field:base, road:base * V071_ROAD_MULTIPLIERS.chaussee };
  };

  roadSpeedV066 = function roadSpeedV071Parity(kind, roadOrClass) {
    const base = canonicalBaseSpeedV071(kind);
    if (!Number.isFinite(base)) return legacyRoadSpeedV071(kind, roadOrClass);
    return base * canonicalRoadMultiplierV071(roadOrClass);
  };

  desiredGroupSpeedV064 = function desiredGroupSpeedV071Parity(reg, march, roadMarch) {
    const kind = groupKindV06(reg);
    if (!['infantry','cavalry'].includes(kind)) return legacyDesiredGroupSpeedV071(reg, march, roadMarch);
    if (!regimentMembers(reg).length) return 0;

    let speed = canonicalTerrainSpeedV071(kind, march.anchorX, march.anchorY) || 0;
    const crossing = crossingAtV067(march.anchorX, march.anchorY);
    if (crossing) speed = Math.min(speed, crossingSpeedCapV067(kind, crossing));

    const info = reg?.crossingTrafficV068;
    if (!info || info.state === 'clearing') return speed;
    const trafficCrossing = WATER_CROSSINGS_V067.find(c => c.id === info.crossingId);
    if (!trafficCrossing) return speed;
    if (info.state === 'waiting') {
      const hold = queueHoldPointV068(trafficCrossing, info.initialSide, info.queuePosition || 1);
      const distance = Math.hypot(march.anchorX-hold.x, march.anchorY-hold.y);
      if (distance <= 34) return 0;
      return Math.min(speed, kind === 'cavalry' ? 42 : 30);
    }
    return Math.min(speed, crossingSpeedCapV067(kind, trafficCrossing));
  };

  updateMotionSpeedV064 = function updateMotionSpeedV071Parity(reg, march, roadMarch) {
    const kind = groupKindV06(reg);
    if (!['infantry','cavalry'].includes(kind)) return legacyUpdateMotionSpeedV071(reg, march, roadMarch);
    const desired = desiredGroupSpeedV064(reg, march, roadMarch);
    if (!Number.isFinite(desired)) return 0;

    let internalSpeed = desired;
    const path = reg?.path || [];
    const index = Number.isFinite(reg?.pathIndex) ? reg.pathIndex : 0;
    const isIntermediate = !!path[index] && index < path.length - 1;
    if (isIntermediate && !trafficRestrictedV071(reg, march) && !reg?.engagementV069) {
      const arrivalFactor = intermediateArrivalFactorV071(reg, march);
      const floor = roadMarch ? V071_INTERMEDIATE_TRAVEL_FLOOR.road : V071_INTERMEDIATE_TRAVEL_FLOOR.field;
      if (arrivalFactor < floor) internalSpeed = desired * (floor / arrivalFactor);
    }
    march.speedV064 = internalSpeed;
    return internalSpeed;
  };

  orderGroupPathV06 = function orderGroupPathV071Parity(reg, x, y, formation = reg?.formation, finalFacing = null) {
    legacyOrderGroupPathV071(reg, x, y, formation, finalFacing);
    if (!reg || reg.destroyed || !reg.marchV063?.v064) return;
    const kind = groupKindV06(reg);
    if (!['infantry','cavalry'].includes(kind)) return;

    const march = reg.marchV063;
    const speed = canonicalTerrainSpeedV071(kind, march.anchorX, march.anchorY);
    if (!Number.isFinite(speed) || speed <= 0) return;
    march.speedV064 = speed;

    const vx = Math.cos(march.marchFacing) * speed;
    const vy = Math.sin(march.marchFacing) * speed;
    for (const u of regimentMembers(reg)) {
      const state = followerStateV071(u);
      state.vx = vx;
      state.vy = vy;
      state.lastVx = vx;
      state.lastVy = vy;
      state.lastTargetX = Number.isFinite(u.targetX) ? u.targetX : u.x;
      state.lastTargetY = Number.isFinite(u.targetY) ? u.targetY : u.y;
    }
  };

  window.__V071_SPEED_PARITY__ = Object.freeze({
    version:'0.7.1-hotfix2',
    infantryField:TYPES.infantry.speed,
    infantryChaussee:TYPES.infantry.speed * V071_ROAD_MULTIPLIERS.chaussee,
    cavalryField:TYPES.cavalry.speed,
    cavalryChaussee:TYPES.cavalry.speed * V071_ROAD_MULTIPLIERS.chaussee,
    intermediateRoadFloor:V071_INTERMEDIATE_TRAVEL_FLOOR.road,
    intermediateFieldFloor:V071_INTERMEDIATE_TRAVEL_FLOOR.field,
    cohesionThrottle:false,
    seededFollowers:true
  });
}
