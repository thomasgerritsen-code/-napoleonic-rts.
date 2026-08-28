'use strict';
// ---------- v0.6.3 simulation facade + performance layer ----------
// Keeps game-state commands separate from Canvas so a future renderer can consume the same simulation.

const RTS_VERSION = '0.6.3';
document.title = `Napoleonic RTS v${RTS_VERSION}`;
const simVersionBadge = document.querySelector('.version');
if (simVersionBadge) simVersionBadge.textContent = `v${RTS_VERSION}`;

const COMBAT_CELL = 180;
const combatBuckets = { france: new Map(), britain: new Map() };
const simulationMetrics = {
  fps: 0,
  frameMs: 0,
  updateMs: 0,
  drawMs: 0,
  combatQueries: 0,
  combatCandidateChecks: 0,
  combatBuckets: 0,
  livingUnits: 0,
  activeGroups: 0,
  lastAuditErrors: 0,
  stalledGroups: 0
};
let perfLastDrawAt = performance.now();
let perfLastAiPlan = aiPlan;
let perfLastAiPlanChangeAt = elapsed;
const groupProgress = new Map();

function combatKeyV062(x, y) {
  return `${Math.floor(x / COMBAT_CELL)},${Math.floor(y / COMBAT_CELL)}`;
}

function rebuildCombatSpatialHashV062() {
  combatBuckets.france.clear();
  combatBuckets.britain.clear();
  for (const u of units) {
    if (u.dead) continue;
    const map = combatBuckets[u.side];
    const key = combatKeyV062(u.x, u.y);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(u);
  }
  simulationMetrics.combatBuckets = combatBuckets.france.size + combatBuckets.britain.size;
  simulationMetrics.livingUnits = units.reduce((sum, u) => sum + (!u.dead ? 1 : 0), 0);
  simulationMetrics.activeGroups = regiments.reduce((sum, r) => sum + (!r.destroyed && regimentMembers(r).length ? 1 : 0), 0);
}

nearestEnemyEntity = function nearestEnemyEntityV062(unit, maxRange) {
  const otherSide = opposite(unit.side);
  const map = combatBuckets[otherSide];
  const cx = Math.floor(unit.x / COMBAT_CELL), cy = Math.floor(unit.y / COMBAT_CELL);
  const radiusCells = Math.max(1, Math.ceil(maxRange / COMBAT_CELL));
  let best = null, bestD2 = maxRange * maxRange;
  simulationMetrics.combatQueries++;

  for (let ox = -radiusCells; ox <= radiusCells; ox++) {
    for (let oy = -radiusCells; oy <= radiusCells; oy++) {
      const bucket = map.get(`${cx + ox},${cy + oy}`);
      if (!bucket) continue;
      for (const other of bucket) {
        if (other.dead || other.routing || other.type === 'worker') continue;
        simulationMetrics.combatCandidateChecks++;
        const dx = other.x - unit.x, dy = other.y - unit.y, d2 = dx * dx + dy * dy;
        if (d2 < bestD2) { bestD2 = d2; best = other; }
      }
    }
  }

  for (const b of buildings) {
    if (b.dead || b.side !== otherSide || !b.complete) continue;
    simulationMetrics.combatCandidateChecks++;
    const dx = b.x - unit.x, dy = b.y - unit.y, d2 = dx * dx + dy * dy;
    if (d2 < bestD2) { bestD2 = d2; best = b; }
  }
  return best;
};

function updateGroupProgressV062() {
  let stalled = 0;
  for (const reg of regiments) {
    if (reg.destroyed || !reg.path) { groupProgress.delete(reg.id); continue; }
    const members = regimentMembers(reg);
    if (!members.length) continue;
    const c = centroid(members);
    const prev = groupProgress.get(reg.id);
    if (!prev) {
      groupProgress.set(reg.id, { x: c.x, y: c.y, movedAt: elapsed });
      continue;
    }
    if (Math.hypot(c.x - prev.x, c.y - prev.y) > 4) {
      prev.x = c.x; prev.y = c.y; prev.movedAt = elapsed;
    } else if (elapsed - prev.movedAt > 20) {
      stalled++;
    }
  }
  simulationMetrics.stalledGroups = stalled;
  if (aiPlan !== perfLastAiPlan) {
    perfLastAiPlan = aiPlan;
    perfLastAiPlanChangeAt = elapsed;
  }
}

