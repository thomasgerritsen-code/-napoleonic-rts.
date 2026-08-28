'use strict';
// ---------- Napoleonic RTS v0.6.9: cohesive combat contact + protected drummer ----------

function nearestEnemyToAnchorV069(reg, maxRange = 180) {
  const anchor = groupAnchorV068(reg);
  if (!anchor) return null;
  const enemySide = opposite(reg.side);
  let best = null, bestD2 = maxRange * maxRange;
  for (const enemy of units) {
    if (enemy.dead || enemy.side !== enemySide || enemy.routing || enemy.type === 'worker') continue;
    const dx = enemy.x - anchor.x, dy = enemy.y - anchor.y, d2 = dx * dx + dy * dy;
    if (d2 < bestD2) { bestD2 = d2; best = enemy; }
  }
  return best ? { enemy:best, distance:Math.sqrt(bestD2), anchor } : null;
}

function refreshEngagementStatesV069() {
  for (const reg of regiments) {
    if (reg.destroyed || groupKindV06(reg) !== 'infantry' || !reg.marchV063?.v064) {
      if (reg) reg.engagementV069 = null;
      continue;
    }
    const traffic = reg.crossingTrafficV068;
    if (traffic?.forcedColumn && ['waiting','approach','crossing'].includes(traffic.state)) {
      reg.engagementV069 = null;
      continue;
    }
    const members = regimentMembers(reg);
    const bayonet = members.some(u => (u.type === 'infantry' || u.type === 'officer') && u.attackMode === 'bayonet');
    const hit = nearestEnemyToAnchorV069(reg, bayonet ? 155 : 145);
    if (!hit) {
      reg.engagementV069 = null;
      continue;
    }
    reg.engagementV069 = {
      mode:bayonet ? 'bayonet' : 'fire',
      enemyId:hit.enemy.id,
      distance:hit.distance,
      heading:Math.atan2(hit.enemy.y - hit.anchor.y, hit.enemy.x - hit.anchor.x),
      hold:bayonet ? hit.distance <= 72 : true,
      updatedAt:elapsed
    };
  }
}

const desiredGroupSpeedV068ForV069 = desiredGroupSpeedV064;
desiredGroupSpeedV064 = function desiredGroupSpeedV069(reg, march, roadMarch) {
  const base = desiredGroupSpeedV068ForV069(reg, march, roadMarch);
  const engagement = reg?.engagementV069;
  const traffic = reg?.crossingTrafficV068;
  if (!engagement || (traffic?.forcedColumn && ['waiting','approach','crossing'].includes(traffic.state))) return base;
  if (engagement.mode === 'fire') return 0;
  if (engagement.mode === 'bayonet') {
    if (engagement.distance <= 72) return 0;
    return base * clampV064((engagement.distance - 72) / 76, .22, .82);
  }
  return base;
};

const setLocomotionTargetsV068ForV069 = setLocomotionTargetsV064;
setLocomotionTargetsV064 = function setLocomotionTargetsV069(reg, march, roadMarch) {
  const engagement = reg?.engagementV069;
  const traffic = reg?.crossingTrafficV068;
  if (engagement && !(traffic?.forcedColumn && ['waiting','approach','crossing'].includes(traffic.state)) && groupKindV06(reg) === 'infantry') {
    march.marchFacing = turnTowardV064(march.marchFacing, engagement.heading, false, engagement.distance);
    const desired = finalFormationOffsetsV063(reg, reg.formation);
    const offsets = blendFormationOffsetsV064(reg, march, desired, engagement.mode === 'bayonet' ? 3.15 : 3.6);
    const phase = engagement.mode === 'bayonet' ? (engagement.hold ? 'close-combat' : 'combat-advance') : 'combat-halt';
    applyFormationTargetsV063(reg, march.anchorX, march.anchorY, offsets, march.marchFacing, phase);
    reg.movementPhaseV063 = phase;
    march.phase = phase;
    march.locomotionV064 = 'combat-formation';
    for (const u of regimentMembers(reg)) u.marchingV064 = engagement.mode === 'bayonet' && !engagement.hold;
    return;
  }
  setLocomotionTargetsV068ForV069(reg, march, roadMarch);
};

