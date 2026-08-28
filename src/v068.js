'use strict';
// ---------- Napoleonic RTS v0.6.8: bridge traffic, queues and bottlenecks ----------

const V068_VERSION = '0.6.8';
document.title = `Napoleonic RTS v${V068_VERSION}`;
const v068VersionBadge = document.querySelector('.version');
if (v068VersionBadge) v068VersionBadge.textContent = `v${V068_VERSION}`;

const CROSSING_APPROACH_RADIUS_V068 = 470;
const CROSSING_HOLD_DISTANCE_V068 = 190;
const CROSSING_QUEUE_GAP_V068 = 155;
const CROSSING_RELEASE_DISTANCE_V068 = 178;

const CROSSING_TRAFFIC_V068 = new Map(WATER_CROSSINGS_V067.map(c => [c.id, {
  crossing: c,
  capacity: c.type === 'ford' ? 2 : 1,
  holderIds: [],
  queue: []
}]));

function crossingLocalV068(c, x, y) {
  const dx = x - c.x, dy = y - c.y;
  const cos = Math.cos(c.angle), sin = Math.sin(c.angle);
  return { along: dx * cos + dy * sin, perp: -dx * sin + dy * cos };
}

function crossingPointV068(c, along, perp = 0) {
  const cos = Math.cos(c.angle), sin = Math.sin(c.angle);
  return { x: c.x + along * cos - perp * sin, y: c.y + along * sin + perp * cos };
}

function groupAnchorV068(reg) {
  if (reg?.marchV063) return { x:reg.marchV063.anchorX, y:reg.marchV063.anchorY };
  const members = reg ? regimentMembers(reg) : [];
  return members.length ? centroid(members) : null;
}

function formalTrafficEligibleV068(reg) {
  if (!reg || reg.destroyed || !reg.marchV063?.v064) return false;
  return ['infantry','cavalry'].includes(groupKindV06(reg));
}

function trafficInitialSideV068(reg, c) {
  const anchor = groupAnchorV068(reg);
  let side = anchor ? Math.sign(bankSideV067(anchor.x, anchor.y)) : 0;
  if (!side) {
    const finalSide = Math.sign(bankSideV067(reg.finalTarget?.x ?? reg.targetX ?? c.x, reg.finalTarget?.y ?? reg.targetY ?? c.y));
    side = finalSide ? -finalSide : -1;
  }
  return side;
}

function crossingHeadingV068(c, initialSide) {
  return normalizeAngleV063(c.angle + (initialSide > 0 ? Math.PI : 0));
}

function queueHoldPointV068(c, initialSide, queuePosition = 1) {
  const distance = CROSSING_HOLD_DISTANCE_V068 + Math.max(0, queuePosition - 1) * CROSSING_QUEUE_GAP_V068;
  return crossingPointV068(c, initialSide * distance, 0);
}

function groupTouchesCrossingV068(reg, c, extra = 16) {
  return regimentMembers(reg).some(u => {
    const p = crossingLocalV068(c, u.x, u.y);
    return Math.abs(p.along) <= c.length / 2 + extra && Math.abs(p.perp) <= c.width / 2 + extra;
  });
}

function activeTrafficCrossingV068(reg) {
  const info = reg?.crossingTrafficV068;
  if (!info || info.state === 'clearing') return null;
  return WATER_CROSSINGS_V067.find(c => c.id === info.crossingId) || null;
}

