'use strict';
// ---------- Napoleonic RTS v0.6.1 artillery cohesion patch ----------

document.title = 'Napoleonic RTS v0.6.1';
const v061VersionBadge = document.querySelector('.version');
if (v061VersionBadge) v061VersionBadge.textContent = 'v0.6.1';

function artilleryBatteryForUnitV061(unit) {
  if (!unit || unit.dead || !unit.regimentId) return null;
  const reg = getRegiment(unit.regimentId);
  return reg && groupKindV06(reg) === 'artillery' ? reg : null;
}

function isArtilleryCrewV061(unit) {
  const reg = artilleryBatteryForUnitV061(unit);
  return !!reg && unit.type === 'infantry' && (reg.crewIds || []).includes(unit.id);
}

function batteryMovingV061(reg, cannon) {
  if (!reg || !cannon) return false;
  if (reg.path && reg.pathIndex < reg.path.length) return true;
  return Math.hypot(cannon.targetX - cannon.x, cannon.targetY - cannon.y) > 7;
}

function batteryCrewLocalOffsetsV061(reg, cannon) {
  const moving = batteryMovingV061(reg, cannon) || !!cannon.batteryMovingV061;
  return moving
    ? [{ ox: -28, oy: -14 }, { ox: -28, oy: 14 }]
    : [{ ox: -9, oy: -24 }, { ox: -9, oy: 24 }];
}

function batteryWorldPointV061(cannon, offset, facing) {
  const cos = Math.cos(facing), sin = Math.sin(facing);
  return {
    x: cannon.x + offset.ox * cos - offset.oy * sin,
    y: cannon.y + offset.ox * sin + offset.oy * cos
  };
}

function syncBatteryCrewV061(reg, dt = 0) {
  if (!reg || reg.destroyed || groupKindV06(reg) !== 'artillery') return;
  const cannon = artilleryForGroupV06(reg);
  const crew = artilleryCrewV06(reg);
  if (!cannon || crew.length < 2) return;

  const previousX = Number.isFinite(cannon.batteryLastX061) ? cannon.batteryLastX061 : cannon.x;
  const previousY = Number.isFinite(cannon.batteryLastY061) ? cannon.batteryLastY061 : cannon.y;
  const displacement = Math.hypot(cannon.x - previousX, cannon.y - previousY);
  cannon.batteryMovingV061 = displacement > Math.max(0.08, dt * 0.8) || batteryMovingV061(reg, cannon);
  cannon.batteryLastX061 = cannon.x;
  cannon.batteryLastY061 = cannon.y;

  const facing = cannon.batteryMovingV061 ? (reg.facing || cannon.facing || 0) : (cannon.facing || reg.facing || 0);
  if (cannon.batteryMovingV061) cannon.facing = facing;
  reg.facing = facing;
  reg.targetFacing = facing;

  const offsets = batteryCrewLocalOffsetsV061(reg, cannon);
  crew.slice(0, 2).forEach((member, index) => {
    const point = batteryWorldPointV061(cannon, offsets[index], facing);
    member.x = point.x;
    member.y = point.y;
    member.targetX = point.x;
    member.targetY = point.y;
    member.facing = facing;
    member.formationFacing = facing;
    member.arrivedAtTarget = !cannon.batteryMovingV061;
    member.task = null;
    member.resourceTarget = null;
  });
}

function syncAllBatteryCrewV061(dt = 0) {
  for (const reg of regiments) {
    if (!reg.destroyed && groupKindV06(reg) === 'artillery') syncBatteryCrewV061(reg, dt);
  }
}

const updateUnitV06ForV061 = updateUnit;
updateUnit = function updateUnitV061(unit, dt) {
  if (!isArtilleryCrewV061(unit)) {
    updateUnitV06ForV061(unit, dt);
    return;
  }

  unit.reload -= dt;
  unit.recentHit = Math.max(0, unit.recentHit - dt);
  unit.chargeTimer = 0;
  unit.morale = Math.min(100, unit.morale + 0.55 * dt);
  const reg = artilleryBatteryForUnitV061(unit);
  const cannon = artilleryForGroupV06(reg);
  if (cannon) unit.facing = reg.facing || cannon.facing || 0;
};