const updateGroupPathsV068ForV069 = updateGroupPathsV06;
updateGroupPathsV06 = function updateGroupPathsV069() {
  refreshEngagementStatesV069();
  updateGroupPathsV068ForV069();
  refreshEngagementStatesV069();
  for (const reg of regiments) {
    const e = reg.engagementV069, march = reg.marchV063;
    if (e?.hold && march?.v064) march.speedV064 *= .45;
  }
};

// In the old marching column the drummer was deliberately placed at ox +22: in front of
// the infantry. Put the support role behind the last file instead.
const marchColumnOffsetsV068ForV069 = marchColumnOffsetsV063;
marchColumnOffsetsV063 = function marchColumnOffsetsV069(reg) {
  const result = marchColumnOffsetsV068ForV069(reg);
  if (!reg || groupKindV06(reg) !== 'infantry') return result;
  const members = regimentMembers(reg);
  const drummer = members.find(u => u.id === reg.drummerId);
  const infantry = members.filter(u => u.type === 'infantry');
  if (!drummer || !infantry.length) return result;
  let rear = Infinity;
  for (const u of infantry) rear = Math.min(rear, result.get(u.id)?.ox ?? 0);
  result.set(drummer.id, { ox:rear - 36, oy:-12 });
  return result;
};

const finalFormationOffsetsV068ForV069 = finalFormationOffsetsV063;
finalFormationOffsetsV063 = function finalFormationOffsetsV069(reg, mode = reg.formation || 'line') {
  const result = finalFormationOffsetsV068ForV069(reg, mode);
  if (!reg || groupKindV06(reg) !== 'infantry') return result;
  const members = regimentMembers(reg);
  const drummer = members.find(u => u.id === reg.drummerId);
  const infantry = members.filter(u => u.type === 'infantry');
  if (!drummer || !infantry.length) return result;
  if (mode === 'square') {
    result.set(drummer.id, { ox:-14, oy:0 });
    return result;
  }
  let rear = Infinity;
  for (const u of infantry) rear = Math.min(rear, result.get(u.id)?.ox ?? 0);
  result.set(drummer.id, { ox:rear - 34, oy:-12 });
  return result;
};

// A drummer is a formation-support role, not a melee attacker. He keeps formation and morale
// support, but no longer seeks an enemy or performs the generic 10 px melee attack.
const updateUnitV068ForV069 = updateUnit;
updateUnit = function updateUnitV069(u, dt) {
  const reg = u.regimentId ? getRegiment(u.regimentId) : null;
  if (u.type !== 'drummer' || !reg || groupKindV06(reg) !== 'infantry' || u.routing) {
    updateUnitV068ForV069(u, dt);
    return;
  }
  if (u.dead) return;
  u.reload -= dt;
  u.recentHit = Math.max(0, u.recentHit - dt);
  u.chargeTimer = 0;
  u.attackMode = 'support';
  const near = nearestEnemyEntity(u, 180);
  const officerAlive = regimentMembers(reg).some(m => m.id === reg.officerId);
  u.morale = Math.min(100, u.morale + (near ? .16 : 1.2 + (officerAlive ? .55 : -.5)) * dt);
  if (u.morale < 22) {
    routeUnit(u);
    return;
  }
  const d = Math.hypot(u.targetX - u.x, u.targetY - u.y);
  if (d > .55) moveToward(u, u.targetX, u.targetY, dt, TYPES[u.type].speed);
  u.x = Math.max(8, Math.min(WORLD.width - 8, u.x));
  u.y = Math.max(8, Math.min(WORLD.height - 8, u.y));
};