function nextTrafficCrossingV068(reg) {
  if (!formalTrafficEligibleV068(reg)) return null;
  const active = activeTrafficCrossingV068(reg);
  if (active) return active;
  const cleared = reg.crossingClearedV068 || new Set();
  const anchor = groupAnchorV068(reg);
  if (!anchor) return null;

  let best = null;
  for (const routeCrossing of reg.routeCrossingsV067 || []) {
    if (cleared.has(routeCrossing.id)) continue;
    const c = WATER_CROSSINGS_V067.find(item => item.id === routeCrossing.id);
    if (!c) continue;
    const distance = Math.hypot(anchor.x - c.x, anchor.y - c.y);
    if (distance <= CROSSING_APPROACH_RADIUS_V068 && (!best || distance < best.distance)) best = { c, distance };
  }
  if (best) return best.c;

  const path = reg.path || [];
  let previous = anchor;
  const start = Math.max(0, reg.pathIndex || 0);
  for (let i = start; i < Math.min(path.length, start + 8); i++) {
    const p = path[i];
    const hit = segmentWaterCrossingV067(previous.x, previous.y, p.x, p.y);
    if (hit?.crossing && !cleared.has(hit.crossing.id)) {
      const distance = Math.hypot(anchor.x - hit.crossing.x, anchor.y - hit.crossing.y);
      if (distance <= CROSSING_APPROACH_RADIUS_V068) return hit.crossing;
    }
    previous = p;
  }
  return null;
}

function cancelTrafficForRegV068(reg) {
  if (!reg) return;
  for (const state of CROSSING_TRAFFIC_V068.values()) {
    state.holderIds = state.holderIds.filter(id => id !== reg.id);
    state.queue = state.queue.filter(id => id !== reg.id);
  }
  reg.crossingTrafficV068 = null;
}

function validTrafficRegV068(id, crossingId) {
  const reg = getRegiment(id) || regiments.find(r => r.id === id);
  if (!formalTrafficEligibleV068(reg)) return false;
  const info = reg.crossingTrafficV068;
  return !!info && info.crossingId === crossingId && info.state !== 'clearing';
}

function cleanTrafficQueuesV068() {
  for (const [crossingId, state] of CROSSING_TRAFFIC_V068) {
    state.holderIds = state.holderIds.filter(id => validTrafficRegV068(id, crossingId));
    state.queue = state.queue.filter((id, index, arr) => arr.indexOf(id) === index && validTrafficRegV068(id, crossingId) && !state.holderIds.includes(id));
  }
  for (const reg of regiments) {
    if (reg.crossingTrafficV068?.state === 'clearing' && elapsed >= reg.crossingTrafficV068.clearUntil) reg.crossingTrafficV068 = null;
  }
}

function registerTrafficV068(reg, c) {
  const state = CROSSING_TRAFFIC_V068.get(c.id);
  if (!state) return;
  if (state.holderIds.includes(reg.id) || state.queue.includes(reg.id)) return;
  const old = reg.crossingTrafficV068;
  const initialSide = old?.crossingId === c.id ? old.initialSide : trafficInitialSideV068(reg, c);
  reg.crossingTrafficV068 = {
    crossingId:c.id,
    crossingName:c.name,
    state:'queued',
    queuePosition:state.queue.length + 1,
    initialSide,
    entered:false,
    forcedColumn:true,
    joinedAt:elapsed
  };
  state.queue.push(reg.id);
}

function promoteTrafficQueuesV068() {
  for (const state of CROSSING_TRAFFIC_V068.values()) {
    while (state.holderIds.length < state.capacity && state.queue.length) {
      const id = state.queue.shift();
      const reg = getRegiment(id) || regiments.find(r => r.id === id);
      if (!formalTrafficEligibleV068(reg)) continue;
      state.holderIds.push(id);
      const old = reg.crossingTrafficV068 || {};
      reg.crossingTrafficV068 = {
        ...old,
        crossingId:state.crossing.id,
        crossingName:state.crossing.name,
        state:'approach',
        queuePosition:0,
        initialSide:Number.isFinite(old.initialSide) ? old.initialSide : trafficInitialSideV068(reg, state.crossing),
        entered:!!old.entered,
        forcedColumn:true,
        grantedAt:elapsed
      };
    }
    state.queue.forEach((id, index) => {
      const reg = getRegiment(id) || regiments.find(r => r.id === id);
      if (!reg) return;
      const old = reg.crossingTrafficV068 || {};
      reg.crossingTrafficV068 = {
        ...old,
        crossingId:state.crossing.id,
        crossingName:state.crossing.name,
        state:'waiting',
        queuePosition:index + 1,
        initialSide:Number.isFinite(old.initialSide) ? old.initialSide : trafficInitialSideV068(reg, state.crossing),
        forcedColumn:true
      };
    });
  }
}

