'use strict';
// ---------- Combat ----------
  function nearestEnemyEntity(unit, maxRange) {
    const otherSide = opposite(unit.side);
    let best = null, bestD2 = maxRange * maxRange;

    for (const other of units) {
      if (other.dead || other.side !== otherSide || other.routing || other.type === 'worker') continue;
      const dx = other.x - unit.x, dy = other.y - unit.y, d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; best = other; }
    }
    for (const b of buildings) {
      if (b.dead || b.side !== otherSide || !b.complete) continue;
      const dx = b.x - unit.x, dy = b.y - unit.y, d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; best = b; }
    }
    return best;
  }

  function moraleShock(victim, amount) {
    if (victim.kind !== 'unit') return;
    victim.morale = Math.max(0, victim.morale - amount);
    victim.recentHit = 2;
    if (victim.regimentId) {
      const reg = getRegiment(victim.regimentId);
      if (reg) {
        for (const u of regimentMembers(reg)) {
          if (u !== victim && Math.hypot(u.x - victim.x, u.y - victim.y) < 80) {
            u.morale = Math.max(0, u.morale - amount * 0.16);
          }
        }
      }
    }
  }

  function applyDamage(victim, damage, shock = 8) {
    if (!victim || victim.dead) return;
    victim.hp -= damage;
    if (victim.kind === 'unit') moraleShock(victim, shock + damage * 0.08);
    if (victim.hp > 0) return;

    victim.dead = true;
    if (victim.kind === 'unit') {
      victim.morale = 0;
      if (victim.regimentId) {
        const reg = getRegiment(victim.regimentId);
        if (reg) regimentMembers(reg).forEach(u => { if (!u.dead) u.morale = Math.max(0, u.morale - 5); });
      }
    }
  }

  function spawnSmoke(x, y, count) {
    for (let i = 0; i < count; i++) {
      particles.push({ x, y, vx: (Math.random() - 0.5) * 12, vy: -4 - Math.random() * 10, life: 0.7 + Math.random() * 0.8, maxLife: 1.5, size: 4 + Math.random() * 8 });
    }
  }
  function spawnImpact(x, y, count) {
    for (let i = 0; i < count; i++) {
      particles.push({ x, y, vx: (Math.random() - 0.5) * 45, vy: (Math.random() - 0.5) * 45, life: 0.25 + Math.random() * 0.35, maxLife: 0.6, size: 2 + Math.random() * 3 });
    }
  }

  function fire(unit, enemy) {
    const t = TYPES[unit.type];
    unit.reload = t.reload * (0.9 + Math.random() * 0.25);
    unit.facing = Math.atan2(enemy.y - unit.y, enemy.x - unit.x);

    if (unit.type === 'cavalry' || unit.type === 'worker' || unit.type === 'drummer') {
      const chargeBonus = unit.type === 'cavalry' && unit.chargeTimer > 0 ? 2 : 1;
      applyDamage(enemy, t.damage * chargeBonus * (0.85 + Math.random() * 0.3), unit.chargeTimer > 0 ? 24 : 7);
      spawnImpact(enemy.x, enemy.y, 3);
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

    projectiles.push({
      x: unit.x, y: unit.y, target: enemy, side: unit.side,
      damage: t.damage, speed: t.projectileSpeed, artillery: unit.type === 'artillery', dead: false
    });
    spawnSmoke(unit.x + Math.cos(unit.facing) * 9, unit.y + Math.sin(unit.facing) * 9, unit.type === 'artillery' ? 10 : 4);
  }

  function routeUnit(u) {
    if (u.routing || u.type === 'worker') return;
    u.routing = true; u.task = null; u.attackMode = 'fire'; u.chargeTimer = 0;
    u.targetX = u.side === 'france' ? 35 : WORLD.width - 35;
    u.targetY = Math.max(50, Math.min(WORLD.height - 50, u.y + (Math.random() - 0.5) * 300));
  }

  function moveToward(u, tx, ty, dt, speed = TYPES[u.type].speed) {
    const dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy);
    if (d <= 2) return true;
    const step = Math.min(d, speed * dt);
    u.x += dx / d * step; u.y += dy / d * step; u.facing = Math.atan2(dy, dx);
    return d <= 4;
  }

  function updateUnit(u, dt) {
    if (u.dead) return;
    u.reload -= dt; u.recentHit = Math.max(0, u.recentHit - dt); u.chargeTimer = Math.max(0, u.chargeTimer - dt);

    if (u.type === 'worker') {
      updateWorker(u, dt);
      return;
    }

    const reg = u.regimentId ? getRegiment(u.regimentId) : null;
    const regSupport = reg ? (regimentMembers(reg).some(m => m.id === reg.officerId) ? 0.55 : -0.5) + (regimentMembers(reg).some(m => m.id === reg.drummerId) ? 0.45 : 0) : 0;
    const near = nearestEnemyEntity(u, 180);
    if (!u.routing) {
      u.morale = Math.min(100, u.morale + (near ? 0.2 : 1.2 + regSupport) * dt);
      if (u.morale < 22) routeUnit(u);
    }

    if (u.routing) {
      moveToward(u, u.targetX, u.targetY, dt, TYPES[u.type].speed * 1.25);
      if ((u.side === 'france' && u.x < 45) || (u.side === 'britain' && u.x > WORLD.width - 45)) u.dead = true;
      return;
    }

    let range = TYPES[u.type].range;
    if (u.type === 'artillery' && u.artilleryMode === 'grape') range = 145;
    if (u.type === 'infantry' && u.attackMode === 'bayonet') range = 16;

    const enemy = nearestEnemyEntity(u, range);
    if (enemy && u.reload <= 0) {
      if (u.type !== 'infantry' && u.type !== 'officer' || volleyClock < 0.18 || u.attackMode === 'bayonet') fire(u, enemy);
    }

    const d = Math.hypot(u.targetX - u.x, u.targetY - u.y);
    if (d > 2) {
      const stop = enemy && u.type !== 'cavalry' && u.attackMode !== 'bayonet';
      if (!stop) moveToward(u, u.targetX, u.targetY, dt, TYPES[u.type].speed * (u.chargeTimer > 0 ? 1.45 : 1));
    }
    u.x = Math.max(8, Math.min(WORLD.width - 8, u.x));
    u.y = Math.max(8, Math.min(WORLD.height - 8, u.y));
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
          if (p.target.kind === 'building') applyDamage(p.target, p.damage * 0.8, 0);
        } else {
          applyDamage(p.target, p.damage * (0.75 + Math.random() * 0.5), 10);
          spawnImpact(p.target.x, p.target.y, 3);
        }
        p.dead = true;
      } else {
        const step = Math.min(d, p.speed * dt);
        p.x += dx / d * step; p.y += dy / d * step;
      }
    }
    for (let i = projectiles.length - 1; i >= 0; i--) if (projectiles[i].dead) projectiles.splice(i, 1);
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; p.vy *= 0.97;
    }
    for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
  }

  function bayonetCommand() {
    const group = [...selectedUnits].filter(u => !u.dead && !u.routing && (u.type === 'infantry' || u.type === 'officer'));
    if (!group.length) return;
    const enemies = livingUnits('britain').filter(u => !u.routing);
    if (!enemies.length) return;
    const c = centroid(group);
    let target = enemies[0], bestD = Infinity;
    for (const e of enemies) {
      const d = Math.hypot(e.x - c.x, e.y - c.y);
      if (d < bestD) { bestD = d; target = e; }
    }
    group.forEach(u => { u.attackMode = 'bayonet'; u.chargeTimer = 6; u.morale = Math.min(100, u.morale + 8); });
    issueMove(target.x, target.y);
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

  // ---------- AI development ----------
  function aiBuild(type) {
    const workers = livingUnits('britain').filter(u => u.type === 'worker' && !u.dead);
    if (!workers.length) return false;
    const builders = workers.slice(0, Math.min(2, workers.length));
    let index = livingBuildings('britain').filter(b => b.type === type).length;
    for (let tries = 0; tries < 5; tries++) {
      const p = findBuildLocation('britain', type, index + tries);
      if (p && validBuildingSpot(type, p.x, p.y)) {
        const b = constructBuilding('britain', type, p.x, p.y, builders);
        if (b) {
          aiPlan = `${BUILDINGS[type].label} bouwen`;
          return true;
        }
      }
    }
    return false;
  }

  function aiQueue(type, buildingType) {
    const b = livingBuildings('britain').find(x => x.type === buildingType && x.complete && x.queue.length < 2);
    if (!b) return false;
    const ok = queueUnitForBuilding('britain', b, type);
    if (ok) aiPlan = `${TYPES[type].label} trainen`;
    return ok;
  }

  function aiTryFormRegiment() {
    const infantry = freeUnits('britain', 'infantry');
    const officer = freeUnits('britain', 'officer')[0];
    const drummer = freeUnits('britain', 'drummer')[0];
    if (infantry.length < 12 || !officer || !drummer) return null;
    const reg = createRegiment('britain', [...infantry.slice(0, 18), officer, drummer]);
    if (reg) {
      aiPlan = `${reg.name} gevormd`;
      return reg;
    }
    return null;
  }

  function aiDevelop() {
    if (gameOver) return;
    recalcPopCap('britain');
    autoAssignAIWorkers();

    const e = economies.britain;
    const workers = livingUnits('britain').filter(u => u.type === 'worker').length;
    const barracks = livingBuildings('britain').filter(b => b.type === 'barracks');
    const completeBarracks = barracks.filter(b => b.complete);
    const houses = livingBuildings('britain').filter(b => b.type === 'house');
    const regs = activeRegiments('britain');

    if (workers < 8 && aiQueue('worker', 'towncenter')) return;

    if (!barracks.length && e.wood >= 300) {
      if (aiBuild('barracks')) return;
    }

    if (populationUsed('britain') >= e.popCap - 5 && e.wood >= 120) {
      if (aiBuild('house')) return;
    }

    if (regs.length >= 1 && completeBarracks.length < 2 && e.wood >= 450) {
      if (aiBuild('barracks')) return;
    }

    if (!completeBarracks.length) {
      aiPlan = barracks.length ? 'Barracks afbouwen' : 'hout sparen voor Barracks';
      return;
    }

    if (freeUnits('britain', 'infantry').length < 12) {
      if (aiQueue('infantry', 'barracks')) return;
    }
    if (!freeUnits('britain', 'officer').length) {
      if (aiQueue('officer', 'barracks')) return;
    }
    if (!freeUnits('britain', 'drummer').length) {
      if (aiQueue('drummer', 'barracks')) return;
    }

    const formed = aiTryFormRegiment();
    if (formed) return;

    if (regs.length < 3 && freeUnits('britain', 'infantry').length < 12) aiQueue('infantry', 'barracks');
    else aiPlan = regs.length ? 'leger versterken' : 'regiment voorbereiden';

    if (houses.length < 1 && e.wood > 300 && e.popCap < 50) aiBuild('house');
  }

  function aiMilitaryOrder() {
    const regs = activeRegiments('britain');
    const frenchTargets = livingUnits('france').filter(u => u.type !== 'worker' && !u.routing);
    const frenchTC = livingBuildings('france').find(b => b.type === 'towncenter');
    if (!regs.length) return;

    const attackReady = elapsed > 55 || regs.length >= 2;
    if (!attackReady) {
      aiPlan = 'eerste regiment verdedigt de basis';
      regs.forEach((reg, i) => {
        const tc = livingBuildings('britain').find(b => b.type === 'towncenter');
        if (tc) arrangeRegiment(reg, tc.x - 230, tc.y + (i - (regs.length - 1) / 2) * 120, 'line');
      });
      return;
    }

    const target = frenchTargets.length ? centroid(frenchTargets) : frenchTC ? { x: frenchTC.x, y: frenchTC.y } : { x: 650, y: 900 };
    regs.forEach((reg, i) => {
      const mode = i % 3 === 2 ? 'square' : i % 2 === 0 ? 'line' : 'column';
      arrangeRegiment(reg, target.x + 170 + i * 45, target.y + (i - (regs.length - 1) / 2) * 120, mode);
    });

    const cav = livingUnits('britain').filter(u => u.type === 'cavalry' && !u.routing);
    if (cav.length) {
      cav.forEach(u => u.chargeTimer = 7);
      commandLooseFormation(cav, target.x + 30, target.y - 150, 'column');
    }
    const art = livingUnits('britain').filter(u => u.type === 'artillery' && !u.routing);
    if (art.length) commandLooseFormation(art, target.x + 380, target.y + 150, 'line');
    aiPlan = `${regs.length} regiment${regs.length > 1 ? 'en' : ''} vallen aan`;
  }
