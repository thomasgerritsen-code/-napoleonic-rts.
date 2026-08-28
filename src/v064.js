'use strict';
// ---------- Napoleonic RTS v0.6.4: road-only marching + smooth battalion locomotion ----------

const V064_VERSION = '0.6.4';
document.title = `Napoleonic RTS v${V064_VERSION}`;
const v064VersionBadge = document.querySelector('.version');
if (v064VersionBadge) v064VersionBadge.textContent = `v${V064_VERSION}`;

function clampV064(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothAlphaV064(rate, dt = formationDtV063) {
  return 1 - Math.exp(-rate * Math.max(0.001, dt));
}

function roadAtV064(x, y) {
  return terrainAtV06(x, y) === 'road';
}

function seedFormationOffsetsV064(reg, march, facing) {
  const offsets = new Map();
  const cos = Math.cos(facing), sin = Math.sin(facing);
  for (const u of regimentMembers(reg)) {
    const dx = u.x - march.anchorX, dy = u.y - march.anchorY;
    offsets.set(u.id, {
      ox: dx * cos + dy * sin,
      oy: -dx * sin + dy * cos
    });
  }
  return offsets;
}

function blendFormationOffsetsV064(reg, march, desired, rate) {
  if (!march.slotOffsetsV064) march.slotOffsetsV064 = seedFormationOffsetsV064(reg, march, march.marchFacing);
  const alpha = smoothAlphaV064(rate);
  const living = new Set(regimentMembers(reg).map(u => u.id));
  for (const id of [...march.slotOffsetsV064.keys()]) if (!living.has(id)) march.slotOffsetsV064.delete(id);
  for (const u of regimentMembers(reg)) {
    const target = desired.get(u.id) || { ox: 0, oy: 0 };
    const current = march.slotOffsetsV064.get(u.id) || { ...target };
    current.ox += (target.ox - current.ox) * alpha;
    current.oy += (target.oy - current.oy) * alpha;
    march.slotOffsetsV064.set(u.id, current);
  }
  return march.slotOffsetsV064;
}

function desiredGroupSpeedV064(reg, march, roadMarch) {
  const members = regimentMembers(reg);
  if (!members.length) return 0;
  const kind = groupKindV06(reg);
  const base = kind === 'cavalry'
    ? (roadMarch ? 78 : 66)
    : (roadMarch ? 46 : 37);

  let meanError = 0;
  for (const u of members) meanError += Math.hypot(u.x - u.targetX, u.y - u.targetY);
  meanError /= members.length;

  // Continuous cohesion factor: no discrete 100% -> 72% -> 48% speed jumps.
  const cohesion = clampV064(1 - Math.max(0, meanError - 18) / 170, 0.58, 1);
  return base * cohesion;
}

function updateMotionSpeedV064(reg, march, roadMarch) {
  const desired = desiredGroupSpeedV064(reg, march, roadMarch);
  if (!Number.isFinite(march.speedV064)) march.speedV064 = 0;
  const alpha = smoothAlphaV064(2.35);
  march.speedV064 += (desired - march.speedV064) * alpha;
  return march.speedV064;
}

function turnTowardV064(current, target, roadMarch) {
  const delta = normalizeAngleV063(target - current);
  const maxTurnRate = roadMarch ? 1.22 : 1.48;
  const maxTurn = maxTurnRate * formationDtV063;
  return normalizeAngleV063(current + clampV064(delta, -maxTurn, maxTurn));
}

function setLocomotionTargetsV064(reg, march, roadMarch) {
  const desiredOffsets = roadMarch
    ? marchColumnOffsetsV063(reg)
    : finalFormationOffsetsV063(reg, reg.formation);
  const offsets = blendFormationOffsetsV064(reg, march, desiredOffsets, roadMarch ? 2.5 : 2.0);
  const phase = roadMarch
    ? (march.roadBlendV064 < 0.78 ? 'road-forming' : 'road-marching')
    : 'field-moving';
  applyFormationTargetsV063(reg, march.anchorX, march.anchorY, offsets, march.marchFacing, phase);
  reg.movementPhaseV063 = phase;
  march.phase = phase;
  march.locomotionV064 = roadMarch ? 'road-march' : 'field-formation';
  for (const u of regimentMembers(reg)) u.marchingV064 = roadMarch;
}

function updateRoadBlendV064(march, roadMarch) {
  if (!Number.isFinite(march.roadBlendV064)) march.roadBlendV064 = roadMarch ? 1 : 0;
  const target = roadMarch ? 1 : 0;
  march.roadBlendV064 += (target - march.roadBlendV064) * smoothAlphaV064(2.7);
}

const orderGroupPathV063ForV064 = orderGroupPathV06;
orderGroupPathV06 = function orderGroupPathV064(reg, x, y, formation = reg.formation, finalFacing = null) {
  if (!reg || reg.destroyed) return;
  if (groupKindV06(reg) === 'artillery') {
    orderGroupPathV063ForV064(reg, x, y, formation, finalFacing);
    return;
  }

  const members = regimentMembers(reg);
  if (!members.length) return;
  const c = centroid(members);
  const normalizedFormation = groupKindV06(reg) === 'cavalry' && formation === 'square' ? 'line' : formation;
  const path = buildRegimentPathV06(c, { x, y });
  const first = path[0] || { x, y };
  const heading = Math.atan2(first.y - c.y, first.x - c.x);
  const onRoad = roadAtV064(c.x, c.y);

  reg.formation = normalizedFormation;
  reg.path = path;
  reg.pathIndex = 0;
  reg.finalTarget = { x, y };
  reg.finalFacing = Number.isFinite(finalFacing) ? normalizeAngleV063(finalFacing) : null;
  reg.marchV063 = {
    v064: true,
    phase: onRoad ? 'road-forming' : 'field-moving',
    anchorX: c.x,
    anchorY: c.y,
    marchFacing: heading,
    phaseStartedAt: elapsed,
    finalX: x,
    finalY: y,
    speedV064: 0,
    roadBlendV064: onRoad ? 1 : 0,
    locomotionV064: onRoad ? 'road-march' : 'field-formation',
    slotOffsetsV064: null
  };

  reg.marchV063.slotOffsetsV064 = seedFormationOffsetsV064(reg, reg.marchV063, heading);
  setLocomotionTargetsV064(reg, reg.marchV063, onRoad);
};

function beginFinalDeploymentV064(reg, march) {
  march.phase = 'deploying';
  march.phaseStartedAt = elapsed;
  march.anchorX = march.finalX;
  march.anchorY = march.finalY;
  march.speedV064 = 0;
  for (const u of regimentMembers(reg)) u.marchingV064 = false;
  reg.movementPhaseV063 = 'deploying';
}

const updateGroupPathsV063ForV064 = updateGroupPathsV06;
updateGroupPathsV06 = function updateGroupPathsV064() {
  for (const reg of regiments) {
    if (reg.destroyed) continue;
    if (groupKindV06(reg) === 'artillery') {
      // Preserve the proven rigid artillery pathing from v0.6.3.
      if (reg.path) updateArtilleryPathV063(reg);
      continue;
    }

    const march = reg.marchV063;
    if (!march || !march.v064) {
      if (reg.path) updateGroupPathsV063ForV064();
      continue;
    }

    if (march.phase === 'deploying') {
      const facing = reg.finalFacing ?? march.marchFacing;
      const desired = finalFormationOffsetsV063(reg, reg.formation);
      const offsets = blendFormationOffsetsV064(reg, march, desired, 3.0);
      applyFormationTargetsV063(reg, march.finalX, march.finalY, offsets, facing, 'deploying');
      if (formationReadinessV063(reg, 14) >= 0.84 || elapsed - march.phaseStartedAt > 4.8) {
        reg.facing = facing;
        reg.targetFacing = facing;
        reg.path = null;
        reg.pathIndex = 0;
        reg.marchV063 = null;
        reg.movementPhaseV063 = 'formed';
        for (const u of regimentMembers(reg)) u.marchingV064 = false;
      }
      continue;
    }

    const path = reg.path || [];
    let waypoint = path[reg.pathIndex];
    if (!waypoint) {
      beginFinalDeploymentV064(reg, march);
      continue;
    }

    let dx = waypoint.x - march.anchorX;
    let dy = waypoint.y - march.anchorY;
    let distance = Math.hypot(dx, dy);
    const isLastWaypoint = reg.pathIndex >= path.length - 1;

    // Round intermediate path corners before reaching the exact cell centre. The final target,
    // however, is approached precisely so deployment never jumps the last few dozen pixels.
    const advanceDistance = isLastWaypoint ? 8 : 38;
    if (distance <= advanceDistance) {
      if (isLastWaypoint) {
        beginFinalDeploymentV064(reg, march);
        continue;
      }
      reg.pathIndex++;
      waypoint = path[reg.pathIndex];
      dx = waypoint.x - march.anchorX;
      dy = waypoint.y - march.anchorY;
      distance = Math.hypot(dx, dy);
    }

    const roadMarch = roadAtV064(march.anchorX, march.anchorY);
    updateRoadBlendV064(march, roadMarch);

    const desiredHeading = Math.atan2(dy, dx);
    march.marchFacing = turnTowardV064(march.marchFacing, desiredHeading, roadMarch);
    const speed = updateMotionSpeedV064(reg, march, roadMarch);
    const step = Math.min(distance, speed * formationDtV063);
    march.anchorX += Math.cos(march.marchFacing) * step;
    march.anchorY += Math.sin(march.marchFacing) * step;
    setLocomotionTargetsV064(reg, march, roadMarch);
  }
};

// During a formal group move the pathfinder already steers the group anchor around buildings.
// Let each soldier follow its smooth slot directly instead of simultaneously fighting local
// separation steering; this removes the visible left-right twitching inside the battalion.
const moveTowardV063ForV064 = moveToward;
moveToward = function moveTowardV064(u, tx, ty, dt, speed = TYPES[u.type].speed) {
  const reg = u.regimentId ? getRegiment(u.regimentId) : null;
  const march = reg?.marchV063;
  if (!u.routing && march?.v064 && groupKindV06(reg) !== 'artillery') {
    const dx = tx - u.x, dy = ty - u.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 1.8) {
      u.x = tx; u.y = ty; u.arrivedAtTarget = true;
      return true;
    }
    const catchUp = 1 + Math.min(0.32, distance / 220 * 0.32);
    const unitSpeed = speed * terrainSpeedMultiplierV06(u) * catchUp;
    const step = Math.min(distance, unitSpeed * dt);
    u.x += dx / distance * step;
    u.y += dy / distance * step;
    u.arrivedAtTarget = distance <= 3.5;
    u.facing = reg.facing;
    return u.arrivedAtTarget;
  }
  return moveTowardV063ForV064(u, tx, ty, dt, speed);
};

// Keep command text neutral: whether the group is actually marching depends on the terrain
// underneath the formation anchor and may change as it enters or leaves a road.
issueMove = function issueMoveV064(x, y) { issueMoveWithFacingV06(x, y, null); };
const issueMoveWithFacingV063ForV064 = issueMoveWithFacingV06;
issueMoveWithFacingV06 = function issueMoveWithFacingV064(x, y, finalFacing = null) {
  issueMoveWithFacingV063ForV064(x, y, finalFacing);
  const groups = selectedRegiments();
  if (!groups.length) return;
  const anyRoad = groups.some(reg => reg.marchV063?.locomotionV064 === 'road-march');
  statusEl.textContent = anyRoad
    ? 'Bataljon verplaatst zich; op de weg wordt in marscolonne gemarcheerd.'
    : 'Bataljon beweegt in veldformatie; marcheren gebeurt alleen op wegen.';
};

const resetGameV063ForV064 = resetGame;
resetGame = function resetGameV064() {
  resetGameV063ForV064();
  statusEl.textContent = 'v0.6.4: marcheren alleen op wegen; buiten de weg beweegt het bataljon vloeiend in veldformatie.';
};