function prepareCrossingTrafficV068() {
  cleanTrafficQueuesV068();
  for (const reg of regiments) {
    if (!formalTrafficEligibleV068(reg)) continue;
    if (reg.crossingTrafficV068?.state === 'clearing') continue;
    const crossing = nextTrafficCrossingV068(reg);
    if (crossing) registerTrafficV068(reg, crossing);
  }
  promoteTrafficQueuesV068();
}

function forceBridgeColumnTargetsV068(reg, march, info) {
  const desired = marchColumnOffsetsV063(reg);
  const offsets = blendFormationOffsetsV064(reg, march, desired, info.state === 'waiting' ? 3.6 : 3.1);
  const phase = info.state === 'waiting' ? 'bridge-waiting' : info.state === 'crossing' ? 'bridge-crossing' : info.state === 'clearing' ? 'bridge-clearing' : 'bridge-forming';
  applyFormationTargetsV063(reg, march.anchorX, march.anchorY, offsets, march.marchFacing, phase);
  reg.movementPhaseV063 = phase;
  march.phase = phase;
  march.locomotionV064 = 'bridge-column';
  for (const u of regimentMembers(reg)) u.marchingV064 = true;
}

const setLocomotionTargetsV067ForV068 = setLocomotionTargetsV064;
setLocomotionTargetsV064 = function setLocomotionTargetsV068(reg, march, roadMarch) {
  const info = reg?.crossingTrafficV068;
  if (info?.forcedColumn && march?.v064) {
    forceBridgeColumnTargetsV068(reg, march, info);
    return;
  }
  setLocomotionTargetsV067ForV068(reg, march, roadMarch);
};

const desiredGroupSpeedV067ForV068 = desiredGroupSpeedV064;
desiredGroupSpeedV064 = function desiredGroupSpeedV068(reg, march, roadMarch) {
  const base = desiredGroupSpeedV067ForV068(reg, march, roadMarch);
  const info = reg?.crossingTrafficV068;
  if (!info || info.state === 'clearing') return base;
  const c = WATER_CROSSINGS_V067.find(item => item.id === info.crossingId);
  if (!c) return base;
  const kind = groupKindV06(reg);
  if (info.state === 'waiting') {
    const hold = queueHoldPointV068(c, info.initialSide, info.queuePosition || 1);
    const distance = Math.hypot(march.anchorX - hold.x, march.anchorY - hold.y);
    if (distance <= 34) return 0;
    return Math.min(base, kind === 'cavalry' ? 42 : 30);
  }
  return Math.min(base, crossingSpeedCapV067(kind, c));
};

function clampWaitingRegimentV068(reg, march, info, c) {
  const hold = queueHoldPointV068(c, info.initialSide, info.queuePosition || 1);
  const local = crossingLocalV068(c, march.anchorX, march.anchorY);
  const holdLocal = crossingLocalV068(c, hold.x, hold.y);
  const passedStop = info.initialSide < 0 ? local.along > holdLocal.along : local.along < holdLocal.along;
  const nearStop = Math.hypot(march.anchorX - hold.x, march.anchorY - hold.y) < 42;
  if (passedStop || nearStop) {
    march.anchorX = hold.x;
    march.anchorY = hold.y;
    march.speedV064 = 0;
  }
  const desiredHeading = crossingHeadingV068(c, info.initialSide);
  march.marchFacing = turnTowardV064(march.marchFacing, desiredHeading, false, Math.hypot(march.anchorX-c.x,march.anchorY-c.y));
  forceBridgeColumnTargetsV068(reg, march, info);
}

