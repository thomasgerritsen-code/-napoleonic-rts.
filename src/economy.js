'use strict';
// ---------- Economy ----------
  function canAfford(side, cost) {
    const e = economies[side];
    return (!cost.food || e.food >= cost.food) && (!cost.wood || e.wood >= cost.wood);
  }
  function pay(side, cost) {
    const e = economies[side];
    if (cost.food) e.food -= cost.food;
    if (cost.wood) e.wood -= cost.wood;
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

  function nearestResource(type, x, y, excluded = null) {
    let best = null, bestD = Infinity;
    for (const r of resources) {
      if (r.dead || r.amount <= 0 || r.type !== type || r === excluded) continue;
      const d = Math.hypot(r.x - x, r.y - y);
      if (d < bestD) { bestD = d; best = r; }
    }
    return best;
  }

  function assignWorkerToResource(worker, resource) {
    if (!worker || !resource) return;
    worker.task = 'gather';
    worker.resourceTarget = resource;
    worker.returnResource = resource;
    worker.targetX = resource.x; worker.targetY = resource.y;
  }

  function autoAssignAIWorkers() {
    const aiWorkers = livingUnits('britain').filter(u => u.type === 'worker' && !u.task);
    aiWorkers.forEach((u, i) => {
      const preferred = i % 2 === 0 ? 'food' : 'wood';
      assignWorkerToResource(u, nearestResource(preferred, u.x, u.y) || nearestResource(preferred === 'food' ? 'wood' : 'food', u.x, u.y));
    });
  }

  function updateWorker(u, dt) {
    if (!u.task) {
      moveToward(u, u.targetX, u.targetY, dt);
      if (u.side === 'britain') {
        const preferred = economies.britain.wood < economies.britain.food ? 'wood' : 'food';
        assignWorkerToResource(u, nearestResource(preferred, u.x, u.y));
      }
      return;
    }

    if (u.task === 'gather') {
      const r = u.resourceTarget;
      if (!r || r.dead || r.amount <= 0) {
        u.task = null; u.resourceTarget = null;
        if (u.side === 'britain') autoAssignAIWorkers();
        return;
      }
      if (Math.hypot(r.x - u.x, r.y - u.y) > r.radius + 11) {
        moveToward(u, r.x, r.y, dt); return;
      }
      u.gatherClock += dt;
      if (u.gatherClock >= 0.45) {
        u.gatherClock = 0;
        const take = Math.min(5, r.amount, 25 - u.carry);
        r.amount -= take; u.carry += take; u.carryType = r.type;
        if (r.amount <= 0) r.dead = true;
        if (u.carry >= 25 || r.dead) { u.returnResource = r; u.task = 'return'; }
      }
      return;
    }

    if (u.task === 'return') {
      const tc = nearestTownCenter(u.side, u.x, u.y);
      if (!tc) { u.task = null; return; }
      if (Math.hypot(tc.x - u.x, tc.y - u.y) > 62) {
        moveToward(u, tc.x, tc.y, dt); return;
      }
      if (u.carryType) economies[u.side][u.carryType] += u.carry;
      u.carry = 0; u.carryType = null;
      if (u.returnResource && !u.returnResource.dead) {
        u.resourceTarget = u.returnResource; u.task = 'gather';
      } else {
        u.task = null; u.resourceTarget = null;
        if (u.side === 'britain') autoAssignAIWorkers();
      }
      return;
    }

    if (u.task === 'build') {
      const b = u.buildingTarget;
      if (!b || b.dead || b.complete) { u.task = null; u.buildingTarget = null; return; }
      if (Math.hypot(b.x - u.x, b.y - u.y) > Math.max(b.w, b.h) * 0.75) {
        moveToward(u, b.x, b.y, dt); return;
      }
      b.construction += dt * 0.20;
      b.hp = Math.min(b.maxHp, b.maxHp * b.construction);
      if (b.construction >= 1) {
        b.construction = 1; b.complete = true; b.hp = b.maxHp;
        u.task = null; u.buildingTarget = null;
        recalcPopCap(b.side);
        actionSignature = '';
        if (b.side === 'france') statusEl.textContent = `${BUILDINGS[b.type].label} voltooid.`;
        else aiPlan = `${BUILDINGS[b.type].label} voltooid`;
      }
    }
  }

  function findBuildLocation(side, type, index = 0) {
    const tc = livingBuildings(side).find(b => b.type === 'towncenter');
    if (!tc) return null;
    const dir = sideDir(side);
    const offsets = type === 'barracks'
      ? [[dir * 180, 140], [dir * 240, -160], [dir * 300, 200]]
      : [[dir * 120, -150], [dir * 160, 190], [dir * 230, -220], [dir * 260, 260]];
    const off = offsets[index % offsets.length];
    return { x: tc.x + off[0], y: tc.y + off[1] };
  }

  function validBuildingSpot(type, x, y) {
    const def = BUILDINGS[type];
    if (x < 100 || y < 100 || x > WORLD.width - 100 || y > WORLD.height - 100) return false;
    return !buildings.some(b => !b.dead && Math.abs(b.x - x) < (b.w + def.w) * 0.75 && Math.abs(b.y - y) < (b.h + def.h) * 0.75);
  }

  function constructBuilding(side, type, x, y, workers) {
    const cost = BUILDINGS[type].cost;
    if (!canAfford(side, cost) || !validBuildingSpot(type, x, y)) return null;
    pay(side, cost);
    const b = createBuilding(side, type, x, y, false);
    workers.filter(u => !u.dead).forEach((u, i) => {
      u.task = 'build'; u.buildingTarget = b;
      u.targetX = x + (i - workers.length / 2) * 13;
      u.targetY = y + BUILDINGS[type].h * 0.7;
    });
    return b;
  }

  function startBuild(type) {
    const workers = [...selectedUnits].filter(u => !u.dead && u.type === 'worker');
    if (!workers.length) { statusEl.textContent = 'Selecteer eerst één of meer boeren.'; return; }
    if (!canAfford('france', BUILDINGS[type].cost)) { statusEl.textContent = 'Niet genoeg hout.'; return; }
    buildMode = type; buildHintEl.classList.remove('hidden'); updateActionVisuals();
  }

  function placeBuilding(type, x, y) {
    const workers = [...selectedUnits].filter(u => !u.dead && u.type === 'worker');
    if (!workers.length) return;
    if (!validBuildingSpot(type, x, y)) { statusEl.textContent = 'Hier kun je niet bouwen.'; return; }
    const b = constructBuilding('france', type, x, y, workers);
    if (!b) { statusEl.textContent = 'Niet genoeg grondstoffen.'; return; }
    buildMode = null; buildHintEl.classList.add('hidden');
    statusEl.textContent = `${BUILDINGS[type].label} wordt gebouwd.`;
    updateHud(true);
  }

  function queueUnitForBuilding(side, building, type) {
    if (!building || building.dead || !building.complete || building.side !== side || !TRAINING[type]) return false;
    const info = TRAINING[type];
    if (!canAfford(side, info.cost)) return false;
    if (populationUsed(side) + TYPES[type].pop > economies[side].popCap) return false;
    pay(side, info.cost);
    building.queue.push({ type, label: TYPES[type].label, time: info.time });
    return true;
  }

  function queuePlayerUnit(type) {
    if (!selectedBuilding) return;
    if (!queueUnitForBuilding('france', selectedBuilding, type)) {
      if (populationUsed('france') + (TYPES[type]?.pop || 0) > economies.france.popCap) statusEl.textContent = 'Population cap bereikt. Bouw een House.';
      else statusEl.textContent = 'Niet genoeg grondstoffen.';
      return;
    }
    statusEl.textContent = `${TYPES[type].label} toegevoegd aan productie.`;
    updateHud();
  }

  function updateBuildings(dt) {
    for (const b of buildings) {
      if (b.dead || !b.complete || !b.queue.length) continue;
      b.production += dt / b.queue[0].time;
      if (b.production < 1) continue;
      const item = b.queue[0];
      if (populationUsed(b.side) + TYPES[item.type].pop > economies[b.side].popCap) {
        b.production = 0.99; continue;
      }
      b.queue.shift(); b.production = 0;
      const u = createUnit(b.side, item.type, b.x + sideDir(b.side) * b.w, b.y + b.h * 0.7);
      if (b.side === 'france') statusEl.textContent = `${TYPES[item.type].label} is klaar.`;
      else aiPlan = `${TYPES[item.type].label} getraind`;
      if (u.type === 'worker' && u.side === 'britain') autoAssignAIWorkers();
    }
  }
