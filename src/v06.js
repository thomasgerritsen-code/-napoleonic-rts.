'use strict';
// ---------- Napoleonic RTS v0.6 systems ----------

document.title = 'Napoleonic RTS v0.6';
const v06VersionBadge = document.querySelector('.version');
if (v06VersionBadge) v06VersionBadge.textContent = 'v0.6';

WORLD.width = 3800;
WORLD.height = 2200;

const PRODUCTION_BUILDINGS_V06 = new Set(['towncenter', 'barracks', 'stable', 'foundry']);
const GROUP_BREAK_MORALE = 32;
const CAVALRY_BREAK_MORALE = 28;
const PATH_CELL = 120;
const EXPLORE_CELL = 90;
const exploredCells = new Set();
let exploreClockV06 = 0;
let rallyPlacementBuilding = null;
let suppressContextMenuUntil = 0;
let rightDragV06 = null;
let aiStrategyV06 = 'balanced';

const TERRAIN_WOODS = [
  { x: 250, y: 390, w: 720, h: 430 },
  { x: 1320, y: 250, w: 540, h: 430 },
  { x: 2350, y: 360, w: 720, h: 440 },
  { x: 2350, y: 1190, w: 760, h: 430 },
  { x: 3150, y: 1480, w: 500, h: 420 }
];
const TERRAIN_HILLS = [
  { x: 1540, y: 1160, rx: 340, ry: 230 },
  { x: 2150, y: 520, rx: 300, ry: 200 },
  { x: 3260, y: 980, rx: 260, ry: 190 }
];
function pointInRectV06(x, y, r) { return x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h; }
function pointInEllipseV06(x, y, e) { const dx = (x - e.x) / e.rx, dy = (y - e.y) / e.ry; return dx * dx + dy * dy <= 1; }
function terrainAtV06(x, y) {
  if (y >= 835 && y <= 965) return 'road';
  if (TERRAIN_HILLS.some(h => pointInEllipseV06(x, y, h))) return 'hill';
  if (TERRAIN_WOODS.some(w => pointInRectV06(x, y, w))) return 'woods';
  return 'open';
}
function terrainSpeedMultiplierV06(u) {
  const terrain = terrainAtV06(u.x, u.y);
  if (terrain === 'road') return 1.18;
  if (terrain === 'woods') {
    if (u.type === 'cavalry') return 0.66;
    if (u.type === 'artillery') return 0.70;
    if (u.type === 'worker') return 0.94;
    return 0.88;
  }
  if (terrain === 'hill') return u.type === 'artillery' ? 0.80 : 0.90;
  return 1;
}
const drawTerrainV05ForV06 = drawTerrain;
drawTerrain = function drawTerrainV06() {
  drawTerrainV05ForV06();
  ctx.save();
  for (const w of TERRAIN_WOODS) { ctx.fillStyle = 'rgba(37,67,38,.18)'; ctx.fillRect(w.x, w.y, w.w, w.h); }
  for (const h of TERRAIN_HILLS) {
    ctx.fillStyle = 'rgba(171,151,101,.17)'; ctx.beginPath(); ctx.ellipse(h.x, h.y, h.rx, h.ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(210,193,143,.24)'; ctx.lineWidth = 8; ctx.beginPath(); ctx.ellipse(h.x, h.y, h.rx * .72, h.ry * .72, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
};

const activeRegimentsV05ForV06 = activeRegiments;
activeRegiments = function activeRegimentsV06(side) {
  return regiments.filter(r => !r.destroyed && r.side === side && r.kind !== 'artillery' && regimentMembers(r).length);
};
function activeGroupsV06(side) { return regiments.filter(r => !r.destroyed && r.side === side && regimentMembers(r).length); }
function groupKindV06(reg) { return reg?.kind || 'infantry'; }
function artilleryForGroupV06(reg) { return regimentMembers(reg).find(u => u.type === 'artillery') || null; }
function artilleryCrewV06(reg) {
  if (!reg || groupKindV06(reg) !== 'artillery') return [];
  const ids = new Set(reg.crewIds || []);
  return regimentMembers(reg).filter(u => ids.has(u.id) && u.type === 'infantry');
}
function canArtilleryOperateV06(artillery) {
  if (!artillery || artillery.dead || artillery.type !== 'artillery' || !artillery.regimentId) return false;
  const reg = getRegiment(artillery.regimentId);
  return !!reg && groupKindV06(reg) === 'artillery' && artilleryCrewV06(reg).length >= 2;
}

const createRegimentV05ForV06 = createRegiment;
createRegiment = function createRegimentV06(side, candidateUnits, name = null) {
  const reg = createRegimentV05ForV06(side, candidateUnits, name);
  if (reg) { reg.kind = 'infantry'; reg.initialStrength = reg.memberIds.length; reg.brokenReason = null; }
  return reg;
};
function createCavalryRegimentV06(side, candidateUnits, name = null) {
  const free = candidateUnits.filter(u => !u.dead && u.side === side && !u.routing && !u.regimentId);
  const cavalry = free.filter(u => u.type === 'cavalry').slice(0, 12);
  const officer = free.find(u => u.type === 'officer');
  if (cavalry.length < 4 || !officer) return null;
  const members = [...cavalry, officer], id = nextRegimentId++;
  const reg = { id, side, kind: 'cavalry', name: name || `${side === 'france' ? 'Frans' : 'Brits'} Cavalerie Regiment ${id}`, memberIds: members.map(u => u.id), officerId: officer.id, drummerId: null, formation: 'line', morale: 100, destroyed: false, brokenReason: null, targetX: centroid(members).x, targetY: centroid(members).y, facing: side === 'france' ? 0 : Math.PI, targetFacing: side === 'france' ? 0 : Math.PI, formedAt: elapsed, initialStrength: members.length, formedInfantryCount: 0 };
  members.forEach(u => { u.regimentId = id; u.morale = Math.max(u.morale, 90); });
  regiments.push(reg); arrangeRegiment(reg, reg.targetX, reg.targetY, 'line'); return reg;
}
function createArtilleryBatteryV06(side, artillery, crewCandidates, name = null) {
  if (!artillery || artillery.dead || artillery.side !== side || artillery.type !== 'artillery' || artillery.regimentId) return null;
  const crew = crewCandidates.filter(u => !u.dead && u.side === side && u.type === 'infantry' && !u.routing && !u.regimentId).slice(0, 2);
  if (crew.length < 2) return null;
  const id = nextRegimentId++, members = [artillery, ...crew];
  const reg = { id, side, kind: 'artillery', name: name || `${side === 'france' ? 'Franse' : 'Britse'} Artilleriebatterij ${id}`, memberIds: members.map(u => u.id), crewIds: crew.map(u => u.id), officerId: null, drummerId: null, formation: 'line', morale: 100, destroyed: false, brokenReason: null, targetX: artillery.x, targetY: artillery.y, facing: artillery.facing, targetFacing: artillery.facing, formedAt: elapsed, initialStrength: 3, formedInfantryCount: 2 };
  members.forEach(u => { u.regimentId = id; u.morale = Math.max(u.morale, 85); });
  artillery.crewIds = [...reg.crewIds]; regiments.push(reg); arrangeRegiment(reg, artillery.x, artillery.y, 'line'); return reg;
}
function dissolveGroupV06(reg, reason, routeOnBreak = false) {
  if (!reg || reg.destroyed) return;
  const survivors = regimentMembers(reg); reg.destroyed = true; reg.brokenReason = reason; reg.brokenAt = elapsed;
  for (const u of survivors) {
    u.regimentId = null; u.formationFacing = null; if (u.type === 'artillery') u.crewIds = [];
    if (routeOnBreak) {
      u.morale = Math.max(5, u.morale - 10);
      if (u.morale < 38 && u.type !== 'worker' && u.type !== 'artillery') routeUnit(u);
      else { u.targetX = Math.max(30, Math.min(WORLD.width - 30, u.x + (Math.random() - .5) * 130)); u.targetY = Math.max(30, Math.min(WORLD.height - 30, u.y + (Math.random() - .5) * 130)); }
    }
  }
  if (selectedUnits.size && survivors.some(u => selectedUnits.has(u))) actionSignature = '';
}
refreshRegiment = function refreshRegimentV06(reg) {
  if (!reg || reg.destroyed) return;
  const members = regimentMembers(reg); if (!members.length) { reg.destroyed = true; reg.brokenReason = 'geen levende leden'; return; }
  reg.initialStrength = reg.initialStrength || reg.memberIds.length;
  const kind = groupKindV06(reg);
  if (kind === 'artillery') {
    const cannon = artilleryForGroupV06(reg), crew = artilleryCrewV06(reg);
    reg.morale = crew.length ? crew.reduce((s, u) => s + u.morale, 0) / crew.length : 0;
    if (!cannon || crew.length < 2) dissolveGroupV06(reg, !cannon ? 'kanon verloren' : 'onvoldoende kanonbemanning', false);
    return;
  }
  const officerAlive = reg.officerId ? members.some(u => u.id === reg.officerId) : true;
  const drummerAlive = kind === 'infantry' ? members.some(u => u.id === reg.drummerId) : true;
  const combat = members.filter(u => kind === 'cavalry' ? ['cavalry','officer'].includes(u.type) : ['infantry','officer','drummer'].includes(u.type));
  if (!combat.length) { dissolveGroupV06(reg, 'geen gevechtseenheden', false); return; }
  const average = combat.reduce((s, u) => s + u.morale, 0) / combat.length;
  reg.morale = Math.max(0, Math.min(100, average + (officerAlive ? 5 : -20) + (kind === 'infantry' ? (drummerAlive ? 5 : -8) : 0)));
  if (reg.officerId && !officerAlive && !reg.officerLost) { reg.officerLost = true; combat.forEach(u => { u.morale = Math.max(0, u.morale - 25); }); }
  if (kind === 'infantry' && reg.drummerId && !drummerAlive && !reg.drummerLost) { reg.drummerLost = true; combat.forEach(u => { u.morale = Math.max(0, u.morale - 10); }); }
  const breakMorale = kind === 'cavalry' ? CAVALRY_BREAK_MORALE : GROUP_BREAK_MORALE;
  if (reg.morale < breakMorale) dissolveGroupV06(reg, `moraal gebroken (${Math.round(reg.morale)}%)`, true);
  else if (combat.length <= reg.initialStrength / 3) dissolveGroupV06(reg, `nog ${combat.length}/${reg.initialStrength} over`, true);
};

arrangeRegiment = function arrangeRegimentV06(reg, x, y, mode = reg.formation || 'line') {
  if (!reg || reg.destroyed) return;
  if (typeof reg.facing !== 'number') reg.facing = reg.side === 'france' ? 0 : Math.PI;
  const kind = groupKindV06(reg);
  reg.formation = kind === 'artillery' ? 'line' : (kind === 'cavalry' && mode === 'square' ? 'line' : mode);
  reg.targetX = x; reg.targetY = y;
  const members = regimentMembers(reg), offsets = new Map();
  if (kind === 'artillery') {
    const cannon = members.find(u => u.type === 'artillery'), crew = artilleryCrewV06(reg);
    if (cannon) offsets.set(cannon.id, { ox: 0, oy: 0 });
    if (crew[0]) offsets.set(crew[0].id, { ox: -14, oy: 24 });
    if (crew[1]) offsets.set(crew[1].id, { ox: 14, oy: 24 });
  } else if (kind === 'cavalry') {
    const cavalry = members.filter(u => u.type === 'cavalry'), officer = members.find(u => u.id === reg.officerId);
    const cols = reg.formation === 'column' ? Math.min(3, cavalry.length) : Math.min(8, cavalry.length), rows = Math.max(1, Math.ceil(cavalry.length / cols));
    cavalry.forEach((u, i) => { const col = i % cols, row = Math.floor(i / cols); offsets.set(u.id, { ox: (col - (cols - 1) / 2) * 27, oy: (row - (rows - 1) / 2) * 30 }); });
    if (officer) offsets.set(officer.id, { ox: 0, oy: -rows * 16 - 25 });
  } else {
    for (const [id, off] of regimentRoleOffsets(reg, reg.formation).entries()) offsets.set(id, off);
  }
  const cos = Math.cos(reg.facing), sin = Math.sin(reg.facing);
  for (const u of members) {
    const o = offsets.get(u.id) || { ox: 0, oy: 0 }, rx = o.ox * cos - o.oy * sin, ry = o.ox * sin + o.oy * cos;
    u.task = null; u.resourceTarget = null; u.targetX = Math.max(20, Math.min(WORLD.width - 20, x + rx)); u.targetY = Math.max(20, Math.min(WORLD.height - 20, y + ry)); u.formationFacing = reg.facing; u.arrivedAtTarget = false; if (u.type !== 'artillery') u.facing = reg.facing;
  }
};
function cavalryEligibilityV06(group) {
  const free = group.filter(u => !u.dead && !u.routing && !u.regimentId), cavalry = free.filter(u => u.type === 'cavalry').length, officers = free.filter(u => u.type === 'officer').length;
  return { cavalry, officers, canCreate: cavalry >= 4 && officers >= 1 };
}
function artilleryBatteryEligibilityV06(group) {
  const free = group.filter(u => !u.dead && !u.routing && !u.regimentId), cannons = free.filter(u => u.type === 'artillery').length, crew = free.filter(u => u.type === 'infantry').length;
  return { cannons, crew, canCreate: cannons >= 1 && crew >= 2 };
}
function makePlayerCavalryRegimentV06() {
  const group = [...selectedUnits], e = cavalryEligibilityV06(group);
  if (!e.canCreate) { statusEl.textContent = `Cavalerie-regiment vereist 4 cavaleristen + 1 officier (nu ${e.cavalry}/${e.officers}).`; return; }
  const reg = createCavalryRegimentV06('france', group); if (!reg) return; selectWholeRegiment(reg); actionSignature = ''; updateHud(true); statusEl.textContent = `${reg.name} gevormd.`;
}
function makePlayerArtilleryBatteryV06() {
  const group = [...selectedUnits].filter(u => !u.dead && !u.routing && !u.regimentId), artillery = group.find(u => u.type === 'artillery'), crew = group.filter(u => u.type === 'infantry');
  if (!artillery || crew.length < 2) { statusEl.textContent = 'Selecteer 1 kanon + 2 vrije musketiers als bemanning.'; return; }
  const reg = createArtilleryBatteryV06('france', artillery, crew); if (!reg) return; selectWholeRegiment(reg); actionSignature = ''; updateHud(true); statusEl.textContent = `${reg.name} gevormd: 2 musketiers bedienen het kanon.`;
}

function pathCellV06(x, y) { return { x: Math.max(0, Math.min(Math.ceil(WORLD.width / PATH_CELL) - 1, Math.floor(x / PATH_CELL))), y: Math.max(0, Math.min(Math.ceil(WORLD.height / PATH_CELL) - 1, Math.floor(y / PATH_CELL))) }; }
function pathKeyV06(c) { return `${c.x},${c.y}`; }
function pathCenterV06(c) { return { x: c.x * PATH_CELL + PATH_CELL / 2, y: c.y * PATH_CELL + PATH_CELL / 2 }; }
function pathBlockedV06(c) { const p = pathCenterV06(c); return buildings.some(b => !b.dead && Math.abs(p.x - b.x) < b.w / 2 + 80 && Math.abs(p.y - b.y) < b.h / 2 + 80); }
function heuristicV06(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function buildRegimentPathV06(start, goal) {
  const startCell = pathCellV06(start.x, start.y), goalCell = pathCellV06(goal.x, goal.y), open = new Map([[pathKeyV06(startCell), { cell: startCell, g: 0, f: heuristicV06(startCell, goalCell) }]]), came = new Map(), gScore = new Map([[pathKeyV06(startCell), 0]]), closed = new Set();
  const dirs = [-1,0,1].flatMap(dx => [-1,0,1].map(dy => [dx,dy])).filter(([dx,dy]) => dx || dy); let iterations = 0, found = null;
  while (open.size && iterations++ < 2400) {
    let currentKey = null, currentNode = null;
    for (const [k,n] of open) if (!currentNode || n.f < currentNode.f) { currentKey = k; currentNode = n; }
    open.delete(currentKey); if (currentNode.cell.x === goalCell.x && currentNode.cell.y === goalCell.y) { found = currentNode.cell; break; } closed.add(currentKey);
    for (const [dx,dy] of dirs) {
      const n = { x: currentNode.cell.x + dx, y: currentNode.cell.y + dy };
      if (n.x < 0 || n.y < 0 || n.x >= Math.ceil(WORLD.width / PATH_CELL) || n.y >= Math.ceil(WORLD.height / PATH_CELL)) continue;
      const nk = pathKeyV06(n); if (closed.has(nk) || (pathBlockedV06(n) && nk !== pathKeyV06(goalCell))) continue;
      const terrain = terrainAtV06(pathCenterV06(n).x, pathCenterV06(n).y), terrainCost = terrain === 'woods' ? 1.28 : terrain === 'hill' ? 1.12 : terrain === 'road' ? .83 : 1, tentative = currentNode.g + (dx && dy ? 1.414 : 1) * terrainCost;
      if (tentative >= (gScore.get(nk) ?? Infinity)) continue;
      came.set(nk, currentKey); gScore.set(nk, tentative); open.set(nk, { cell: n, g: tentative, f: tentative + heuristicV06(n, goalCell) });
    }
  }
  if (!found) return [goal];
  const cells = []; let k = pathKeyV06(found);
  while (k && k !== pathKeyV06(startCell)) { const [cx,cy] = k.split(',').map(Number); cells.push({ x: cx, y: cy }); k = came.get(k); }
  cells.reverse(); const points = cells.map(pathCenterV06); if (!points.length || Math.hypot(points[points.length - 1].x - goal.x, points[points.length - 1].y - goal.y) > 8) points.push({ x: goal.x, y: goal.y }); return points;
}
function setGroupWaypointV06(reg) {
  if (!reg?.path || reg.destroyed) return;
  if (reg.pathIndex >= reg.path.length) { if (typeof reg.finalFacing === 'number') reg.facing = reg.finalFacing; const final = reg.finalTarget || { x: reg.targetX, y: reg.targetY }; arrangeRegiment(reg, final.x, final.y, reg.formation); reg.path = null; return; }
  const waypoint = reg.path[reg.pathIndex], c = centroid(regimentMembers(reg)), dx = waypoint.x - c.x, dy = waypoint.y - c.y; if (Math.hypot(dx,dy) > 12) reg.facing = Math.atan2(dy,dx); arrangeRegiment(reg, waypoint.x, waypoint.y, reg.formation);
}
function orderGroupPathV06(reg, x, y, formation = reg.formation, finalFacing = null) {
  if (!reg || reg.destroyed) return; const c = centroid(regimentMembers(reg)); reg.formation = groupKindV06(reg) === 'cavalry' && formation === 'square' ? 'line' : formation; reg.path = buildRegimentPathV06(c,{x,y}); reg.pathIndex = 0; reg.finalTarget = {x,y}; reg.finalFacing = finalFacing; setGroupWaypointV06(reg);
}
function updateGroupPathsV06() {
  for (const reg of regiments) {
    if (reg.destroyed || !reg.path) continue; const waypoint = reg.path[reg.pathIndex]; if (!waypoint) { setGroupWaypointV06(reg); continue; }
    const c = centroid(regimentMembers(reg)); if (Math.hypot(c.x - waypoint.x, c.y - waypoint.y) < 62) { reg.pathIndex++; setGroupWaypointV06(reg); }
  }
}
issueMove = function issueMoveV06(x, y) { issueMoveWithFacingV06(x, y, null); };
function issueMoveWithFacingV06(x, y, finalFacing = null) {
  const groups = selectedRegiments(), groupedIds = new Set(); groups.forEach(r => regimentMembers(r).forEach(u => groupedIds.add(u.id)));
  groups.forEach((reg,i) => orderGroupPathV06(reg, x, y + (i - (groups.length - 1) / 2) * 130, reg.formation, finalFacing));
  const loose = [...selectedUnits].filter(u => !u.dead && !u.routing && !groupedIds.has(u.id)); if (loose.length) commandLooseFormation(loose, x, y, currentFormation);
  if (groups.length || loose.length) statusEl.textContent = finalFacing == null ? 'Troepen verplaatsen via nieuwe route.' : 'Groep marcheert en neemt het gekozen front in.';
}
canvas.addEventListener('mousedown', e => { if (e.button === 2 && !buildMode && !rallyPlacementBuilding) rightDragV06 = { sx:e.clientX, sy:e.clientY, ex:e.clientX, ey:e.clientY, moved:false }; }, true);
canvas.addEventListener('mousemove', e => { if (!rightDragV06) return; rightDragV06.ex=e.clientX; rightDragV06.ey=e.clientY; if (Math.hypot(rightDragV06.ex-rightDragV06.sx,rightDragV06.ey-rightDragV06.sy)>12) rightDragV06.moved=true; }, true);
canvas.addEventListener('mouseup', e => { if (e.button !== 2 || !rightDragV06) return; const d=rightDragV06; rightDragV06=null; if (!d.moved) return; e.preventDefault(); e.stopImmediatePropagation(); const destination=screenToWorld(d.sx,d.sy), facePoint=screenToWorld(d.ex,d.ey), angle=Math.atan2(facePoint.y-destination.y,facePoint.x-destination.x); issueMoveWithFacingV06(destination.x,destination.y,angle); suppressContextMenuUntil=performance.now()+700; }, true);
canvas.addEventListener('contextmenu', e => { if (performance.now() < suppressContextMenuUntil) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);

const moveTowardV05ForV06 = moveToward;
moveToward = function moveTowardV06(u, tx, ty, dt, speed = TYPES[u.type].speed) {
  if (u.type === 'artillery' && !canArtilleryOperateV06(u)) return false;
  const d = Math.hypot(tx-u.x,ty-u.y); if (d <= 5) { u.x=tx; u.y=ty; u.arrivedAtTarget=true; return true; }
  u.arrivedAtTarget=false; return moveTowardV05ForV06(u,tx,ty,dt,speed*terrainSpeedMultiplierV06(u));
};
resolveUnitOverlaps = function resolveUnitOverlapsV06() {
  const visited=new Set();
  for (const u of units) { if (u.dead) continue; for (const other of nearbyNavUnits(u)) { if (other.dead || other===u) continue; const pair=u.id<other.id?`${u.id}:${other.id}`:`${other.id}:${u.id}`; if (visited.has(pair)) continue; visited.add(pair); let dx=other.x-u.x,dy=other.y-u.y,d=Math.hypot(dx,dy); const minD=TYPES[u.type].radius+TYPES[other.type].radius+1.5; if (d>=minD) continue; const sameGroup=u.regimentId&&u.regimentId===other.regimentId; if (sameGroup && d>minD*.72) continue; if (d<.001) { const angle=((u.id*37+other.id*53)%360)*Math.PI/180; dx=Math.cos(angle);dy=Math.sin(angle);d=1; } const bothSettled=u.arrivedAtTarget&&other.arrivedAtTarget, correction=(minD-d)*(sameGroup?.08:bothSettled?.12:.34),nx=dx/d,ny=dy/d; u.x-=nx*correction;u.y-=ny*correction;other.x+=nx*correction;other.y+=ny*correction;navStats.overlapCorrections++; } }
};
const applyDamageV05ForV06 = applyDamage;
applyDamage = function applyDamageV06(victim, damage, shock = 8) { if (victim?.kind==='unit' && terrainAtV06(victim.x,victim.y)==='woods') { damage*=.86; shock*=.82; } applyDamageV05ForV06(victim,damage,shock); };
const fireV05ForV06 = fire;
fire = function fireV06(unit, enemy) { if (unit.type==='artillery' && !canArtilleryOperateV06(unit)) return; const original=TYPES[unit.type].damage; if (terrainAtV06(unit.x,unit.y)==='hill') TYPES[unit.type].damage=original*1.10; try { fireV05ForV06(unit,enemy); } finally { TYPES[unit.type].damage=original; } };

const assignWorkerToResourceV05ForV06 = assignWorkerToResource;
assignWorkerToResource = function assignWorkerToResourceV06(worker, resource) { if (worker&&resource) worker.preferredResourceType=resource.type; assignWorkerToResourceV05ForV06(worker,resource); };
const updateWorkerV05ForV06 = updateWorker;
updateWorker = function updateWorkerV06(u,dt) { const remembered=u.preferredResourceType||u.resourceTarget?.type||u.returnResource?.type||null; updateWorkerV05ForV06(u,dt); const wanted=u.preferredResourceType||remembered; if (!u.dead&&!u.task&&wanted) { const next=nearestResource(wanted,u.x,u.y); if (next) assignWorkerToResource(u,next); } };

const createBuildingV05ForV06 = createBuilding;
createBuilding = function createBuildingV06(side,type,x,y,complete=true) { const b=createBuildingV05ForV06(side,type,x,y,complete); b.rallyX=x+sideDir(side)*Math.max(120,b.w+55); b.rallyY=y; b.rallyRadius=78; b.spawnSerial=0; return b; };
function openSpawnPointV06(b) {
  const serial=b.spawnSerial++;
  for (let attempt=0;attempt<10;attempt++) { const angle=serial*2.399963+attempt*.72+(b.side==='france'?0:Math.PI),radius=Math.max(b.w,b.h)*.72+18+attempt*5,x=b.x+Math.cos(angle)*radius,y=b.y+Math.sin(angle)*radius,occupied=livingUnits(b.side).some(u=>Math.hypot(u.x-x,u.y-y)<TYPES[u.type].radius+12); if(!occupied)return{x,y}; }
  return {x:b.x+sideDir(b.side)*(b.w+35),y:b.y+(serial%5-2)*20};
}
function randomRallyPointV06(b) {
  const rx=Number.isFinite(b.rallyX)?b.rallyX:b.x+sideDir(b.side)*150,ry=Number.isFinite(b.rallyY)?b.rallyY:b.y;
  for(let attempt=0;attempt<16;attempt++){const angle=Math.random()*Math.PI*2,radius=22+Math.sqrt(Math.random())*(b.rallyRadius||78),x=Math.max(20,Math.min(WORLD.width-20,rx+Math.cos(angle)*radius)),y=Math.max(20,Math.min(WORLD.height-20,ry+Math.sin(angle)*radius)),occupied=livingUnits(b.side).some(u=>Math.hypot(u.targetX-x,u.targetY-y)<18);if(!occupied)return{x,y};}
  return{x:rx,y:ry};
}
updateBuildings = function updateBuildingsV06(dt) {
  for(const b of buildings){if(b.dead||!b.complete||!b.queue.length)continue;b.production+=dt/b.queue[0].time;if(b.production<1)continue;const item=b.queue[0];if(populationUsed(b.side)+TYPES[item.type].pop>economies[b.side].popCap){b.production=.99;continue;}b.queue.shift();b.production=0;const spawn=openSpawnPointV06(b),u=createUnit(b.side,item.type,spawn.x,spawn.y),rally=randomRallyPointV06(b);u.targetX=rally.x;u.targetY=rally.y;u.spawnSettling=4;u.arrivedAtTarget=false;if(b.side==='france')statusEl.textContent=`${TYPES[item.type].label} is klaar en gaat naar het verzamelpunt.`;else aiPlan=`${TYPES[item.type].label} getraind`;if(u.type==='worker'&&u.side==='britain')autoAssignAIWorkers();}
};
function startRallyPlacementV06(){if(!selectedBuilding||!selectedBuilding.complete||!PRODUCTION_BUILDINGS_V06.has(selectedBuilding.type)){statusEl.textContent='Selecteer eerst een productiegebouw.';return;}rallyPlacementBuilding=selectedBuilding;buildMode=null;buildHintEl.textContent='Klik op het terrein voor het verzamelpunt · Esc om te annuleren';buildHintEl.classList.remove('hidden');statusEl.textContent=`Kies verzamelpunt voor ${BUILDINGS[selectedBuilding.type].label}.`;}
canvas.addEventListener('mouseup',e=>{if(e.button!==0||!rallyPlacementBuilding)return;e.preventDefault();e.stopImmediatePropagation();drag.active=false;const w=screenToWorld(e.clientX,e.clientY);rallyPlacementBuilding.rallyX=Math.max(20,Math.min(WORLD.width-20,w.x));rallyPlacementBuilding.rallyY=Math.max(20,Math.min(WORLD.height-20,w.y));statusEl.textContent=`Verzamelpunt ingesteld voor ${BUILDINGS[rallyPlacementBuilding.type].label}.`;rallyPlacementBuilding=null;buildHintEl.classList.add('hidden');buildHintEl.textContent='Klik op het terrein om te bouwen · Esc om te annuleren';updateHud(true);},true);
addEventListener('keydown',e=>{if(e.key==='Escape'&&rallyPlacementBuilding){rallyPlacementBuilding=null;buildHintEl.classList.add('hidden');buildHintEl.textContent='Klik op het terrein om te bouwen · Esc om te annuleren';}},true);

const queuePanelV06=document.createElement('aside');queuePanelV06.id='productionQueuePanel';queuePanelV06.className='hud production-queue hidden';queuePanelV06.setAttribute('aria-label','Productiewachtrij');document.getElementById('app').appendChild(queuePanelV06);
function renderQueuePanelV06(){const b=selectedBuilding;if(!b||!b.complete||!PRODUCTION_BUILDINGS_V06.has(b.type)){queuePanelV06.classList.add('hidden');return;}queuePanelV06.classList.remove('hidden');const rally=`${Math.round(b.rallyX)}, ${Math.round(b.rallyY)}`,items=b.queue.map((q,i)=>`<li class="${i===0?'active':''}"><span>${i+1}. ${q.label}</span>${i===0?`<strong>${Math.floor(b.production*100)}%</strong>`:'<strong>wacht</strong>'}</li>`).join('');queuePanelV06.innerHTML=`<strong>${BUILDINGS[b.type].label} · wachtrij</strong><span class="rally-line">🚩 ${rally}</span><ol>${items||'<li class="empty">Geen productie</li>'}</ol>`;}
const renderDynamicActionsV05ForV06 = renderDynamicActions;
renderDynamicActions = function renderDynamicActionsV06(force=false){renderDynamicActionsV05ForV06(force);const add=(action,html,disabled=false)=>{if(actionsEl.querySelector(`[data-action="${action}"]`))return;actionsEl.prepend(makeDynamicButton(action,html,disabled));};if(selectedBuilding?.complete&&selectedBuilding.side==='france'&&PRODUCTION_BUILDINGS_V06.has(selectedBuilding.type))add('set-rally','🚩 Verzamelpunt<br><small>volgende klik</small>');const loose=[...selectedUnits].filter(u=>!u.dead&&!u.routing&&!u.regimentId),bat=artilleryBatteryEligibilityV06(loose);if(bat.cannons)add('create-battery',`Kanonbemanning<br><small>${bat.cannons} kanon · ${bat.crew}/2 musketiers</small>`,!bat.canCreate);const cav=cavalryEligibilityV06(loose);if(cav.cavalry)add('create-cavalry-regiment',`Cav. regiment<br><small>${cav.cavalry}/4 · O${cav.officers}</small>`,!cav.canCreate);};
selectionRegimentSummary = function selectionRegimentSummaryV06(){const regs=selectedRegiments();if(regs.length!==1)return regs.length>1?`${regs.length} groepen geselecteerd`:null;const reg=regs[0],members=regimentMembers(reg),kind=groupKindV06(reg);if(kind==='artillery')return`${reg.name} · kanon ${artilleryForGroupV06(reg)?'✓':'✗'} · bemanning ${artilleryCrewV06(reg).length}/2 · ${canArtilleryOperateV06(artilleryForGroupV06(reg))?'operationeel':'NIET operationeel'}`;if(kind==='cavalry'){const officerAlive=members.some(u=>u.id===reg.officerId);return`${reg.name} · ${members.filter(u=>u.type==='cavalry').length} cavaleristen · O:${officerAlive?'✓':'✗'} · morale ${Math.round(reg.morale)}%`;}const officerAlive=members.some(u=>u.id===reg.officerId),drummerAlive=members.some(u=>u.id===reg.drummerId);return`${reg.name} · ${members.filter(u=>u.type==='infantry').length} musketiers · O:${officerAlive?'✓':'✗'} D:${drummerAlive?'✓':'✗'} · morale ${Math.round(reg.morale)}%`;};
const updateHudV05ForV06=updateHud;
updateHud=function updateHudV06(forceActions=false){updateHudV05ForV06(forceActions);renderQueuePanelV06();if(aiPlanEl)aiPlanEl.textContent=`Plan: ${aiStrategyV06} · ${aiPlan}`;};
actionsEl.addEventListener('click',e=>{const btn=e.target.closest('button');if(!btn||btn.disabled)return;const action=btn.dataset.action;if(action==='set-rally')startRallyPlacementV06();else if(action==='create-battery')makePlayerArtilleryBatteryV06();else if(action==='create-cavalry-regiment')makePlayerCavalryRegimentV06();});

function uncrewedArtilleryV06(side){return livingUnits(side).filter(u=>u.type==='artillery'&&!canArtilleryOperateV06(u));}
function aiAutoCrewArtilleryV06(){for(const cannon of uncrewedArtilleryV06('britain')){if(cannon.regimentId)continue;const crew=freeUnits('britain','infantry').slice(0,2);if(crew.length<2)return false;createArtilleryBatteryV06('britain',cannon,crew);aiPlan='kanonbemanning toegewezen';}return true;}
function aiTryCavalryRegimentV06(){const cav=freeUnits('britain','cavalry'),officer=freeUnits('britain','officer')[0];if(cav.length<4||!officer)return null;const reg=createCavalryRegimentV06('britain',[...cav.slice(0,8),officer]);if(reg)aiPlan=`${reg.name} gevormd`;return reg;}
const aiDevelopV05ForV06=aiDevelop;
aiDevelop=function aiDevelopV06(){if(gameOver)return;const waitingGuns=uncrewedArtilleryV06('britain').filter(u=>!u.regimentId);if(waitingGuns.length&&freeUnits('britain','infantry').length<2){const barracks=livingBuildings('britain').find(b=>b.type==='barracks'&&b.complete);if(barracks&&aiQueue('infantry','barracks')){aiPlan='kanonbemanning trainen';return;}}aiAutoCrewArtilleryV06();if(aiTryCavalryRegimentV06())return;if(aiStrategyV06==='defensive'&&populationUsed('britain')>=economies.britain.popCap-8&&economies.britain.wood>=120){if(aiBuild('house'))return;}aiDevelopV05ForV06();aiAutoCrewArtilleryV06();aiTryCavalryRegimentV06();};
aiMilitaryOrder=function aiMilitaryOrderV06(){if(v05PeaceMode||gameOver)return;const infantryGroups=activeRegiments('britain').filter(r=>groupKindV06(r)==='infantry'),cavalryGroups=activeRegiments('britain').filter(r=>groupKindV06(r)==='cavalry'),batteries=activeGroupsV06('britain').filter(r=>groupKindV06(r)==='artillery');if(!infantryGroups.length&&!cavalryGroups.length)return;const frenchTargets=livingUnits('france').filter(u=>u.type!=='worker'&&!u.routing),frenchTC=livingBuildings('france').find(b=>b.type==='towncenter'),target=frenchTargets.length?centroid(frenchTargets):frenchTC?{x:frenchTC.x,y:frenchTC.y}:{x:650,y:900},threshold=aiStrategyV06==='aggressive'?35:aiStrategyV06==='defensive'?85:55,needed=aiStrategyV06==='aggressive'?1:aiStrategyV06==='defensive'?3:2,attackReady=elapsed>threshold||infantryGroups.length+cavalryGroups.length>=needed,tc=livingBuildings('britain').find(b=>b.type==='towncenter');if(!attackReady&&tc){infantryGroups.forEach((reg,i)=>orderGroupPathV06(reg,tc.x-260,tc.y+(i-(infantryGroups.length-1)/2)*125,'line',Math.PI));cavalryGroups.forEach((reg,i)=>orderGroupPathV06(reg,tc.x-170,tc.y-210-i*70,'column',Math.PI));batteries.forEach((reg,i)=>orderGroupPathV06(reg,tc.x+80,tc.y+180+i*75,'line',Math.PI));aiPlan=`${aiStrategyV06}: basis verdedigen`;return;}infantryGroups.forEach((reg,i)=>orderGroupPathV06(reg,target.x+150+i*45,target.y+(i-(infantryGroups.length-1)/2)*125,i%2?'column':'line',Math.PI));cavalryGroups.forEach((reg,i)=>{regimentMembers(reg).filter(u=>u.type==='cavalry').forEach(u=>u.chargeTimer=7);orderGroupPathV06(reg,target.x+40,target.y-190-i*90,'column',Math.PI);});batteries.forEach((reg,i)=>orderGroupPathV06(reg,target.x+410,target.y+150+i*85,'line',Math.PI));aiPlan=`${aiStrategyV06}: gecombineerde aanval`;};

function exploreKeyV06(x,y){return`${Math.floor(x/EXPLORE_CELL)},${Math.floor(y/EXPLORE_CELL)}`;}
function markExploredV06(){for(const source of frenchVisionSources()){const r=visionRadius(source),minX=Math.floor((source.x-r)/EXPLORE_CELL),maxX=Math.floor((source.x+r)/EXPLORE_CELL),minY=Math.floor((source.y-r)/EXPLORE_CELL),maxY=Math.floor((source.y+r)/EXPLORE_CELL);for(let gx=minX;gx<=maxX;gx++)for(let gy=minY;gy<=maxY;gy++){const cx=gx*EXPLORE_CELL+EXPLORE_CELL/2,cy=gy*EXPLORE_CELL+EXPLORE_CELL/2;if(cx>=0&&cy>=0&&cx<=WORLD.width&&cy<=WORLD.height&&Math.hypot(cx-source.x,cy-source.y)<=r+EXPLORE_CELL)exploredCells.add(`${gx},${gy}`);}}}
function isExploredV06(x,y){return exploredCells.has(exploreKeyV06(x,y));}
drawFogOverlay=function drawFogOverlayV06(){resizeFogCanvas();fogCtx.clearRect(0,0,fogCanvas.width,fogCanvas.height);fogCtx.fillStyle='rgba(4,7,9,.93)';fogCtx.fillRect(0,0,fogCanvas.width,fogCanvas.height);fogCtx.globalCompositeOperation='destination-out';fogCtx.globalAlpha=.52;for(const key of exploredCells){const[gx,gy]=key.split(',').map(Number),a=worldToScreen(gx*EXPLORE_CELL,gy*EXPLORE_CELL),size=EXPLORE_CELL*camera.zoom+2;if(a.x+size<0||a.y+size<0||a.x>innerWidth||a.y>innerHeight)continue;fogCtx.fillStyle='#000';fogCtx.fillRect(a.x,a.y,size,size);}fogCtx.globalAlpha=1;for(const source of frenchVisionSources()){const p=worldToScreen(source.x,source.y),radius=visionRadius(source)*camera.zoom,gradient=fogCtx.createRadialGradient(p.x,p.y,radius*.58,p.x,p.y,radius);gradient.addColorStop(0,'rgba(0,0,0,1)');gradient.addColorStop(.8,'rgba(0,0,0,.94)');gradient.addColorStop(1,'rgba(0,0,0,0)');fogCtx.fillStyle=gradient;fogCtx.beginPath();fogCtx.arc(p.x,p.y,radius,0,Math.PI*2);fogCtx.fill();}fogCtx.globalCompositeOperation='source-over';ctx.drawImage(fogCanvas,0,0);};
drawMinimap=function drawMinimapV06(){miniCtx.clearRect(0,0,minimap.width,minimap.height);miniCtx.fillStyle='#171d19';miniCtx.fillRect(0,0,minimap.width,minimap.height);for(const key of exploredCells){const[gx,gy]=key.split(',').map(Number),x=gx*EXPLORE_CELL/WORLD.width*minimap.width,y=gy*EXPLORE_CELL/WORLD.height*minimap.height,w=EXPLORE_CELL/WORLD.width*minimap.width+1,h=EXPLORE_CELL/WORLD.height*minimap.height+1;miniCtx.fillStyle='#566947';miniCtx.fillRect(x,y,w,h);}for(const r of resources){if(r.dead||!isExploredV06(r.x,r.y))continue;const p=miniPoint(r.x,r.y);miniCtx.fillStyle=r.type==='wood'?'#29452c':'#9a793e';miniCtx.fillRect(p.x-1,p.y-1,2,2);}for(const b of buildings){if(b.dead||(b.side==='britain'&&!isVisibleToFrance(b)))continue;const p=miniPoint(b.x,b.y);miniCtx.fillStyle=b.side==='france'?'#4e7ed0':'#cf514a';miniCtx.fillRect(p.x-3,p.y-3,6,6);}for(const u of units){if(u.dead||(u.side==='britain'&&!isVisibleToFrance(u)))continue;const p=miniPoint(u.x,u.y);miniCtx.fillStyle=u.side==='france'?'#9bbaf0':'#ef8d85';miniCtx.fillRect(p.x-1,p.y-1,2.5,2.5);}const viewW=innerWidth/camera.zoom/WORLD.width*minimap.width,viewH=innerHeight/camera.zoom/WORLD.height*minimap.height,c=miniPoint(camera.x,camera.y);miniCtx.strokeStyle='#f3df83';miniCtx.lineWidth=1.4;miniCtx.strokeRect(c.x-viewW/2,c.y-viewH/2,viewW,viewH);};

const drawUnitV05ForV06=drawUnit;
drawUnit=function drawUnitV06(u){if(u.side==='britain'&&!isVisibleToFrance(u))return;drawUnitV05ForV06(u);if(u.type==='artillery'&&!u.dead){const crewCount=u.regimentId?artilleryCrewV06(getRegiment(u.regimentId)).length:0;ctx.save();ctx.fillStyle=crewCount>=2?'#b8d788':'#f0a36d';ctx.font='9px sans-serif';ctx.textAlign='center';ctx.fillText(`${crewCount}/2`,u.x,u.y-18);ctx.restore();}};
drawRegimentMarkers=function drawRegimentMarkersV06(){for(const reg of regiments){if(reg.destroyed)continue;const members=regimentMembers(reg);if(!members.length)continue;const c=centroid(members);if(reg.side==='britain'&&!isVisibleToFrance({side:'britain',x:c.x,y:c.y}))continue;const kind=groupKindV06(reg);ctx.fillStyle='rgba(20,20,15,.72)';ctx.fillRect(c.x-65,c.y-42,130,17);ctx.fillStyle=COLORS.regiment;ctx.font='11px sans-serif';ctx.textAlign='center';const deg=Math.round((((reg.facing||0)*180/Math.PI)+360)%360),tag=kind==='artillery'?'KANON':kind==='cavalry'?'CAV':'REG';ctx.fillText(`${reg.side==='france'?'🇫🇷':'🇬🇧'} ${tag} ${reg.id} · ${Math.round(reg.morale)}% · ${deg}°`,c.x,c.y-29);}ctx.textAlign='start';};
function drawRallyMarkersV06(){for(const b of buildings){if(b.dead||b.side!=='france'||!b.complete||!PRODUCTION_BUILDINGS_V06.has(b.type))continue;const p=worldToScreen(b.rallyX,b.rallyY);ctx.save();ctx.strokeStyle='rgba(245,220,112,.9)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(p.x,p.y+11);ctx.lineTo(p.x,p.y-12);ctx.stroke();ctx.fillStyle='#d7bd61';ctx.beginPath();ctx.moveTo(p.x,p.y-12);ctx.lineTo(p.x+14,p.y-7);ctx.lineTo(p.x,p.y-2);ctx.closePath();ctx.fill();ctx.restore();}}
const updateV05ForV06=update;
update=function updateV06(dt){updateGroupPathsV06();updateV05ForV06(dt);exploreClockV06+=dt;if(exploreClockV06>=.35){exploreClockV06=0;markExploredV06();}};
const drawV05ForV06=draw;
draw=function drawV06(){drawV05ForV06();drawRallyMarkersV06();};

const resetGameV05ForV06=resetGame;
resetGame=function resetGameV06(){exploredCells.clear();exploreClockV06=0;rallyPlacementBuilding=null;resetGameV05ForV06();for(const u of livingUnits('britain')){u.x+=420;u.targetX+=420;u.task=null;u.resourceTarget=null;u.returnResource=null;}for(const b of livingBuildings('britain')){b.x+=420;b.rallyX+=420;}for(let i=0;i<4;i++)createUnit('france','infantry',650+i*22,1280);const britishCrew=[createUnit('britain','infantry',3010,1270),createUnit('britain','infantry',3035,1270)],britishGun=livingUnits('britain').find(u=>u.type==='artillery'&&!u.regimentId);if(britishGun)createArtilleryBatteryV06('britain',britishGun,britishCrew,'Britse Startbatterij');[['wood',3340,520,18],['food',3420,780,9],['wood',3220,1720,16],['food',2860,1820,8]].forEach(([type,cx,cy,count])=>{for(let i=0;i<count;i++)createResource(type,cx+(Math.random()-.5)*190,cy+(Math.random()-.5)*150,type==='wood'?240:380);});const roll=Math.random();aiStrategyV06=roll<.34?'aggressive':roll<.67?'balanced':'defensive';autoAssignAIWorkers();recalcPopCap('france');recalcPopCap('britain');markExploredV06();actionSignature='';updateHud(true);statusEl.textContent='v0.6: kies rallypoints, vorm regimenten/cavalerie en wijs 2 musketiers toe aan ieder kanon.';};