function auditSimulationV062() {
  const errors = [], warnings = [];
  for (const u of units) {
    if (u.dead) continue;
    if (![u.x, u.y, u.targetX, u.targetY, u.hp, u.morale].every(Number.isFinite)) errors.push(`unit ${u.id}: niet-eindige state`);
    if (u.x < -1 || u.y < -1 || u.x > WORLD.width + 1 || u.y > WORLD.height + 1) errors.push(`unit ${u.id}: buiten wereld (${u.x},${u.y})`);
  }
  for (const reg of regiments) {
    if (reg.destroyed) continue;
    const members = regimentMembers(reg);
    if (!members.length) errors.push(`groep ${reg.id}: actief zonder levende leden`);
    if (groupKindV06(reg) === 'artillery') {
      const cannon = artilleryForGroupV06(reg);
      if (!cannon || !canArtilleryOperateV06(cannon)) errors.push(`batterij ${reg.id}: actief maar niet operationeel`);
    }
  }
  for (const b of buildings) {
    if (b.dead) continue;
    if (!Number.isFinite(b.production) || b.production < 0 || b.production > 1.01) errors.push(`gebouw ${b.id}: ongeldige productie ${b.production}`);
    if (!Array.isArray(b.queue)) errors.push(`gebouw ${b.id}: wachtrij ontbreekt`);
    else if (b.queue.some(q => !q || !q.type || !Number.isFinite(q.time))) errors.push(`gebouw ${b.id}: ongeldige queue-entry`);
  }
  for (const side of ['france', 'britain']) {
    if (![economies[side].food, economies[side].wood, economies[side].popCap].every(Number.isFinite)) errors.push(`${side}: ongeldige economie`);
    if (economies[side].food < -0.01 || economies[side].wood < -0.01) errors.push(`${side}: negatieve resources`);
  }
  if (simulationMetrics.stalledGroups > 0) warnings.push(`${simulationMetrics.stalledGroups} groep(en) >20s zonder voortgang op pad`);
  if (elapsed > 150 && elapsed - perfLastAiPlanChangeAt > 60 && !gameOver) warnings.push(`Britse AI-plan al ${Math.round(elapsed - perfLastAiPlanChangeAt)}s ongewijzigd: ${aiPlan}`);
  simulationMetrics.lastAuditErrors = errors.length;
  return { ok: errors.length === 0, errors, warnings, elapsed, metrics: { ...simulationMetrics } };
}

