(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const foodEl = document.getElementById('food');
  const woodEl = document.getElementById('wood');
  const populationEl = document.getElementById('population');
  const frenchCountEl = document.getElementById('frenchCount');
  const britishCountEl = document.getElementById('britishCount');
  const statusEl = document.getElementById('status');
  const selectionTitleEl = document.getElementById('selectionTitle');
  const selectionDetailsEl = document.getElementById('selectionDetails');
  const actionsEl = document.getElementById('actions');
  const messageEl = document.getElementById('message');
  const buildHintEl = document.getElementById('buildHint');

  const WORLD = { width: 2800, height: 1700 };
  const camera = { x: 650, y: 820, zoom: 0.76 };
  const keys = new Set();
  const units = [];
  const buildings = [];
  const resources = [];
  const projectiles = [];
  const particles = [];
  const selectedUnits = new Set();
  const economy = { food: 1000, wood: 1000, popCap: 40 };

  let selectedBuilding = null;
  let nextId = 1;
  let lastTime = performance.now();
  let gameOver = false;
  let aiClock = 0;
  let buildMode = null;
  let currentFormation = 'line';
  let volleyClock = 0;
  let actionSignature = '';

  const drag = { active: false, startX: 0, startY: 0, x: 0, y: 0, moved: false };

  const TYPES = {
    worker: { radius: 7, speed: 70, hp: 65, range: 12, damage: 7, reload: 1.1, projectileSpeed: 0, pop: 1, label: 'Boer' },
    infantry: { radius: 6, speed: 56, hp: 100, range: 120, damage: 20, reload: 3.0, projectileSpeed: 410, pop: 1, label: 'Musketier' },
    cavalry: { radius: 9, speed: 96, hp: 155, range: 18, damage: 30, reload: 0.9, projectileSpeed: 0, pop: 2, label: 'Cavalerie' },
    artillery: { radius: 11, speed: 30, hp: 195, range: 300, damage: 82, reload: 5.0, projectileSpeed: 280, pop: 3, label: 'Artillerie' }
  };

  const BUILDINGS = {
    towncenter: { w: 92, h: 76, hp: 1200, label: 'Town Center', pop: 40 },
    barracks: { w: 80, h: 58, hp: 800, label: 'Barracks', cost: { wood: 300 } },
    house: { w: 54, h: 48, hp: 420, label: 'House', cost: { wood: 120 }, pop: 15 }
  };

  const COLORS = {
    grass: '#65784f', grid: 'rgba(255,255,255,.035)', france: '#244d9a', franceLight: '#a9c2f2',
    britain: '#a5322f', britainLight: '#f1aaa1', selected: '#f5dc70',
    smoke: 'rgba(232,227,211,.64)', tree: '#234b2b', tree2: '#38663c', food: '#b78d45'
  };

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.floor(innerWidth * dpr);
    canvas.height = Math.floor(innerHeight * dpr);
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener('resize', resize);
  resize();

  function createUnit(side, type, x, y) {
    const t = TYPES[type];
    const u = {
      id: nextId++, kind: 'unit', side, type, x, y, targetX: x, targetY: y,
      hp: t.hp, maxHp: t.hp, reload: Math.random() * t.reload,
      facing: side === 'france' ? 0 : Math.PI, dead: false,
      task: null, resourceTarget: null, returnResource: null, buildingTarget: null,
      carryType: null, carry: 0, gatherClock: 0,
      morale: 100, routing: false, chargeTimer: 0,
      attackMode: 'fire', artilleryMode: 'round', recentHit: 0
    };
    units.push(u);
    return u;
  }

  function createBuilding(side, type, x, y, complete = true) {
    const d = BUILDINGS[type];
    const b = {
      id: nextId++, kind: 'building', side, type, x, y, w: d.w, h: d.h,
      hp: complete ? d.hp : Math.round(d.hp * 0.15), maxHp: d.hp,
      complete, construction: complete ? 1 : 0.15, dead: false,
      queue: [], production: 0
    };
    buildings.push(b);
    return b;
  }

  function createResource(type, x, y, amount) {
    const r = { id: nextId++, kind: 'resource', type, x, y, amount, maxAmount: amount, radius: type === 'wood' ? 20 : 18, dead: false };
    resources.push(r);
    return r;
  }

  function spawnLine(side, type, x, y, count, cols = 12, spacing = 18) {
    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const dir = side === 'france' ? 1 : -1;
      createUnit(side, type, x + dir * col * spacing, y + row * spacing);
    }
  }

  function livingUnits(side) { return units.filter(u => !u.dead && u.side === side); }
  function livingBuildings(side) { return buildings.filter(b => !b.dead && b.side === side); }
  function populationUsed() { return livingUnits('france').reduce((sum, u) => sum + TYPES[u.type].pop, 0); }

  function recalcPopCap() {
    economy.popCap = livingBuildings('france')
      .filter(b => b.complete)
      .reduce((sum, b) => sum + (BUILDINGS[b.type].pop || 0), 0);
  }

  function resetGame() {
    units.length = 0; buildings.length = 0; resources.length = 0; projectiles.length = 0; particles.length = 0;
    selectedUnits.clear();
    selectedBuilding = null;
    nextId = 1; gameOver = false; aiClock = 0; buildMode = null; volleyClock = 0; currentFormation = 'line';
    economy.food = 1000; economy.wood = 1000; economy.popCap = 40;
    camera.x = 650; camera.y = 820; camera.zoom = 0.76;
    messageEl.classList.add('hidden');
    buildHintEl.classList.add('hidden');

    createBuilding('france', 'towncenter', 520, 820, true);
    for (let i = 0; i < 6; i++) createUnit('france', 'worker', 610 + (i % 3) * 24, 770 + Math.floor(i / 3) * 28);
    spawnLine('france', 'infantry', 670, 940, 24, 12, 18);

    createBuilding('britain', 'towncenter', 2280, 820, true);
    createBuilding('britain', 'barracks', 2180, 970, true);
    spawnLine('britain', 'infantry', 2080, 690, 44, 15, 18);
    spawnLine('britain', 'cavalry', 2290, 600, 10, 5, 24);
    spawnLine('britain', 'artillery', 2140, 1040, 4, 4, 42);

    const forests = [[330,530],[390,570],[450,535],[305,610],[370,645],[455,630],[760,420],[825,455],[890,410],[980,1230],[1045,1280],[1120,1240],[1000,1330],[1090,1360],[1210,1300]];
    forests.forEach(([x, y]) => {
      for (let i = 0; i < 5; i++) createResource('wood', x + (Math.random() - 0.5) * 45, y + (Math.random() - 0.5) * 45, 180);
    });
    [[690,610],[750,640],[810,610],[710,680],[790,690]].forEach(([x, y]) => createResource('food', x, y, 320));

    recalcPopCap();
    actionSignature = '';
    updateHud(true);
    statusEl.textContent = 'v0.3.1: bouw een Barracks, train musketiers en gebruik de formatieknoppen.';
  }

  function screenToWorld(sx, sy) {
    return { x: (sx - innerWidth / 2) / camera.zoom + camera.x, y: (sy - innerHeight / 2) / camera.zoom + camera.y };
  }

  function worldToScreen(wx, wy) {
    return { x: (wx - camera.x) * camera.zoom + innerWidth / 2, y: (wy - camera.y) * camera.zoom + innerHeight / 2 };
  }

  function clampCamera() {
    const halfW = innerWidth / (2 * camera.zoom);
    const halfH = innerHeight / (2 * camera.zoom);
    camera.x = Math.max(halfW, Math.min(WORLD.width - halfW, camera.x));
    camera.y = Math.max(halfH, Math.min(WORLD.height - halfH, camera.y));
  }

  function formationLabel(mode) {
    return mode === 'square' ? 'Carré' : mode === 'column' ? 'Colonne' : 'Linie';
  }

  function avgMorale(group) {
    return group.length ? group.reduce((sum, u) => sum + u.morale, 0) / group.length : 0;
  }

  function getActionSignature() {
    const buildingPart = selectedBuilding ? `${selectedBuilding.id}:${selectedBuilding.type}:${selectedBuilding.complete}` : '-';
    const types = [...new Set([...selectedUnits].filter(u => !u.dead && !u.routing).map(u => u.type))].sort().join(',');
    return `${buildingPart}|${types}`;
  }

  function makeDynamicButton(action, html) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.action = action;
    b.dataset.dynamic = '1';
    b.innerHTML = html;
    return b;
  }

  function renderDynamicActions(force = false) {
    const sig = getActionSignature();
    if (!force && sig === actionSignature) return;
    actionSignature = sig;

    actionsEl.querySelectorAll('[data-dynamic="1"]').forEach(el => el.remove());
    const fragment = document.createDocumentFragment();

    if (selectedBuilding?.complete && selectedBuilding.side === 'france') {
      if (selectedBuilding.type === 'towncenter') fragment.append(makeDynamicButton('train-worker', 'Boer +1<br><small>50 🍞</small>'));
      if (selectedBuilding.type === 'barracks') fragment.append(makeDynamicButton('train-infantry', 'Musketier<br><small>80 🍞 · 20 🪵</small>'));
    }

    const group = [...selectedUnits].filter(u => !u.dead && !u.routing);
    if (group.some(u => u.type === 'infantry')) fragment.append(makeDynamicButton('bayonet', 'Bajonet<br><small>charge</small>'));
    if (group.some(u => u.type === 'cavalry')) fragment.append(makeDynamicButton('charge', 'Cavalerie<br><small>charge</small>'));
    if (group.some(u => u.type === 'artillery')) {
      const mode = group.find(u => u.type === 'artillery').artilleryMode;
      fragment.append(makeDynamicButton('artillery-mode', mode === 'round' ? 'Kanonkogel<br><small>→ grapeshot</small>' : 'Grapeshot<br><small>→ kogel</small>'));
    }

    actionsEl.prepend(fragment);
  }

  function updateActionVisuals() {
    actionsEl.querySelectorAll('[data-formation]').forEach(btn => btn.classList.toggle('active', btn.dataset.formation === currentFormation));
    actionsEl.querySelectorAll('[data-action^="build-"]').forEach(btn => btn.classList.toggle('active', btn.dataset.action === `build-${buildMode}`));
  }

  function updateHud(forceActions = false) {
    for (const u of [...selectedUnits]) if (u.dead) selectedUnits.delete(u);
    if (selectedBuilding?.dead) selectedBuilding = null;
    recalcPopCap();

    foodEl.textContent = Math.floor(economy.food);
    woodEl.textContent = Math.floor(economy.wood);
    populationEl.textContent = `${populationUsed()}/${economy.popCap}`;
    frenchCountEl.textContent = livingUnits('france').length;
    britishCountEl.textContent = livingUnits('britain').length;

    if (selectedBuilding) {
      const b = selectedBuilding;
      selectionTitleEl.textContent = BUILDINGS[b.type].label;
      if (!b.complete) selectionDetailsEl.textContent = `In aanbouw · ${Math.floor(b.construction * 100)}%`;
      else if (b.queue.length) selectionDetailsEl.textContent = `Productie: ${b.queue[0].label} · ${Math.floor(b.production * 100)}%`;
      else selectionDetailsEl.textContent = `${Math.max(0, Math.floor(b.hp))}/${b.maxHp} HP`;
    } else if (selectedUnits.size) {
      const group = [...selectedUnits];
      const workers = group.filter(u => u.type === 'worker').length;
      const routing = group.filter(u => u.routing).length;
      selectionTitleEl.textContent = group.length === 1 ? TYPES[group[0].type].label : `${group.length} eenheden`;
      selectionDetailsEl.textContent = workers
        ? `${workers} boeren · rechtsklik op grondstof om te verzamelen`
        : `Morale ${Math.round(avgMorale(group))}% · ${formationLabel(currentFormation)}${routing ? ` · ${routing} op de vlucht` : ''}`;
    } else {
      selectionTitleEl.textContent = 'Niets geselecteerd';
      selectionDetailsEl.textContent = 'Selecteer troepen of een gebouw.';
    }

    renderDynamicActions(forceActions);
    updateActionVisuals();
  }

  function nearestEnemy(unit, maxRange) {
    let best = null, bestD2 = maxRange * maxRange;
    for (const other of units) {
      if (other.dead || other.side === unit.side || other.type === 'worker' || other.routing) continue;
      const dx = other.x - unit.x, dy = other.y - unit.y, d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; best = other; }
    }
    return best;
  }

  function moraleShock(victim, amount) {
    victim.morale = Math.max(0, victim.morale - amount);
    victim.recentHit = 2;
    for (const u of units) {
      if (u.dead || u.side !== victim.side || u === victim) continue;
      if (Math.hypot(u.x - victim.x, u.y - victim.y) < 55) u.morale = Math.max(0, u.morale - amount * 0.18);
    }
  }

  function applyDamage(victim, damage, shock = 8) {
    if (!victim || victim.dead) return;
    victim.hp -= damage;
    moraleShock(victim, shock + damage * 0.08);
    if (victim.hp <= 0) {
      victim.dead = true; victim.morale = 0;
      for (const u of units) {
        if (!u.dead && u.side === victim.side && Math.hypot(u.x - victim.x, u.y - victim.y) < 75) u.morale = Math.max(0, u.morale - 7);
      }
    }
  }

  function spawnSmoke(x, y, count) {
    for (let i = 0; i < count; i++) particles.push({ x, y, vx: (Math.random() - 0.5) * 12, vy: -4 - Math.random() * 10, life: 0.7 + Math.random() * 0.8, maxLife: 1.5, size: 4 + Math.random() * 8 });
  }

  function spawnImpact(x, y, count) {
    for (let i = 0; i < count; i++) particles.push({ x, y, vx: (Math.random() - 0.5) * 45, vy: (Math.random() - 0.5) * 45, life: 0.25 + Math.random() * 0.35, maxLife: 0.6, size: 2 + Math.random() * 3 });
  }

  function fire(unit, enemy) {
    const t = TYPES[unit.type];
    unit.reload = t.reload * (0.9 + Math.random() * 0.25);
    unit.facing = Math.atan2(enemy.y - unit.y, enemy.x - unit.x);

    if (unit.type === 'cavalry' || unit.type === 'worker') {
      const chargeBonus = unit.type === 'cavalry' && unit.chargeTimer > 0 ? 2 : 1;
      applyDamage(enemy, t.damage * chargeBonus * (0.85 + Math.random() * 0.3), unit.chargeTimer > 0 ? 24 : 9);
      spawnImpact(enemy.x, enemy.y, 4);
      if (unit.type === 'cavalry') unit.chargeTimer = Math.max(0, unit.chargeTimer - 0.8);
      return;
    }

    if (unit.type === 'artillery' && unit.artilleryMode === 'grape') {
      const angle = unit.facing;
      for (const other of units) {
        if (other.dead || other.side === unit.side) continue;
        const dx = other.x - unit.x, dy = other.y - unit.y, d = Math.hypot(dx, dy);
        if (d > 145) continue;
        const da = Math.abs(Math.atan2(Math.sin(Math.atan2(dy, dx) - angle), Math.cos(Math.atan2(dy, dx) - angle)));
        if (da < 0.28) { applyDamage(other, 24 * (1 - d / 190), 18); spawnImpact(other.x, other.y, 3); }
      }
      spawnSmoke(unit.x + Math.cos(angle) * 12, unit.y + Math.sin(angle) * 12, 14);
      return;
    }

    projectiles.push({ x: unit.x, y: unit.y, target: enemy, side: unit.side, damage: t.damage, speed: t.projectileSpeed, artillery: unit.type === 'artillery', dead: false });
    spawnSmoke(unit.x + Math.cos(unit.facing) * 9, unit.y + Math.sin(unit.facing) * 9, unit.type === 'artillery' ? 10 : 4);
  }

  function moveToward(u, tx, ty, dt, speed = TYPES[u.type].speed) {
    const dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy);
    if (d <= 2) return true;
    const step = Math.min(d, speed * dt);
    u.x += dx / d * step; u.y += dy / d * step; u.facing = Math.atan2(dy, dx);
    return d <= 4;
  }

  function nearestTownCenter(side, x, y) {
    let best = null, bestD = Infinity;
    for (const b of buildings) {
      if (b.dead || !b.complete || b.side !== side || b.type !== 'towncenter') continue;
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  function updateWorker(u, dt) {
    if (!u.task) { moveToward(u, u.targetX, u.targetY, dt); return; }

    if (u.task === 'gather') {
      const r = u.resourceTarget;
      if (!r || r.dead || r.amount <= 0) { u.task = null; u.resourceTarget = null; return; }
      if (Math.hypot(r.x - u.x, r.y - u.y) > r.radius + 11) { moveToward(u, r.x, r.y, dt); return; }
      u.gatherClock += dt;
      if (u.gatherClock >= 0.45) {
        u.gatherClock = 0;
        const take = Math.min(5, r.amount, 20 - u.carry);
        r.amount -= take; u.carry += take; u.carryType = r.type;
        if (r.amount <= 0) r.dead = true;
        if (u.carry >= 20 || r.dead) { u.returnResource = r; u.task = 'return'; }
      }
      return;
    }

    if (u.task === 'return') {
      const tc = nearestTownCenter(u.side, u.x, u.y);
      if (!tc) { u.task = null; return; }
      if (Math.hypot(tc.x - u.x, tc.y - u.y) > 60) { moveToward(u, tc.x, tc.y, dt); return; }
      if (u.side === 'france' && u.carryType) economy[u.carryType] += u.carry;
      u.carry = 0; u.carryType = null;
      if (u.returnResource && !u.returnResource.dead) { u.resourceTarget = u.returnResource; u.task = 'gather'; }
      else { u.task = null; u.resourceTarget = null; }
      return;
    }

    if (u.task === 'build') {
      const b = u.buildingTarget;
      if (!b || b.dead || b.complete) { u.task = null; u.buildingTarget = null; return; }
      if (Math.hypot(b.x - u.x, b.y - u.y) > Math.max(b.w, b.h) * 0.7) { moveToward(u, b.x, b.y, dt); return; }
      b.construction += dt * 0.22;
      b.hp = Math.min(b.maxHp, b.maxHp * b.construction);
      if (b.construction >= 1) {
        b.construction = 1; b.complete = true; b.hp = b.maxHp; u.task = null; u.buildingTarget = null;
        recalcPopCap(); actionSignature = ''; updateHud(true);
        statusEl.textContent = `${BUILDINGS[b.type].label} voltooid. Klik erop om productie te starten.`;
      }
    }
  }

  function routeUnit(u) {
    if (u.routing || u.type === 'worker') return;
    u.routing = true; u.task = null; u.attackMode = 'fire'; u.chargeTimer = 0;
    u.targetX = u.side === 'france' ? 35 : WORLD.width - 35;
    u.targetY = Math.max(50, Math.min(WORLD.height - 50, u.y + (Math.random() - 0.5) * 300));
  }

  function updateUnit(u, dt) {
    if (u.dead) return;
    u.reload -= dt; u.recentHit = Math.max(0, u.recentHit - dt); u.chargeTimer = Math.max(0, u.chargeTimer - dt);
    if (u.type === 'worker' && u.task) { updateWorker(u, dt); return; }

    const near = nearestEnemy(u, 170);
    if (!u.routing) {
      u.morale = Math.min(100, u.morale + (near ? 0.25 : 1.5) * dt);
      if (u.morale < 24) routeUnit(u);
    }
    if (u.routing) {
      moveToward(u, u.targetX, u.targetY, dt, TYPES[u.type].speed * 1.25);
      if ((u.side === 'france' && u.x < 45) || (u.side === 'britain' && u.x > WORLD.width - 45)) u.dead = true;
      return;
    }

    let range = TYPES[u.type].range;
    if (u.type === 'artillery' && u.artilleryMode === 'grape') range = 145;
    if (u.type === 'infantry' && u.attackMode === 'bayonet') range = 16;
    const enemy = nearestEnemy(u, range);
    if (enemy && u.reload <= 0) {
      if (u.type !== 'infantry' || u.attackMode === 'bayonet' || volleyClock < 0.16) fire(u, enemy);
    }

    const dist = Math.hypot(u.targetX - u.x, u.targetY - u.y);
    if (dist > 2) {
      const stop = enemy && u.type !== 'cavalry' && u.attackMode !== 'bayonet';
      if (!stop) moveToward(u, u.targetX, u.targetY, dt, TYPES[u.type].speed * (u.chargeTimer > 0 ? 1.45 : 1));
    }
    u.x = Math.max(8, Math.min(WORLD.width - 8, u.x));
    u.y = Math.max(8, Math.min(WORLD.height - 8, u.y));
  }

  function updateBuildings(dt) {
    for (const b of buildings) {
      if (b.dead || !b.complete || !b.queue.length) continue;
      b.production += dt / b.queue[0].time;
      if (b.production >= 1) {
        const item = b.queue.shift(); b.production = 0;
        if (b.side === 'france' && populationUsed() + TYPES[item.type].pop > economy.popCap) {
          b.queue.unshift(item); b.production = 0.99; continue;
        }
        createUnit(b.side, item.type, b.x + (b.side === 'france' ? b.w : -b.w), b.y + b.h * 0.65);
        if (b.side === 'france') statusEl.textContent = `${TYPES[item.type].label} is klaar.`;
      }
    }
  }

  function updateProjectiles(dt) {
    for (const p of projectiles) {
      if (p.dead) continue;
      if (!p.target || p.target.dead) { p.dead = true; continue; }
      const dx = p.target.x - p.x, dy = p.target.y - p.y, d = Math.hypot(dx, dy), hit = p.artillery ? 12 : 6;
      if (d <= hit) {
        if (p.artillery) {
          spawnImpact(p.target.x, p.target.y, 16); spawnSmoke(p.target.x, p.target.y, 12);
          for (const u of units) {
            if (u.dead || u.side === p.side) continue;
            const dd = Math.hypot(u.x - p.target.x, u.y - p.target.y);
            if (dd < 42) applyDamage(u, p.damage * Math.max(0.22, 1 - dd / 50), 24);
          }
        } else {
          applyDamage(p.target, p.damage * (0.75 + Math.random() * 0.5), 10); spawnImpact(p.target.x, p.target.y, 3);
        }
        p.dead = true;
      } else {
        const step = Math.min(d, p.speed * dt); p.x += dx / d * step; p.y += dy / d * step;
      }
    }
    for (let i = projectiles.length - 1; i >= 0; i--) if (projectiles[i].dead) projectiles.splice(i, 1);
  }

  function updateParticles(dt) {
    for (const p of particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; p.vy *= 0.97; }
    for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
  }

  function centroid(group) {
    if (!group.length) return { x: camera.x, y: camera.y };
    let x = 0, y = 0;
    for (const u of group) { x += u.x; y += u.y; }
    return { x: x / group.length, y: y / group.length };
  }

  function commandFormation(group, x, y, mode = 'line') {
    if (!group.length) return;
    const n = group.length;
    let cols, sx = 18, sy = 18;
    if (mode === 'line') { cols = Math.min(28, n); sx = 17; sy = 19; }
    else if (mode === 'column') { cols = Math.min(7, Math.ceil(Math.sqrt(n))); sx = 19; sy = 17; }
    else { cols = Math.max(4, Math.ceil(Math.sqrt(n))); sx = 19; sy = 19; }
    const rows = Math.ceil(n / cols);
    const sorted = [...group].sort((a, b) => a.type.localeCompare(b.type) || a.id - b.id);

    sorted.forEach((u, i) => {
      const row = Math.floor(i / cols), col = i % cols;
      let ox = (col - (cols - 1) / 2) * sx, oy = (row - (rows - 1) / 2) * sy;
      if (mode === 'square' && n >= 12) {
        const side = Math.ceil(Math.sqrt(n)), perimeter = Math.max(4, side * 4 - 4), k = i % perimeter, s = (side - 1) * sx;
        if (k < side) { ox = -s / 2 + k * sx; oy = -s / 2; }
        else if (k < side * 2 - 1) { ox = s / 2; oy = -s / 2 + (k - side + 1) * sy; }
        else if (k < side * 3 - 2) { ox = s / 2 - (k - (side * 2 - 1) + 1) * sx; oy = s / 2; }
        else { ox = -s / 2; oy = s / 2 - (k - (side * 3 - 2) + 1) * sy; }
      }
      u.task = null; u.resourceTarget = null;
      u.targetX = Math.max(20, Math.min(WORLD.width - 20, x + ox));
      u.targetY = Math.max(20, Math.min(WORLD.height - 20, y + oy));
    });
  }

  function applyFormationNow(mode) {
    currentFormation = mode;
    const group = [...selectedUnits].filter(u => !u.dead && !u.routing);
    if (group.length) {
      const c = centroid(group);
      commandFormation(group, c.x, c.y, mode);
      statusEl.textContent = `${formationLabel(mode)} toegepast op ${group.length} eenheden.`;
    } else {
      statusEl.textContent = `Formatie ingesteld op ${formationLabel(mode)}.`;
    }
    updateHud();
  }

  function issueMove(x, y) {
    const group = [...selectedUnits].filter(u => !u.dead && !u.routing);
    if (!group.length) return;
    commandFormation(group, x, y, currentFormation);
    statusEl.textContent = `${group.length} eenheden bewegen in ${formationLabel(currentFormation).toLowerCase()}.`;
  }

  function assignGather(resource) {
    const workers = [...selectedUnits].filter(u => !u.dead && u.type === 'worker');
    if (!workers.length) return false;
    workers.forEach(u => { u.task = 'gather'; u.resourceTarget = resource; u.returnResource = resource; u.targetX = resource.x; u.targetY = resource.y; });
    statusEl.textContent = `${workers.length} boeren verzamelen ${resource.type === 'wood' ? 'hout' : 'voedsel'}.`;
    return true;
  }

  function canAfford(cost) {
    return (!cost.food || economy.food >= cost.food) && (!cost.wood || economy.wood >= cost.wood);
  }

  function pay(cost) {
    if (cost.food) economy.food -= cost.food;
    if (cost.wood) economy.wood -= cost.wood;
  }

  function startBuild(type) {
    const workers = [...selectedUnits].filter(u => !u.dead && u.type === 'worker');
    if (!workers.length) { statusEl.textContent = 'Selecteer eerst één of meer boeren.'; return; }
    const cost = BUILDINGS[type].cost;
    if (!canAfford(cost)) { statusEl.textContent = 'Niet genoeg hout.'; return; }
    buildMode = type;
    buildHintEl.classList.remove('hidden');
    updateActionVisuals();
  }

  function placeBuilding(type, x, y) {
    const workers = [...selectedUnits].filter(u => !u.dead && u.type === 'worker');
    if (!workers.length) return;
    const def = BUILDINGS[type], cost = def.cost;
    if (!canAfford(cost)) return;
    if (x < 100 || y < 100 || x > WORLD.width - 100 || y > WORLD.height - 100) { statusEl.textContent = 'Hier kun je niet bouwen.'; return; }
    for (const b of buildings) {
      if (!b.dead && Math.abs(b.x - x) < (b.w + def.w) * 0.7 && Math.abs(b.y - y) < (b.h + def.h) * 0.7) { statusEl.textContent = 'Te dicht bij een ander gebouw.'; return; }
    }
    pay(cost);
    const b = createBuilding('france', type, x, y, false);
    workers.forEach((u, i) => { u.task = 'build'; u.buildingTarget = b; u.targetX = x + (i - workers.length / 2) * 12; u.targetY = y + def.h * 0.7; });
    buildMode = null; buildHintEl.classList.add('hidden');
    statusEl.textContent = `${def.label} wordt gebouwd.`;
    updateHud(true);
  }

  function queueUnit(type) {
    if (!selectedBuilding || !selectedBuilding.complete || selectedBuilding.side !== 'france') return;
    const costs = { worker: { food: 50 }, infantry: { food: 80, wood: 20 } };
    const times = { worker: 7, infantry: 6 };
    const cost = costs[type];
    if (!canAfford(cost)) { statusEl.textContent = 'Niet genoeg grondstoffen.'; return; }
    if (populationUsed() + TYPES[type].pop > economy.popCap) { statusEl.textContent = 'Population cap bereikt. Bouw een House.'; return; }
    pay(cost);
    selectedBuilding.queue.push({ type, label: TYPES[type].label, time: times[type] });
    statusEl.textContent = `${TYPES[type].label} toegevoegd aan productie.`;
    updateHud();
  }

  function bayonetCommand() {
    const group = [...selectedUnits].filter(u => !u.dead && !u.routing && u.type === 'infantry');
    if (!group.length) return;
    const enemies = livingUnits('britain').filter(u => !u.routing);
    if (!enemies.length) return;
    const c = centroid(group);
    let target = enemies[0], bestD = Infinity;
    for (const e of enemies) { const d = Math.hypot(e.x - c.x, e.y - c.y); if (d < bestD) { bestD = d; target = e; } }
    group.forEach(u => { u.attackMode = 'bayonet'; u.chargeTimer = 6; u.morale = Math.min(100, u.morale + 8); });
    commandFormation(group, target.x, target.y, 'line');
    statusEl.textContent = 'Bajonetten vooruit!';
  }

  function cavalryCharge() {
    const group = [...selectedUnits].filter(u => !u.dead && !u.routing && u.type === 'cavalry');
    group.forEach(u => { u.chargeTimer = 7; u.morale = Math.min(100, u.morale + 10); });
    if (group.length) statusEl.textContent = 'Cavaleriecharge!';
  }

  function toggleArtillery() {
    const group = [...selectedUnits].filter(u => !u.dead && u.type === 'artillery');
    if (!group.length) return;
    const next = group[0].artilleryMode === 'round' ? 'grape' : 'round';
    group.forEach(u => u.artilleryMode = next);
    statusEl.textContent = next === 'grape' ? 'Grapeshot geladen.' : 'Ronde kogel geladen.';
    actionSignature = ''; updateHud(true);
  }

  function aiOrder() {
    const british = livingUnits('britain').filter(u => u.type !== 'worker' && !u.routing);
    const french = livingUnits('france').filter(u => u.type !== 'worker' && !u.routing);
    if (!british.length || !french.length) return;
    const c = centroid(french);
    const inf = british.filter(u => u.type === 'infantry'), cav = british.filter(u => u.type === 'cavalry'), art = british.filter(u => u.type === 'artillery');
    commandFormation(inf, c.x + 220, c.y, 'line');
    commandFormation(cav, c.x + 65, c.y - 120, 'column');
    commandFormation(art, c.x + 390, c.y + 140, 'line');
    cav.forEach(u => u.chargeTimer = 6);
    art.forEach(u => u.artilleryMode = Math.random() < 0.25 ? 'grape' : 'round');
  }

  function checkVictory() {
    if (gameOver) return;
    const frenchCombat = livingUnits('france').filter(u => u.type !== 'worker').length;
    const british = livingUnits('britain').length;
    if (british === 0) { gameOver = true; messageEl.textContent = 'FRANSE OVERWINNING'; messageEl.classList.remove('hidden'); }
    else if (frenchCombat === 0 && livingBuildings('france').filter(b => b.type === 'barracks').length === 0) { gameOver = true; messageEl.textContent = 'BRITSE OVERWINNING'; messageEl.classList.remove('hidden'); }
  }

  function update(dt) {
    volleyClock = (volleyClock + dt) % 3.1;
    if (!gameOver) {
      units.forEach(u => updateUnit(u, dt));
      updateBuildings(dt); updateProjectiles(dt); updateParticles(dt);
      aiClock += dt; if (aiClock > 10) { aiClock = 0; aiOrder(); }
      checkVictory();
    } else updateParticles(dt);

    const speed = 520 / camera.zoom;
    if (keys.has('w') || keys.has('arrowup')) camera.y -= speed * dt;
    if (keys.has('s') || keys.has('arrowdown')) camera.y += speed * dt;
    if (keys.has('a') || keys.has('arrowleft')) camera.x -= speed * dt;
    if (keys.has('d') || keys.has('arrowright')) camera.x += speed * dt;
    clampCamera();
    updateHud();
  }

  function drawTerrain() {
    ctx.fillStyle = COLORS.grass; ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1 / camera.zoom;
    for (let x = 0; x < WORLD.width; x += 100) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD.height); ctx.stroke(); }
    for (let y = 0; y < WORLD.height; y += 100) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.width, y); ctx.stroke(); }
    ctx.fillStyle = 'rgba(219,201,146,.13)'; ctx.fillRect(0, 780, WORLD.width, 120);
  }

  function drawResource(r) {
    if (r.dead) return;
    const ratio = r.amount / r.maxAmount;
    if (r.type === 'wood') {
      ctx.fillStyle = '#553b28'; ctx.fillRect(r.x - 3, r.y + 3, 6, 13);
      ctx.fillStyle = COLORS.tree; ctx.beginPath(); ctx.arc(r.x, r.y, 15 + ratio * 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = COLORS.tree2; ctx.beginPath(); ctx.arc(r.x - 5, r.y - 5, 9 + ratio * 3, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = COLORS.food;
      for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; ctx.beginPath(); ctx.arc(r.x + Math.cos(a) * 10, r.y + Math.sin(a) * 7, 5 + ratio * 2, 0, Math.PI * 2); ctx.fill(); }
    }
  }

  function drawBuilding(b) {
    if (b.dead) return;
    const side = b.side === 'france' ? COLORS.france : COLORS.britain;
    ctx.save(); ctx.translate(b.x, b.y); ctx.globalAlpha = b.complete ? 1 : 0.65;
    ctx.fillStyle = '#594936'; ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
    ctx.fillStyle = side; ctx.fillRect(-b.w / 2, -b.h / 2, b.w, 9);
    ctx.fillStyle = '#b69a72'; ctx.fillRect(-b.w * 0.34, -b.h * 0.35, b.w * 0.68, b.h * 0.58);
    ctx.fillStyle = '#6a553e';
    if (b.type === 'towncenter' || b.type === 'house') { ctx.beginPath(); ctx.moveTo(-b.w * 0.48, -b.h * 0.25); ctx.lineTo(0, -b.h * 0.72); ctx.lineTo(b.w * 0.48, -b.h * 0.25); ctx.fill(); }
    else ctx.fillRect(-b.w * 0.42, -b.h * 0.65, b.w * 0.84, b.h * 0.24);
    if (selectedBuilding === b) { ctx.strokeStyle = COLORS.selected; ctx.lineWidth = 3 / camera.zoom; ctx.strokeRect(-b.w / 2 - 5, -b.h / 2 - 5, b.w + 10, b.h + 10); }
    if (!b.complete) {
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(-b.w / 2, b.h / 2 + 7, b.w, 6);
      ctx.fillStyle = COLORS.selected; ctx.fillRect(-b.w / 2, b.h / 2 + 7, b.w * b.construction, 6);
    } else if (b.queue.length) {
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(-b.w / 2, b.h / 2 + 7, b.w, 6);
      ctx.fillStyle = '#d7bd61'; ctx.fillRect(-b.w / 2, b.h / 2 + 7, b.w * b.production, 6);
    }
    ctx.restore();
  }

  function drawUnit(u) {
    if (u.dead) return;
    const t = TYPES[u.type], base = u.side === 'france' ? COLORS.france : COLORS.britain, light = u.side === 'france' ? COLORS.franceLight : COLORS.britainLight;
    ctx.save(); ctx.translate(u.x, u.y); ctx.rotate(u.facing);
    if (selectedUnits.has(u)) { ctx.strokeStyle = COLORS.selected; ctx.lineWidth = 2 / camera.zoom; ctx.beginPath(); ctx.arc(0, 0, t.radius + 5, 0, Math.PI * 2); ctx.stroke(); }
    if (u.type === 'cavalry') { ctx.fillStyle = '#5b4635'; ctx.beginPath(); ctx.ellipse(-2, 1, 10, 6, 0, 0, Math.PI * 2); ctx.fill(); }
    if (u.type === 'artillery') { ctx.strokeStyle = '#4b3b2b'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-10, 5); ctx.lineTo(13, -2); ctx.stroke(); ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(-6, 7, 4, 0, Math.PI * 2); ctx.arc(6, 5, 4, 0, Math.PI * 2); ctx.fill(); }
    if (u.type === 'worker') { ctx.fillStyle = '#7d674a'; ctx.fillRect(-5, -5, 10, 11); ctx.fillStyle = base; ctx.fillRect(-5, -5, 10, 4); }
    else { ctx.fillStyle = u.routing ? '#777' : base; ctx.beginPath(); ctx.arc(0, 0, t.radius, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = light; ctx.fillRect(1, -2, t.radius + 5, 3); }
    ctx.rotate(-u.facing);
    if (u.carry > 0) { ctx.fillStyle = u.carryType === 'wood' ? '#8a5b31' : '#d6b75f'; ctx.fillRect(-5, -14, 10, 5); }
    if (u.type !== 'worker') {
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(-10, -16, 20, 3);
      ctx.fillStyle = u.morale > 55 ? '#d8d06a' : u.morale > 25 ? '#d49a4b' : '#b43f38'; ctx.fillRect(-10, -16, 20 * (u.morale / 100), 3);
    }
    ctx.restore();
  }

  function drawProjectile(p) {
    ctx.fillStyle = p.artillery ? '#202020' : '#f0dfaa'; ctx.beginPath(); ctx.arc(p.x, p.y, p.artillery ? 3.2 : 1.8, 0, Math.PI * 2); ctx.fill();
  }

  function drawParticles() {
    for (const p of particles) { ctx.globalAlpha = Math.max(0, p.life / p.maxLife); ctx.fillStyle = COLORS.smoke; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.save(); ctx.translate(innerWidth / 2, innerHeight / 2); ctx.scale(camera.zoom, camera.zoom); ctx.translate(-camera.x, -camera.y);
    drawTerrain(); resources.forEach(drawResource); buildings.forEach(drawBuilding); units.forEach(drawUnit); projectiles.forEach(drawProjectile); drawParticles(); ctx.restore();
    if (drag.active && drag.moved && !buildMode) {
      ctx.strokeStyle = 'rgba(245,220,112,.9)'; ctx.fillStyle = 'rgba(245,220,112,.12)';
      const x = Math.min(drag.startX, drag.x), y = Math.min(drag.startY, drag.y), w = Math.abs(drag.x - drag.startX), h = Math.abs(drag.y - drag.startY);
      ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
    }
  }

  function unitAt(wx, wy, side = null) {
    let best = null, bestD = 24 / camera.zoom;
    for (const u of units) { if (u.dead || (side && u.side !== side)) continue; const d = Math.hypot(u.x - wx, u.y - wy); if (d < bestD) { bestD = d; best = u; } }
    return best;
  }

  function buildingAt(wx, wy, side = null) {
    for (let i = buildings.length - 1; i >= 0; i--) {
      const b = buildings[i];
      if (b.dead || (side && b.side !== side)) continue;
      if (Math.abs(wx - b.x) <= b.w / 2 + 8 && Math.abs(wy - b.y) <= b.h / 2 + 8) return b;
    }
    return null;
  }

  function resourceAt(wx, wy) {
    let best = null, bestD = 32 / camera.zoom;
    for (const r of resources) { if (r.dead) continue; const d = Math.hypot(r.x - wx, r.y - wy); if (d < bestD) { bestD = d; best = r; } }
    return best;
  }

  function selectPoint(wx, wy, add = false) {
    const b = buildingAt(wx, wy, 'france');
    if (b) {
      if (!add) selectedUnits.clear();
      selectedBuilding = b; actionSignature = ''; updateHud(true); return;
    }
    const u = unitAt(wx, wy, 'france');
    if (!add) { selectedUnits.clear(); selectedBuilding = null; }
    if (u) { if (add && selectedUnits.has(u)) selectedUnits.delete(u); else selectedUnits.add(u); }
    actionSignature = ''; updateHud(true);
  }

  function selectBox(x1, y1, x2, y2) {
    selectedUnits.clear(); selectedBuilding = null;
    const a = screenToWorld(Math.min(x1, x2), Math.min(y1, y2));
    const b = screenToWorld(Math.max(x1, x2), Math.max(y1, y2));
    for (const u of units) if (!u.dead && u.side === 'france' && u.x >= a.x && u.x <= b.x && u.y >= a.y && u.y <= b.y) selectedUnits.add(u);
    actionSignature = ''; updateHud(true);
  }

  function bayonetCommand() {
    const group = [...selectedUnits].filter(u => !u.dead && !u.routing && u.type === 'infantry');
    if (!group.length) return;
    const enemies = livingUnits('britain').filter(u => !u.routing);
    if (!enemies.length) return;
    const c = centroid(group);
    let target = enemies[0], bestD = Infinity;
    for (const e of enemies) { const d = Math.hypot(e.x - c.x, e.y - c.y); if (d < bestD) { bestD = d; target = e; } }
    group.forEach(u => { u.attackMode = 'bayonet'; u.chargeTimer = 6; u.morale = Math.min(100, u.morale + 8); });
    commandFormation(group, target.x, target.y, 'line');
    statusEl.textContent = 'Bajonetten vooruit!';
  }

  function cavalryCharge() {
    const group = [...selectedUnits].filter(u => !u.dead && !u.routing && u.type === 'cavalry');
    group.forEach(u => { u.chargeTimer = 7; u.morale = Math.min(100, u.morale + 10); });
    if (group.length) statusEl.textContent = 'Cavaleriecharge!';
  }

  function toggleArtillery() {
    const group = [...selectedUnits].filter(u => !u.dead && u.type === 'artillery');
    if (!group.length) return;
    const next = group[0].artilleryMode === 'round' ? 'grape' : 'round';
    group.forEach(u => u.artilleryMode = next);
    statusEl.textContent = next === 'grape' ? 'Grapeshot geladen.' : 'Ronde kogel geladen.';
    actionSignature = ''; updateHud(true);
  }

  canvas.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    drag.active = true; drag.startX = drag.x = e.clientX; drag.startY = drag.y = e.clientY; drag.moved = false;
  });

  canvas.addEventListener('mousemove', e => {
    if (!drag.active) return;
    drag.x = e.clientX; drag.y = e.clientY;
    if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) > 5) drag.moved = true;
  });

  canvas.addEventListener('mouseup', e => {
    if (e.button !== 0 || !drag.active) return;
    drag.active = false;
    const w = screenToWorld(e.clientX, e.clientY);
    if (buildMode) { placeBuilding(buildMode, w.x, w.y); return; }
    if (drag.moved) selectBox(drag.startX, drag.startY, e.clientX, e.clientY);
    else selectPoint(w.x, w.y, e.shiftKey);
  });

  canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (buildMode) return;
    const w = screenToWorld(e.clientX, e.clientY), r = resourceAt(w.x, w.y);
    if (r && assignGather(r)) return;
    issueMove(w.x, w.y);
  });

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const before = screenToWorld(e.clientX, e.clientY);
    camera.zoom = Math.max(0.42, Math.min(1.55, camera.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
    const after = screenToWorld(e.clientX, e.clientY);
    camera.x += before.x - after.x; camera.y += before.y - after.y; clampCamera();
  }, { passive: false });

  let touchTap = null;
  canvas.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    touchTap = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: false });

  canvas.addEventListener('touchend', e => {
    if (!touchTap || !e.changedTouches.length) return;
    const t = e.changedTouches[0], w = screenToWorld(t.clientX, t.clientY);
    if (buildMode) { placeBuilding(buildMode, w.x, w.y); touchTap = null; return; }
    const hit = unitAt(w.x, w.y, 'france') || buildingAt(w.x, w.y, 'france');
    if (hit) {
      selectedUnits.clear(); selectedBuilding = null;
      if (hit.kind === 'unit') selectedUnits.add(hit); else selectedBuilding = hit;
      actionSignature = ''; updateHud(true);
    } else {
      const r = resourceAt(w.x, w.y);
      if (r && !assignGather(r)) issueMove(w.x, w.y); else if (!r) issueMove(w.x, w.y);
    }
    touchTap = null;
  }, { passive: false });

  addEventListener('keydown', e => {
    const k = e.key.toLowerCase(); keys.add(k);
    if (k === 'escape') { buildMode = null; buildHintEl.classList.add('hidden'); updateActionVisuals(); }
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));

  actionsEl.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.formation) { applyFormationNow(btn.dataset.formation); return; }
    const action = btn.dataset.action;
    if (action === 'build-barracks') startBuild('barracks');
    else if (action === 'build-house') startBuild('house');
    else if (action === 'train-worker') queueUnit('worker');
    else if (action === 'train-infantry') queueUnit('infantry');
    else if (action === 'bayonet') bayonetCommand();
    else if (action === 'charge') cavalryCharge();
    else if (action === 'artillery-mode') toggleArtillery();
  });

  document.getElementById('resetBtn').addEventListener('click', resetGame);

  if (new URLSearchParams(location.search).has('test')) {
    window.__RTS_DEBUG__ = {
      getState() {
        return {
          food: economy.food, wood: economy.wood, popUsed: populationUsed(), popCap: economy.popCap,
          formation: currentFormation,
          selectedBuilding: selectedBuilding ? { id: selectedBuilding.id, type: selectedBuilding.type, complete: selectedBuilding.complete, queue: selectedBuilding.queue.length } : null,
          selectedUnits: [...selectedUnits].map(u => ({ id: u.id, type: u.type, x: u.x, y: u.y, targetX: u.targetX, targetY: u.targetY })),
          frenchUnits: livingUnits('france').length
        };
      },
      createCompletedBuilding(type = 'barracks', x = 780, y = 820) {
        return createBuilding('france', type, x, y, true).id;
      },
      selectBuildingById(id) {
        selectedUnits.clear(); selectedBuilding = buildings.find(b => b.id === id) || null; actionSignature = ''; updateHud(true);
      },
      selectUnits(type = 'infantry', count = 12) {
        selectedBuilding = null; selectedUnits.clear();
        livingUnits('france').filter(u => u.type === type).slice(0, count).forEach(u => selectedUnits.add(u));
        actionSignature = ''; updateHud(true);
      },
      tick(seconds) {
        const steps = Math.ceil(seconds / 0.033);
        for (let i = 0; i < steps; i++) update(Math.min(0.033, seconds / steps));
      },
      worldToScreen
    };
  }

  function frame(now) {
    const dt = Math.min(0.033, (now - lastTime) / 1000);
    lastTime = now;
    update(dt); draw(); requestAnimationFrame(frame);
  }

  resetGame();
  requestAnimationFrame(frame);
})();