function updateHolderStateV068(reg, march, info, c) {
  const desiredHeading = crossingHeadingV068(c, info.initialSide);
  const distance = Math.hypot(march.anchorX - c.x, march.anchorY - c.y);
  if (distance < CROSSING_APPROACH_RADIUS_V068) march.marchFacing = turnTowardV064(march.marchFacing, desiredHeading, false, distance);

  const touches = groupTouchesCrossingV068(reg, c);
  if (touches || crossingPassageContainsV067(c, march.anchorX, march.anchorY)) info.entered = true;
  info.state = info.entered ? 'crossing' : 'approach';
  info.forcedColumn = true;
  forceBridgeColumnTargetsV068(reg, march, info);

  const currentSide = Math.sign(bankSideV067(march.anchorX, march.anchorY));
  const clearedOppositeBank = info.entered && currentSide && currentSide !== info.initialSide && distance >= CROSSING_RELEASE_DISTANCE_V068 && !touches;
  if (!clearedOppositeBank) return;

  const state = CROSSING_TRAFFIC_V068.get(c.id);
  if (state) state.holderIds = state.holderIds.filter(id => id !== reg.id);
  if (!reg.crossingClearedV068) reg.crossingClearedV068 = new Set();
  reg.crossingClearedV068.add(c.id);
  reg.crossingTrafficV068 = {
    crossingId:c.id,
    crossingName:c.name,
    state:'clearing',
    queuePosition:0,
    initialSide:info.initialSide,
    entered:true,
    forcedColumn:true,
    clearUntil:elapsed + 0.9
  };
}

function enforceCrossingTrafficV068() {
  for (const reg of regiments) {
    const march = reg.marchV063;
    const info = reg.crossingTrafficV068;
    if (!march?.v064 || !info?.forcedColumn) continue;
    const c = WATER_CROSSINGS_V067.find(item => item.id === info.crossingId);
    if (!c) continue;
    if (info.state === 'waiting') clampWaitingRegimentV068(reg, march, info, c);
    else if (info.state !== 'clearing') updateHolderStateV068(reg, march, info, c);
    else forceBridgeColumnTargetsV068(reg, march, info);
  }
  promoteTrafficQueuesV068();
}

const updateGroupPathsV067ForV068 = updateGroupPathsV06;
updateGroupPathsV06 = function updateGroupPathsV068() {
  prepareCrossingTrafficV068();
  updateGroupPathsV067ForV068();
  enforceCrossingTrafficV068();
};

const orderGroupPathV067ForV068 = orderGroupPathV06;
orderGroupPathV06 = function orderGroupPathV068(reg, x, y, formation = reg.formation, finalFacing = null) {
  cancelTrafficForRegV068(reg);
  if (reg) reg.crossingClearedV068 = new Set();
  orderGroupPathV067ForV068(reg, x, y, formation, finalFacing);
};

function trafficLabelV068(state) {
  const occupied = state.holderIds.length;
  const queue = state.queue.length;
  if (!occupied && !queue) return '';
  return `${occupied}/${state.capacity} bezet${queue ? ` · wacht ${queue}` : ''}`;
}

const drawCrossingsV067ForV068 = drawCrossingsV067;
drawCrossingsV067 = function drawCrossingsV068() {
  drawCrossingsV067ForV068();
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = `${Math.max(9,10/camera.zoom)}px sans-serif`;
  for (const state of CROSSING_TRAFFIC_V068.values()) {
    const label = trafficLabelV068(state);
    if (!label) continue;
    const c = state.crossing;
    ctx.fillStyle = 'rgba(24,29,25,.78)';
    const width = Math.max(82, ctx.measureText(label).width + 12);
    ctx.fillRect(c.x - width/2, c.y + 42, width, 18);
    ctx.fillStyle = 'rgba(243,223,131,.96)';
    ctx.fillText(label, c.x, c.y + 55);
  }
  ctx.restore();
  ctx.textAlign = 'start';
};

const resetGameV067ForV068 = resetGame;
resetGame = function resetGameV068() {
  for (const state of CROSSING_TRAFFIC_V068.values()) { state.holderIds.length = 0; state.queue.length = 0; }
  resetGameV067ForV068();
  statusEl.textContent = 'v0.6.8: brugverkeer actief — bataljons vormen marscolonne, wachten op vrije passage en steken één voor één over.';
};
