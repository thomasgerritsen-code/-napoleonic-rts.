'use strict';
// ---------- Napoleonic RTS v0.5 systems ----------

document.title = 'Napoleonic RTS v0.5';
const versionBadge = document.querySelector('.version');
if (versionBadge) versionBadge.textContent = 'v0.5';

// New economy/building branches.
TRAINING.cavalry = { cost: { food: 150, wood: 50 }, time: 10 };
TRAINING.artillery = { cost: { food: 120, wood: 100 }, time: 14 };
BUILDINGS.stable = { w: 84, h: 62, hp: 820, label: 'Stable', cost: { wood: 360 } };
BUILDINGS.foundry = { w: 88, h: 64, hp: 900, label: 'Artillery Foundry', cost: { wood: 420 } };

// Add building controls without hard-coding them into the old HUD module.
function ensureV05BuildButtons() {
  if (!actionsEl.querySelector('[data-action="build-stable"]')) {
    const stable = document.createElement('button');
    stable.type = 'button'; stable.dataset.action = 'build-stable';
    stable.innerHTML = 'Stable<br><small>360 🪵</small>';
    actionsEl.appendChild(stable);
  }
  if (!actionsEl.querySelector('[data-action="build-foundry"]')) {
    const foundry = document.createElement('button');
    foundry.type = 'button'; foundry.dataset.action = 'build-foundry';
    foundry.innerHTML = 'Foundry<br><small>420 🪵</small>';
    actionsEl.appendChild(foundry);
  }
}
ensureV05BuildButtons();

// ---------- Regiment facing / rotation ----------
const createRegimentV04 = createRegiment;
createRegiment = function createRegimentV05(side, candidateUnits, name = null) {
  const reg = createRegimentV04(side, candidateUnits, name);
  if (reg) {
    reg.facing = side === 'france' ? 0 : Math.PI;
    reg.targetFacing = reg.facing;
  }
  return reg;
};

arrangeRegiment = function arrangeRegimentV05(reg, x, y, mode = reg.formation || 'line') {
  if (!reg || reg.destroyed) return;
  if (typeof reg.facing !== 'number') reg.facing = reg.side === 'france' ? 0 : Math.PI;
  reg.formation = mode;
  reg.targetX = x;
  reg.targetY = y;
  const offsets = regimentRoleOffsets(reg, mode);
  const cos = Math.cos(reg.facing), sin = Math.sin(reg.facing);
  for (const u of regimentMembers(reg)) {
    const o = offsets.get(u.id) || { ox: 0, oy: 0 };
    const rx = o.ox * cos - o.oy * sin;
    const ry = o.ox * sin + o.oy * cos;
    u.task = null;
    u.resourceTarget = null;
    u.targetX = Math.max(20, Math.min(WORLD.width - 20, x + rx));
    u.targetY = Math.max(20, Math.min(WORLD.height - 20, y + ry));
    u.formationFacing = reg.facing;
    if (u.type !== 'artillery') u.facing = reg.facing;
  }
};

function rotateSelectedRegiments(delta) {
  const regs = selectedRegiments();
  if (!regs.length) {
    statusEl.textContent = 'Selecteer eerst een regiment om te richten.';
    return;
  }
  for (const reg of regs) {
    const c = centroid(regimentMembers(reg));
    reg.facing = Math.atan2(Math.sin((reg.facing || 0) + delta), Math.cos((reg.facing || 0) + delta));
    reg.targetFacing = reg.facing;
    arrangeRegiment(reg, c.x, c.y, reg.formation);
  }
  const degrees = Math.round((regs[0].facing * 180 / Math.PI + 360) % 360);
  statusEl.textContent = `${regs.length} regiment${regs.length > 1 ? 'en' : ''} gericht op ${degrees}°.`;
  actionSignature = '';
  updateHud(true);
}

