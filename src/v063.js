'use strict';
// ---------- Napoleonic RTS v0.6.3: reinforcement doctrine + coherent battalion marching ----------

const V063_VERSION = '0.6.3';
document.title = `Napoleonic RTS v${V063_VERSION}`;
const v063VersionBadge = document.querySelector('.version');
if (v063VersionBadge) v063VersionBadge.textContent = `v${V063_VERSION}`;

let aiWaveNumberV063 = 0;
let aiLastWaveAtV063 = -999;
let formationDtV063 = 0.016;

function normalizeAngleV063(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function queuedTypeCountV063(type, side = 'britain') {
  let total = 0;
  for (const b of livingBuildings(side)) {
    if (!Array.isArray(b.queue)) continue;
    total += b.queue.filter(q => q.type === type).length;
  }
  return total;
}

function queuedPopulationV063(side = 'britain') {
  let total = 0;
  for (const b of livingBuildings(side)) {
    if (!Array.isArray(b.queue)) continue;
    for (const q of b.queue) total += TYPES[q.type]?.pop || 0;
  }
  return total;
}

function livingTypeCountV063(side, type) {
  return livingUnits(side).filter(u => u.type === type && !u.routing).length;
}

function completeBuildingV063(side, type) {
  return livingBuildings(side).find(b => b.type === type && b.complete) || null;
}

function unfinishedBuildingV063(side) {
  return livingBuildings(side).find(b => !b.complete) || null;
}

function aiForceTargetsV063() {
  const late = elapsed > 300 ? 1 : 0;
  const veryLate = elapsed > 540 ? 1 : 0;
  const table = {
    aggressive: { infantry: 46, cavalry: 10, artillery: 4 },
    balanced:   { infantry: 52, cavalry: 10, artillery: 4 },
    defensive:  { infantry: 56, cavalry: 8,  artillery: 5 }
  };
  const t = { ...(table[aiStrategyV06] || table.balanced) };
  t.infantry += late * 6 + veryLate * 6;
  t.cavalry += late * 2 + veryLate * 2;
  t.artillery += late + veryLate;
  t.workers = 10;
  const infGroups = activeRegiments('britain').filter(r => groupKindV06(r) === 'infantry').length;
  const cavGroups = activeRegiments('britain').filter(r => groupKindV06(r) === 'cavalry').length;
  t.officer = Math.max(4, infGroups + cavGroups + 2);
  t.drummer = Math.max(3, infGroups + 2);
  return t;
}

function aiNeedsTypeV063(type, target) {
  return livingTypeCountV063('britain', type) + queuedTypeCountV063(type, 'britain') < target;
}

function aiStageBuildingV063(type, label) {
  const existing = livingBuildings('britain').filter(b => b.type === type);
  if (existing.some(b => !b.complete)) {
    aiPlan = `${label} afbouwen`;
    return true;
  }
  if (!existing.some(b => b.complete)) {
    const cost = BUILDINGS[type]?.cost || {};
    if (canAfford('britain', cost) && aiBuild(type)) return true;
    aiPlan = `middelen verzamelen voor ${label}`;
    return true;
  }
  return false;
}

const aiDevelopV06ForV063 = aiDevelop;
aiDevelop = function aiDevelopV063() {
  if (gameOver) return;
  recalcPopCap('britain');
  autoAssignAIWorkers();

  const e = economies.britain;
  const unfinished = unfinishedBuildingV063('britain');
  if (unfinished) {
    aiPlan = `${BUILDINGS[unfinished.type]?.label || unfinished.type} afbouwen`;
    return;
  }

  // Population capacity is treated as infrastructure, not as a reason to stop recruiting.
  const projectedPop = populationUsed('britain') + queuedPopulationV063('britain');
  if (projectedPop >= e.popCap - 5 && e.wood >= BUILDINGS.house.cost.wood) {
    if (aiBuild('house')) {
      aiPlan = 'nieuwe huisvesting voor versterkingen';
      return;
    }
  }

  // Keep the economic base alive through repeated attack waves.
  if (aiNeedsTypeV063('worker', 10) && completeBuildingV063('britain', 'towncenter')) {
    if (aiQueue('worker', 'towncenter')) { aiPlan = 'nieuwe arbeiders trainen'; return; }
  }

  if (aiStageBuildingV063('barracks', 'Barracks')) return;
  if (elapsed > 45 && aiStageBuildingV063('stable', 'Stable')) return;
  if (elapsed > 70 && aiStageBuildingV063('foundry', 'Artillery Foundry')) return;

  const barracksCount = livingBuildings('britain').filter(b => b.type === 'barracks' && b.complete).length;
  if (elapsed > 130 && barracksCount < 2 && e.wood >= BUILDINGS.barracks.cost.wood) {
    if (aiBuild('barracks')) { aiPlan = 'tweede Barracks voor versterkingen'; return; }
  }

  // First use troops already available in the reserve pool.
  aiAutoCrewArtilleryV06();
  if (aiTryFormRegiment()) return;
  if (aiTryCavalryRegimentV06()) return;

  const targets = aiForceTargetsV063();
  const waitingGuns = uncrewedArtilleryV06('britain').filter(u => !u.regimentId);

  // Keep two spare infantrymen per uncrewed gun before filling the line battalions.
  if (waitingGuns.length && freeUnits('britain', 'infantry').length < waitingGuns.length * 2) {
    if (aiQueue('infantry', 'barracks')) { aiPlan = 'kanonbemanning als versterking trainen'; return; }
  }

  // Officers and drummers are maintained independently so a depleted army cannot deadlock on roles.
  if (aiNeedsTypeV063('officer', targets.officer) && aiQueue('officer', 'barracks')) {
    aiPlan = 'officierenkorps aanvullen'; return;
  }
  if (aiNeedsTypeV063('drummer', targets.drummer) && aiQueue('drummer', 'barracks')) {
    aiPlan = 'drummers aanvullen'; return;
  }

  // Continuous replacement doctrine: living strength + queue is compared with force targets,
  // so under-strength surviving regiments no longer count as a complete army.
  if (aiNeedsTypeV063('infantry', targets.infantry) && aiQueue('infantry', 'barracks')) {
    aiPlan = `infanterie aanvullen (${livingTypeCountV063('britain','infantry')}/${targets.infantry})`; return;
  }
  if (completeBuildingV063('britain', 'stable') && aiNeedsTypeV063('cavalry', targets.cavalry) && aiQueue('cavalry', 'stable')) {
    aiPlan = `cavalerie aanvullen (${livingTypeCountV063('britain','cavalry')}/${targets.cavalry})`; return;
  }
  if (completeBuildingV063('britain', 'foundry') && aiNeedsTypeV063('artillery', targets.artillery) && aiQueue('artillery', 'foundry')) {
    aiPlan = `artillerie aanvullen (${livingTypeCountV063('britain','artillery')}/${targets.artillery})`; return;
  }

  aiAutoCrewArtilleryV06();
  if (aiTryFormRegiment()) return;
  if (aiTryCavalryRegimentV06()) return;

  // Retain older development behavior for opportunistic expansion once doctrine targets are satisfied.
  aiDevelopV06ForV063();
};

function groupNearBritishBaseV063(reg, radius = 620) {
  const tc = completeBuildingV063('britain', 'towncenter');
  const members = regimentMembers(reg);
  if (!tc || !members.length) return false;
  const c = centroid(members);
  return Math.hypot(c.x - tc.x, c.y - tc.y) <= radius;
}

const aiMilitaryOrderV06ForV063 = aiMilitaryOrder;
aiMilitaryOrder = function aiMilitaryOrderV063() {
  if (v05PeaceMode || gameOver) return;
  const combatGroups = activeRegiments('britain').filter(r => ['infantry','cavalry'].includes(groupKindV06(r)));
  if (!combatGroups.length) { aiPlan = 'nieuwe aanvalsgolf opbouwen'; return; }

  const readyAtBase = combatGroups.filter(r => groupNearBritishBaseV063(r));
  const required = aiStrategyV06 === 'aggressive' ? 1 : aiStrategyV06 === 'defensive' ? 3 : 2;
  const initialThreshold = aiStrategyV06 === 'aggressive' ? 38 : aiStrategyV06 === 'defensive' ? 90 : 58;

  if (aiWaveNumberV063 === 0) {
    if (elapsed < initialThreshold && readyAtBase.length < required) {
      aiMilitaryOrderV06ForV063();
      return;
    }
    aiWaveNumberV063 = 1;
    aiLastWaveAtV063 = elapsed;
    aiMilitaryOrderV06ForV063();
    aiPlan = `aanvalsgolf ${aiWaveNumberV063} ingezet`;
    return;
  }

  const sinceWave = elapsed - aiLastWaveAtV063;
  if (readyAtBase.length >= required && sinceWave >= 32 || readyAtBase.length >= 1 && sinceWave >= 78) {
    aiWaveNumberV063++;
    aiLastWaveAtV063 = elapsed;
    aiMilitaryOrderV06ForV063();
    aiPlan = `aanvalsgolf ${aiWaveNumberV063} ingezet`;
    return;
  }

  // Fresh reserves wait together instead of trickling one battalion at a time into the previous attack.
  const tc = completeBuildingV063('britain', 'towncenter');
  if (tc && readyAtBase.length) {
    readyAtBase.forEach((reg, i) => {
      const kind = groupKindV06(reg);
      orderGroupPathV06(reg, tc.x - 290, tc.y + (i - (readyAtBase.length - 1) / 2) * 115, kind === 'cavalry' ? 'column' : 'line', Math.PI);
    });
  }
  aiPlan = `aanvalsgolf ${aiWaveNumberV063 + 1} opbouwen · ${readyAtBase.length}/${required} groepen gereed`;
};

// ---------- Battalion formation movement ----------

function finalFormationOffsetsV063(reg, mode = reg.formation || 'line') {
  const members = regimentMembers(reg);
  const kind = groupKindV06(reg);
  const result = new Map();
  if (kind === 'artillery') return result;

  if (kind === 'cavalry') {
    const cavalry = members.filter(u => u.type === 'cavalry');
    const officer = members.find(u => u.id === reg.officerId);
    const files = mode === 'column' ? Math.min(3, Math.max(2, cavalry.length)) : Math.max(2, Math.ceil(cavalry.length / 2));
    cavalry.forEach((u, i) => {
      const rank = Math.floor(i / files), file = i % files;
      // Local +X is the front. Lines therefore extend across local Y.
      const ox = -rank * 31;
      const oy = (file - (files - 1) / 2) * 29;
      result.set(u.id, { ox, oy });
    });
    if (officer) result.set(officer.id, { ox: 22, oy: 0 });
    return result;
  }

  const infantry = members.filter(u => u.type === 'infantry');
  const officer = members.find(u => u.id === reg.officerId);
  const drummer = members.find(u => u.id === reg.drummerId);
  const sx = 19, sy = 18;

  if (mode === 'square' && infantry.length >= 12) {
    const side = Math.max(4, Math.ceil(Math.sqrt(infantry.length)));
    const perimeter = Math.max(4, side * 4 - 4);
    const half = (side - 1) * sy / 2;
    infantry.forEach((u, i) => {
      const k = i % perimeter;
      let ox = 0, oy = 0;
      if (k < side) { ox = half; oy = -half + k * sy; }
      else if (k < side * 2 - 1) { ox = half - (k - side + 1) * sx; oy = half; }
      else if (k < side * 3 - 2) { ox = -half; oy = half - (k - (side * 2 - 1) + 1) * sy; }
      else { ox = -half + (k - (side * 3 - 2) + 1) * sx; oy = -half; }
      result.set(u.id, { ox, oy });
    });
    if (officer) result.set(officer.id, { ox: 0, oy: 0 });
    if (drummer) result.set(drummer.id, { ox: -18, oy: 0 });
    return result;
  }

  const files = mode === 'column'
    ? Math.min(4, Math.max(3, Math.ceil(Math.sqrt(infantry.length))))
    : Math.max(6, Math.ceil(infantry.length / 2));
  infantry.forEach((u, i) => {
    const rank = Math.floor(i / files), file = i % files;
    const ox = mode === 'column' ? -rank * sx : -rank * 18;
    const oy = (file - (files - 1) / 2) * sy;
    result.set(u.id, { ox, oy });
  });
  if (officer) result.set(officer.id, { ox: -30, oy: 13 });
  if (drummer) result.set(drummer.id, { ox: -30, oy: -13 });
  return result;
}

function marchColumnOffsetsV063(reg) {
  const members = regimentMembers(reg);
  const kind = groupKindV06(reg);
  const result = new Map();
  if (kind === 'cavalry') {
    const cavalry = members.filter(u => u.type === 'cavalry');
    const officer = members.find(u => u.id === reg.officerId);
    const files = Math.min(2, Math.max(1, cavalry.length));
    cavalry.forEach((u, i) => {
      const rank = Math.floor(i / files), file = i % files;
      result.set(u.id, { ox: -rank * 32, oy: (file - (files - 1) / 2) * 30 });
    });
    if (officer) result.set(officer.id, { ox: 24, oy: 0 });
    return result;
  }

  const infantry = members.filter(u => u.type === 'infantry');
  const officer = members.find(u => u.id === reg.officerId);
  const drummer = members.find(u => u.id === reg.drummerId);
  const files = infantry.length >= 20 ? 4 : 3;
  infantry.forEach((u, i) => {
    const rank = Math.floor(i / files), file = i % files;
    result.set(u.id, { ox: -rank * 20, oy: (file - (files - 1) / 2) * 18 });
  });
  if (officer) result.set(officer.id, { ox: 22, oy: 11 });
  if (drummer) result.set(drummer.id, { ox: 22, oy: -11 });
  return result;
}

function applyFormationTargetsV063(reg, centerX, centerY, offsets, facing, phase) {
  const cos = Math.cos(facing), sin = Math.sin(facing);
  reg.facing = normalizeAngleV063(facing);
  reg.targetFacing = reg.facing;
  reg.targetX = centerX;
  reg.targetY = centerY;
  reg.movementPhaseV063 = phase;
  for (const u of regimentMembers(reg)) {
    const o = offsets.get(u.id) || { ox: 0, oy: 0 };
    const rx = o.ox * cos - o.oy * sin;
    const ry = o.ox * sin + o.oy * cos;
    u.task = null;
    u.resourceTarget = null;
    u.targetX = Math.max(20, Math.min(WORLD.width - 20, centerX + rx));
    u.targetY = Math.max(20, Math.min(WORLD.height - 20, centerY + ry));
    u.formationFacing = reg.facing;
    if (u.type !== 'artillery') u.facing = reg.facing;
  }
}

function formationReadinessV063(reg, tolerance = 20) {
  const members = regimentMembers(reg);
  if (!members.length) return 0;
  const ready = members.filter(u => Math.hypot(u.x - u.targetX, u.y - u.targetY) <= tolerance).length;
  return ready / members.length;
}

function groupMarchSpeedV063(reg) {
  const members = regimentMembers(reg);
  if (!members.length) return 0;
  const base = groupKindV06(reg) === 'cavalry' ? 74 : 43;
  let lag = 0;
  for (const u of members) lag = Math.max(lag, Math.hypot(u.x - u.targetX, u.y - u.targetY));
  const cohesion = lag > 95 ? 0.22 : lag > 65 ? 0.48 : lag > 42 ? 0.72 : 1;
  return base * cohesion;
}

const arrangeRegimentV061ForV063 = arrangeRegiment;
arrangeRegiment = function arrangeRegimentV063(reg, x, y, mode = reg.formation || 'line') {
  if (!reg || reg.destroyed) return;
  if (groupKindV06(reg) === 'artillery') {
    arrangeRegimentV061ForV063(reg, x, y, mode);
    return;
  }
  reg.marchV063 = null;
  reg.path = null;
  reg.pathIndex = 0;
  reg.formation = groupKindV06(reg) === 'cavalry' && mode === 'square' ? 'line' : mode;
  const facing = typeof reg.facing === 'number' ? reg.facing : (reg.side === 'france' ? 0 : Math.PI);
  applyFormationTargetsV063(reg, x, y, finalFormationOffsetsV063(reg, reg.formation), facing, 'deploying');
};

const orderGroupPathV06ForV063 = orderGroupPathV06;
orderGroupPathV06 = function orderGroupPathV063(reg, x, y, formation = reg.formation, finalFacing = null) {
  if (!reg || reg.destroyed) return;
  if (groupKindV06(reg) === 'artillery') {
    orderGroupPathV06ForV063(reg, x, y, formation, finalFacing);
    return;
  }
  const members = regimentMembers(reg);
  if (!members.length) return;
  const c = centroid(members);
  const normalizedFormation = groupKindV06(reg) === 'cavalry' && formation === 'square' ? 'line' : formation;
  const path = buildRegimentPathV06(c, { x, y });
  const first = path[0] || { x, y };
  const marchFacing = Math.atan2(first.y - c.y, first.x - c.x);
  const distance = Math.hypot(x - c.x, y - c.y);
  reg.formation = normalizedFormation;
  reg.path = path;
  reg.pathIndex = 0;
  reg.finalTarget = { x, y };
  reg.finalFacing = Number.isFinite(finalFacing) ? normalizeAngleV063(finalFacing) : null;
  reg.marchV063 = {
    phase: distance > 170 ? 'forming-column' : 'deploying',
    anchorX: c.x,
    anchorY: c.y,
    marchFacing,
    phaseStartedAt: elapsed,
    finalX: x,
    finalY: y
  };
  if (reg.marchV063.phase === 'forming-column') {
    applyFormationTargetsV063(reg, c.x, c.y, marchColumnOffsetsV063(reg), marchFacing, 'forming-column');
  } else {
    const facing = reg.finalFacing ?? marchFacing;
    applyFormationTargetsV063(reg, x, y, finalFormationOffsetsV063(reg, normalizedFormation), facing, 'deploying');
  }
};

function updateArtilleryPathV063(reg) {
  if (!reg.path) return;
  const waypoint = reg.path[reg.pathIndex];
  if (!waypoint) { setGroupWaypointV06(reg); return; }
  const c = centroid(regimentMembers(reg));
  if (Math.hypot(c.x - waypoint.x, c.y - waypoint.y) < 62) {
    reg.pathIndex++;
    setGroupWaypointV06(reg);
  }
}

const updateGroupPathsV06ForV063 = updateGroupPathsV06;
updateGroupPathsV06 = function updateGroupPathsV063() {
  for (const reg of regiments) {
    if (reg.destroyed) continue;
    if (groupKindV06(reg) === 'artillery') { updateArtilleryPathV063(reg); continue; }
    const march = reg.marchV063;
    if (!march) continue;

    if (march.phase === 'forming-column') {
      applyFormationTargetsV063(reg, march.anchorX, march.anchorY, marchColumnOffsetsV063(reg), march.marchFacing, 'forming-column');
      if (formationReadinessV063(reg, 22) >= 0.72 || elapsed - march.phaseStartedAt > 2.8) {
        march.phase = 'marching';
        march.phaseStartedAt = elapsed;
      }
      continue;
    }

    if (march.phase === 'deploying') {
      const facing = reg.finalFacing ?? march.marchFacing;
      applyFormationTargetsV063(reg, march.finalX, march.finalY, finalFormationOffsetsV063(reg, reg.formation), facing, 'deploying');
      if (formationReadinessV063(reg, 15) >= 0.82 || elapsed - march.phaseStartedAt > 4.2) {
        reg.facing = facing;
        reg.targetFacing = facing;
        reg.path = null;
        reg.pathIndex = 0;
        reg.marchV063 = null;
        reg.movementPhaseV063 = 'formed';
      }
      continue;
    }

    const waypoint = reg.path?.[reg.pathIndex];
    if (!waypoint) {
      march.phase = 'deploying';
      march.phaseStartedAt = elapsed;
      continue;
    }

    let dx = waypoint.x - march.anchorX, dy = waypoint.y - march.anchorY;
    let d = Math.hypot(dx, dy);
    if (d < 12) {
      reg.pathIndex++;
      const next = reg.path?.[reg.pathIndex];
      if (!next) {
        march.anchorX = march.finalX;
        march.anchorY = march.finalY;
        march.phase = 'deploying';
        march.phaseStartedAt = elapsed;
        continue;
      }
      dx = next.x - march.anchorX; dy = next.y - march.anchorY; d = Math.hypot(dx, dy);
    }

    const heading = Math.atan2(dy, dx);
    // Turn the symbolic battalion gradually rather than snapping every soldier around a waypoint.
    const delta = normalizeAngleV063(heading - march.marchFacing);
    const maxTurn = 1.55 * formationDtV063;
    march.marchFacing = normalizeAngleV063(march.marchFacing + Math.max(-maxTurn, Math.min(maxTurn, delta)));

    const speed = groupMarchSpeedV063(reg);
    const step = Math.min(d, speed * formationDtV063);
    march.anchorX += Math.cos(march.marchFacing) * step;
    march.anchorY += Math.sin(march.marchFacing) * step;
    applyFormationTargetsV063(reg, march.anchorX, march.anchorY, marchColumnOffsetsV063(reg), march.marchFacing, 'marching-column');
  }
};

// Right-drag already chooses destination at mouse-down and facing from the drag vector.
// Add a clear on-map preview so the player can see the exact battalion front before releasing.
function drawRightDragPreviewV063() {
  if (!rightDragV06 || !rightDragV06.moved) return;
  const d = rightDragV06;
  const dx = d.ex - d.sx, dy = d.ey - d.sy;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const px = -uy, py = ux;
  const selectedCount = Math.max(1, selectedRegiments().reduce((sum, r) => sum + regimentMembers(r).length, 0));
  const frontage = Math.min(180, Math.max(80, selectedCount * 4.2));
  ctx.save();
  ctx.strokeStyle = 'rgba(245,220,112,.95)';
  ctx.fillStyle = 'rgba(245,220,112,.95)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(d.sx, d.sy); ctx.lineTo(d.ex, d.ey); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(d.ex, d.ey);
  ctx.lineTo(d.ex - ux * 13 + px * 7, d.ey - uy * 13 + py * 7);
  ctx.lineTo(d.ex - ux * 13 - px * 7, d.ey - uy * 13 - py * 7);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(245,220,112,.78)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(d.sx - px * frontage / 2, d.sy - py * frontage / 2);
  ctx.lineTo(d.sx + px * frontage / 2, d.sy + py * frontage / 2);
  ctx.stroke();
  const angle = Math.round((((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360));
  ctx.font = '12px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(`Front ${angle}°`, d.ex + 9, d.ey - 9);
  ctx.restore();
}

const drawV062BaseForV063 = draw;
draw = function drawV063() {
  drawV062BaseForV063();
  drawRightDragPreviewV063();
};

const updateV062BaseForV063 = update;
update = function updateV063(dt) {
  formationDtV063 = Math.max(0.001, Math.min(0.05, dt));
  updateV062BaseForV063(dt);
};

const resetGameV061ForV063 = resetGame;
resetGame = function resetGameV063() {
  aiWaveNumberV063 = 0;
  aiLastWaveAtV063 = -999;
  resetGameV061ForV063();
  statusEl.textContent = 'v0.6.3: bataljons vormen eerst een marscolonne, marcheren samen en ontplooien in de gekozen sleeprichting.';
};