function serializeUnitV062(u) {
  return { id:u.id, side:u.side, type:u.type, x:+u.x.toFixed(2), y:+u.y.toFixed(2), targetX:+u.targetX.toFixed(2), targetY:+u.targetY.toFixed(2), hp:+u.hp.toFixed(1), morale:+u.morale.toFixed(1), routing:!!u.routing, regimentId:u.regimentId || null, task:u.task || null };
}
function serializeGroupV062(reg) {
  return {
    id:reg.id,
    side:reg.side,
    kind:groupKindV06(reg),
    name:reg.name,
    formation:reg.formation,
    morale:+(reg.morale || 0).toFixed(1),
    facing:+(reg.facing || 0).toFixed(4),
    finalFacing:Number.isFinite(reg.finalFacing) ? +reg.finalFacing.toFixed(4) : null,
    movementPhase:reg.movementPhaseV063 || reg.marchV063?.phase || 'idle',
    destroyed:!!reg.destroyed,
    brokenReason:reg.brokenReason || null,
    members:regimentMembers(reg).map(serializeUnitV062),
    pathIndex:reg.pathIndex || 0,
    pathLength:reg.path?.length || 0
  };
}
function snapshotSimulationV062() {
  return {
    version: RTS_VERSION,
    elapsed:+elapsed.toFixed(2),
    world:{...WORLD},
    economies:JSON.parse(JSON.stringify(economies)),
    units:units.filter(u=>!u.dead).map(serializeUnitV062),
    buildings:buildings.filter(b=>!b.dead).map(b=>({id:b.id,side:b.side,type:b.type,x:+b.x.toFixed(1),y:+b.y.toFixed(1),complete:b.complete,hp:+b.hp.toFixed(1),queue:b.queue.map(q=>q.type),production:+b.production.toFixed(3)})),
    groups:regiments.map(serializeGroupV062),
    selection:{unitIds:[...selectedUnits].filter(u=>!u.dead).map(u=>u.id),buildingId:selectedBuilding?.id || null},
    ai:{plan:aiPlan,strategy:typeof aiStrategyV06 === 'string' ? aiStrategyV06 : null,wave:typeof aiWaveNumberV063 === 'number' ? aiWaveNumberV063 : 0},
    metrics:{...simulationMetrics},
    audit:auditSimulationV062()
  };
}

function dispatchSimulationCommandV062(command) {
  if (!command || typeof command.type !== 'string') return false;
  switch (command.type) {
    case 'move':
      if (!Number.isFinite(command.x) || !Number.isFinite(command.y)) return false;
      if (Number.isFinite(command.facing)) issueMoveWithFacingV06(command.x, command.y, command.facing);
      else issueMove(command.x, command.y);
      return true;
    case 'formation':
      if (!['line','column','square'].includes(command.formation)) return false;
      applyFormationNow(command.formation); return true;
    case 'rotate':
      if (!Number.isFinite(command.radians)) return false;
      rotateSelectedRegiments(command.radians); return true;
    case 'select-group': {
      const reg = getRegiment(command.id); if (!reg) return false;
      selectWholeRegiment(reg); updateHud(true); return true;
    }
    default: return false;
  }
}

const updateV061ForV062 = update;
update = function updateV062(dt) {
  rebuildCombatSpatialHashV062();
  simulationMetrics.combatQueries = 0;
  simulationMetrics.combatCandidateChecks = 0;
  const started = performance.now();
  updateV061ForV062(dt);
  simulationMetrics.updateMs = simulationMetrics.updateMs * 0.88 + (performance.now() - started) * 0.12;
  updateGroupProgressV062();
};

const drawV061ForV062 = draw;
draw = function drawV062() {
  const started = performance.now();
  drawV061ForV062();
  const now = performance.now();
  simulationMetrics.drawMs = simulationMetrics.drawMs * 0.88 + (now - started) * 0.12;
  const frameDelta = now - perfLastDrawAt;
  perfLastDrawAt = now;
  if (frameDelta > 0 && frameDelta < 1000) {
    const fps = 1000 / frameDelta;
    simulationMetrics.fps = simulationMetrics.fps ? simulationMetrics.fps * 0.9 + fps * 0.1 : fps;
    simulationMetrics.frameMs = simulationMetrics.frameMs ? simulationMetrics.frameMs * 0.9 + frameDelta * 0.1 : frameDelta;
  }
};

window.RTS_SIM = Object.freeze({
  version: RTS_VERSION,
  snapshot: snapshotSimulationV062,
  audit: auditSimulationV062,
  dispatch: dispatchSimulationCommandV062,
  step(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return false;
    const steps = Math.max(1, Math.ceil(seconds / 0.05));
    const dt = seconds / steps;
    for (let i=0;i<steps;i++) update(Math.min(0.05,dt));
    return true;
  },
  getMetrics() { return { ...simulationMetrics, avgCombatCandidates: simulationMetrics.combatQueries ? simulationMetrics.combatCandidateChecks / simulationMetrics.combatQueries : 0 }; }
});