issueMove = function issueMoveV05(x, y) {
  const regs = selectedRegiments();
  const regimentMemberIds = new Set();
  regs.forEach(r => regimentMembers(r).forEach(u => regimentMemberIds.add(u.id)));

  if (regs.length) {
    const spacing = 125;
    regs.forEach((reg, i) => {
      const c = centroid(regimentMembers(reg));
      const targetY = y + (i - (regs.length - 1) / 2) * spacing;
      const dx = x - c.x, dy = targetY - c.y;
      if (Math.hypot(dx, dy) > 20) reg.facing = Math.atan2(dy, dx);
      reg.targetFacing = reg.facing;
      arrangeRegiment(reg, x, targetY, reg.formation);
    });
  }

  const loose = [...selectedUnits].filter(u => !u.dead && !u.routing && !regimentMemberIds.has(u.id));
  if (loose.length) commandLooseFormation(loose, x, y, currentFormation);
  if (regs.length || loose.length) {
    statusEl.textContent = regs.length
      ? `${regs.length} regiment${regs.length > 1 ? 'en' : ''} marcheert met gericht front.`
      : `${loose.length} losse eenheden verplaatsen.`;
  }
};

// ---------- Dynamic actions ----------
const renderDynamicActionsV04 = renderDynamicActions;
renderDynamicActions = function renderDynamicActionsV05(force = false) {
  renderDynamicActionsV04(force);

  const add = (action, html) => {
    if (actionsEl.querySelector(`[data-action="${action}"]`)) return;
    const b = makeDynamicButton(action, html);
    actionsEl.prepend(b);
  };

  if (selectedBuilding?.complete && selectedBuilding.side === 'france') {
    if (selectedBuilding.type === 'stable') add('train-cavalry', 'Cavalerie<br><small>150 🍞 · 50 🪵</small>');
    if (selectedBuilding.type === 'foundry') add('train-artillery', 'Artillerie<br><small>120 🍞 · 100 🪵</small>');
  }

  if (selectedRegiments().length) {
    add('rotate-right', '↻ 15°<br><small>richt rechts</small>');
    add('rotate-left', '↺ 15°<br><small>richt links</small>');
  }
};

// v0.5 actions are handled in addition to the v0.4 delegated listener.
actionsEl.addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn || btn.disabled) return;
  const action = btn.dataset.action;
  if (action === 'build-stable') startBuild('stable');
  else if (action === 'build-foundry') startBuild('foundry');
  else if (action === 'train-cavalry') queuePlayerUnit('cavalry');
  else if (action === 'train-artillery') queuePlayerUnit('artillery');
  else if (action === 'rotate-left') rotateSelectedRegiments(-Math.PI / 12);
  else if (action === 'rotate-right') rotateSelectedRegiments(Math.PI / 12);
});

addEventListener('keydown', e => {
  if (e.key.toLowerCase() === 'q') rotateSelectedRegiments(-Math.PI / 12);
  if (e.key.toLowerCase() === 'e') rotateSelectedRegiments(Math.PI / 12);
});

// ---------- Building placement ----------
const findBuildLocationV04 = findBuildLocation;
findBuildLocation = function findBuildLocationV05(side, type, index = 0) {
  const tc = livingBuildings(side).find(b => b.type === 'towncenter');
  if (!tc) return null;
  const dir = sideDir(side);
  const layouts = {
    barracks: [[dir * 180, 140], [dir * 245, -165], [dir * 315, 205]],
    house: [[dir * 120, -150], [dir * 160, 190], [dir * 230, -230], [dir * 270, 270]],
    stable: [[dir * 305, -300], [dir * 360, 300], [dir * 420, -190]],
    foundry: [[dir * 385, 185], [dir * 450, -350], [dir * 500, 330]]
  };
  const list = layouts[type];
  if (!list) return findBuildLocationV04(side, type, index);
  const off = list[index % list.length];
  return { x: tc.x + off[0], y: tc.y + off[1] };
};