const arrangeRegimentV06ForV061 = arrangeRegiment;
arrangeRegiment = function arrangeRegimentV061(reg, x, y, mode = reg.formation || 'line') {
  if (!reg || reg.destroyed || groupKindV06(reg) !== 'artillery') {
    arrangeRegimentV06ForV061(reg, x, y, mode);
    return;
  }

  const cannon = artilleryForGroupV06(reg);
  if (!cannon) return;
  if (typeof reg.facing !== 'number') reg.facing = reg.side === 'france' ? 0 : Math.PI;
  reg.formation = 'line';
  reg.targetX = x;
  reg.targetY = y;
  cannon.task = null;
  cannon.resourceTarget = null;
  cannon.targetX = Math.max(20, Math.min(WORLD.width - 20, x));
  cannon.targetY = Math.max(20, Math.min(WORLD.height - 20, y));
  cannon.formationFacing = reg.facing;
  cannon.arrivedAtTarget = false;
  syncBatteryCrewV061(reg, 0);
};

const resolveUnitOverlapsV06ForV061 = resolveUnitOverlaps;
resolveUnitOverlaps = function resolveUnitOverlapsV061() {
  resolveUnitOverlapsV06ForV061();
  syncAllBatteryCrewV061(0);
};

const updateV06ForV061 = update;
update = function updateV061(dt) {
  updateV06ForV061(dt);
  syncAllBatteryCrewV061(dt);
};

function drawBatteryCrewmanV061(x, y, base, light, moving, phase = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.arc(0, 0, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = light;
  ctx.fillRect(1, -2, 10, 3);

  if (moving) {
    const swing = Math.sin(elapsed * 9 + phase) * 3;
    ctx.strokeStyle = '#2b241e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-2, 5); ctx.lineTo(-4 + swing, 11);
    ctx.moveTo(2, 5); ctx.lineTo(4 - swing, 11);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBatteryCompositeV061(cannon, reg) {
  if (cannon.side === 'britain' && !isVisibleToFrance(cannon)) return;
  const crew = artilleryCrewV06(reg);
  if (crew.length < 2) {
    drawUnitV06ForV061(cannon);
    return;
  }

  const base = cannon.side === 'france' ? COLORS.france : COLORS.britain;
  const light = cannon.side === 'france' ? COLORS.franceLight : COLORS.britainLight;
  const facing = cannon.facing || reg.facing || 0;
  const moving = !!cannon.batteryMovingV061 || batteryMovingV061(reg, cannon);
  const offsets = batteryCrewLocalOffsetsV061(reg, cannon);
  const selected = selectedUnits.has(cannon) || crew.some(member => selectedUnits.has(member));

  ctx.save();
  ctx.translate(cannon.x, cannon.y);
  ctx.rotate(facing);

  if (selected) {
    ctx.strokeStyle = COLORS.selected;
    ctx.lineWidth = 2.2 / camera.zoom;
    ctx.beginPath();
    ctx.ellipse(-8, 0, 38, 31, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.strokeStyle = '#4b3b2b';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-23, 0);
  ctx.lineTo(14, -1);
  ctx.stroke();
  ctx.fillStyle = '#25221e';
  ctx.beginPath();
  ctx.arc(-3, -8, 6, 0, Math.PI * 2);
  ctx.arc(-3, 8, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#171717';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(3, 0);
  ctx.lineTo(22, 0);
  ctx.stroke();

  drawBatteryCrewmanV061(offsets[0].ox, offsets[0].oy, base, light, moving, 0);
  drawBatteryCrewmanV061(offsets[1].ox, offsets[1].oy, base, light, moving, Math.PI);

  if (moving) {
    ctx.strokeStyle = light;
    ctx.lineWidth = 1.6;
    for (const off of offsets) {
      ctx.beginPath();
      ctx.moveTo(off.ox + 4, off.oy * 0.72);
      ctx.lineTo(-20, off.oy > 0 ? 4 : -4);
      ctx.stroke();
    }
  }

  const morale = crew.reduce((sum, member) => sum + member.morale, 0) / crew.length;
  ctx.fillStyle = 'rgba(0,0,0,.5)';
  ctx.fillRect(-20, -35, 40, 4);
  ctx.fillStyle = morale > 55 ? '#d8d06a' : morale > 25 ? '#d49a4b' : '#b43f38';
  ctx.fillRect(-20, -35, 40 * (morale / 100), 4);
  ctx.fillStyle = '#b8d788';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('2/2', 0, -40);
  ctx.restore();
}

const drawUnitV06ForV061 = drawUnit;
drawUnit = function drawUnitV061(unit) {
  const reg = artilleryBatteryForUnitV061(unit);
  if (reg && isArtilleryCrewV061(unit)) return;
  if (reg && unit.type === 'artillery') {
    drawBatteryCompositeV061(unit, reg);
    return;
  }
  drawUnitV06ForV061(unit);
};

const resetGameV06ForV061 = resetGame;
resetGame = function resetGameV061() {
  resetGameV06ForV061();
  syncAllBatteryCrewV061(0);
  statusEl.textContent = 'v0.6.1: kanon + 2 musketiers bewegen nu als één vaste artillerie-eenheid.';
};