// ---------- British strategic development ----------
const aiDevelopV04 = aiDevelop;
aiDevelop = function aiDevelopV05() {
  if (gameOver) return;
  const e = economies.britain;
  const regs = activeRegiments('britain');
  const stable = livingBuildings('britain').filter(b => b.type === 'stable');
  const foundry = livingBuildings('britain').filter(b => b.type === 'foundry');
  const completeStable = stable.find(b => b.complete);
  const completeFoundry = foundry.find(b => b.complete);

  // Expansion buildings are finished sequentially so builders cannot abandon one project for the next.
  if (stable.some(b => !b.complete)) {
    aiPlan = 'Stable afbouwen';
    return;
  }
  if (foundry.some(b => !b.complete)) {
    aiPlan = 'Artillery Foundry afbouwen';
    return;
  }

  if (regs.length >= 1 && !stable.length && e.wood >= BUILDINGS.stable.cost.wood) {
    if (aiBuild('stable')) return;
  }
  if (regs.length >= 1 && completeStable && !foundry.length && e.wood >= BUILDINGS.foundry.cost.wood) {
    if (aiBuild('foundry')) return;
  }

  const cavalry = livingUnits('britain').filter(u => u.type === 'cavalry').length;
  const artillery = livingUnits('britain').filter(u => u.type === 'artillery').length;

  if (completeStable && cavalry < Math.max(5, regs.length * 3) && canAfford('britain', TRAINING.cavalry.cost)) {
    if (aiQueue('cavalry', 'stable')) return;
  }
  if (completeFoundry && artillery < Math.max(3, regs.length * 2) && canAfford('britain', TRAINING.artillery.cost)) {
    if (aiQueue('artillery', 'foundry')) return;
  }

  aiDevelopV04();
};

let v05PeaceMode = false;
const aiMilitaryOrderV04 = aiMilitaryOrder;
aiMilitaryOrder = function aiMilitaryOrderV05() {
  if (v05PeaceMode) return;
  aiMilitaryOrderV04();
};

// ---------- Visibility-aware rendering ----------
const drawUnitV04 = drawUnit;
drawUnit = function drawUnitV05(u) {
  if (u.side === 'britain' && !isVisibleToFrance(u)) return;
  drawUnitV04(u);
};

const drawBuildingV04 = drawBuilding;
drawBuilding = function drawBuildingV05(b) {
  if (b.side === 'britain' && !isVisibleToFrance(b)) return;
  drawBuildingV04(b);
};

drawRegimentMarkers = function drawRegimentMarkersV05() {
  for (const reg of regiments) {
    if (reg.destroyed) continue;
    const members = regimentMembers(reg);
    if (!members.length) continue;
    const c = centroid(members);
    if (reg.side === 'britain' && !isVisibleToFrance({ side: 'britain', x: c.x, y: c.y })) continue;
    ctx.fillStyle = 'rgba(20,20,15,.72)';
    ctx.fillRect(c.x - 57, c.y - 42, 114, 17);
    ctx.fillStyle = COLORS.regiment;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    const deg = Math.round((((reg.facing || 0) * 180 / Math.PI) + 360) % 360);
    ctx.fillText(`${reg.side === 'france' ? '🇫🇷' : '🇬🇧'} R${reg.id} · ${formationLabel(reg.formation)} · ${deg}°`, c.x, c.y - 29);
  }
  ctx.textAlign = 'start';
};

const updateV04 = update;
update = function updateV05(dt) {
  rebuildSpatialHash();
  updateV04(dt);
  resolveUnitOverlaps();
};

const drawV04 = draw;
draw = function drawV05() {
  drawV04();
  drawFogOverlay();
  drawMinimap();
};

const resetGameV04 = resetGame;
resetGame = function resetGameV05() {
  resetGameV04();
  ensureV05BuildButtons();
  statusEl.textContent = 'v0.5: bouw regimenten, Stable/Foundry en gebruik Q/E om het front te richten.';
};
