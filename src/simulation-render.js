'use strict';
// ---------- Victory ----------
  function checkVictory() {
    if (gameOver) return;
    const frenchTC = livingBuildings('france').some(b => b.type === 'towncenter');
    const britishTC = livingBuildings('britain').some(b => b.type === 'towncenter');
    if (!britishTC) {
      gameOver = true; messageEl.textContent = 'FRANSE OVERWINNING'; messageEl.classList.remove('hidden');
    } else if (!frenchTC) {
      gameOver = true; messageEl.textContent = 'BRITSE OVERWINNING'; messageEl.classList.remove('hidden');
    }
  }

  // ---------- Update ----------
  function update(dt) {
    elapsed += dt;
    volleyClock = (volleyClock + dt) % 3.1;

    if (!gameOver) {
      units.forEach(u => updateUnit(u, dt));
      updateBuildings(dt);
      updateProjectiles(dt);
      updateParticles(dt);
      regiments.forEach(refreshRegiment);

      aiDecisionClock += dt;
      if (aiDecisionClock >= 2.0) {
        aiDecisionClock = 0;
        aiDevelop();
      }
      aiAttackClock += dt;
      if (aiAttackClock >= 8.0) {
        aiAttackClock = 0;
        aiMilitaryOrder();
      }
      checkVictory();
    } else {
      updateParticles(dt);
    }

    const speed = 520 / camera.zoom;
    if (keys.has('w') || keys.has('arrowup')) camera.y -= speed * dt;
    if (keys.has('s') || keys.has('arrowdown')) camera.y += speed * dt;
    if (keys.has('a') || keys.has('arrowleft')) camera.x -= speed * dt;
    if (keys.has('d') || keys.has('arrowright')) camera.x += speed * dt;
    clampCamera();
    updateHud();
  }

  // ---------- Drawing ----------
  function drawTerrain() {
    ctx.fillStyle = COLORS.grass; ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1 / camera.zoom;
    for (let x = 0; x < WORLD.width; x += 100) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD.height); ctx.stroke(); }
    for (let y = 0; y < WORLD.height; y += 100) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.width, y); ctx.stroke(); }
    ctx.fillStyle = 'rgba(219,201,146,.13)'; ctx.fillRect(0, 835, WORLD.width, 130);
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
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2;
        ctx.beginPath(); ctx.arc(r.x + Math.cos(a) * 10, r.y + Math.sin(a) * 7, 5 + ratio * 2, 0, Math.PI * 2); ctx.fill();
      }
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
    if (b.type === 'towncenter' || b.type === 'house') {
      ctx.beginPath(); ctx.moveTo(-b.w * 0.48, -b.h * 0.25); ctx.lineTo(0, -b.h * 0.72); ctx.lineTo(b.w * 0.48, -b.h * 0.25); ctx.fill();
    } else {
      ctx.fillRect(-b.w * 0.42, -b.h * 0.65, b.w * 0.84, b.h * 0.24);
    }
    if (selectedBuilding === b) {
      ctx.strokeStyle = COLORS.selected; ctx.lineWidth = 3 / camera.zoom; ctx.strokeRect(-b.w / 2 - 5, -b.h / 2 - 5, b.w + 10, b.h + 10);
    }
    if (!b.complete || b.queue.length) {
      const progress = b.complete ? b.production : b.construction;
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(-b.w / 2, b.h / 2 + 7, b.w, 6);
      ctx.fillStyle = b.complete ? '#d7bd61' : COLORS.selected; ctx.fillRect(-b.w / 2, b.h / 2 + 7, b.w * progress, 6);
    }
    if (b.hp < b.maxHp) {
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(-b.w / 2, -b.h / 2 - 10, b.w, 4);
      ctx.fillStyle = '#d56a58'; ctx.fillRect(-b.w / 2, -b.h / 2 - 10, b.w * Math.max(0, b.hp / b.maxHp), 4);
    }
    ctx.restore();
  }

  function drawUnit(u) {
    if (u.dead) return;
    const t = TYPES[u.type];
    const base = u.side === 'france' ? COLORS.france : COLORS.britain;
    const light = u.side === 'france' ? COLORS.franceLight : COLORS.britainLight;

    ctx.save(); ctx.translate(u.x, u.y); ctx.rotate(u.facing);
    if (selectedUnits.has(u)) {
      ctx.strokeStyle = COLORS.selected; ctx.lineWidth = 2 / camera.zoom;
      ctx.beginPath(); ctx.arc(0, 0, t.radius + 5, 0, Math.PI * 2); ctx.stroke();
    }
    if (u.regimentId) {
      ctx.strokeStyle = 'rgba(244,216,109,.65)'; ctx.lineWidth = 1.2 / camera.zoom;
      ctx.beginPath(); ctx.arc(0, 0, t.radius + 2, 0, Math.PI * 2); ctx.stroke();
    }

    if (u.type === 'cavalry') {
      ctx.fillStyle = '#5b4635'; ctx.beginPath(); ctx.ellipse(-2, 1, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (u.type === 'artillery') {
      ctx.strokeStyle = '#4b3b2b'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-10, 5); ctx.lineTo(13, -2); ctx.stroke();
      ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(-6, 7, 4, 0, Math.PI * 2); ctx.arc(6, 5, 4, 0, Math.PI * 2); ctx.fill();
    } else if (u.type === 'worker') {
      ctx.fillStyle = '#7d674a'; ctx.fillRect(-5, -5, 10, 11); ctx.fillStyle = base; ctx.fillRect(-5, -5, 10, 4);
    } else if (u.type === 'officer') {
      ctx.fillStyle = u.routing ? '#777' : base; ctx.beginPath(); ctx.arc(0, 0, t.radius, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f4d86d'; ctx.beginPath(); ctx.moveTo(-5,-7); ctx.lineTo(0,-13); ctx.lineTo(5,-7); ctx.fill();
      ctx.fillStyle = light; ctx.fillRect(1, -2, 11, 3);
    } else if (u.type === 'drummer') {
      ctx.fillStyle = u.routing ? '#777' : base; ctx.beginPath(); ctx.arc(0, 0, t.radius, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d7b25c'; ctx.fillRect(-6, 4, 12, 6); ctx.strokeStyle = '#f1e1aa'; ctx.lineWidth = 1.3; ctx.strokeRect(-6, 4, 12, 6);
    } else {
      ctx.fillStyle = u.routing ? '#777' : base; ctx.beginPath(); ctx.arc(0, 0, t.radius, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = light; ctx.fillRect(1, -2, t.radius + 5, 3);
    }

    ctx.rotate(-u.facing);
    if (u.carry > 0) {
      ctx.fillStyle = u.carryType === 'wood' ? '#8a5b31' : '#d6b75f'; ctx.fillRect(-5, -14, 10, 5);
    }
    if (u.type !== 'worker') {
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(-10, -17, 20, 3);
      ctx.fillStyle = u.morale > 55 ? '#d8d06a' : u.morale > 25 ? '#d49a4b' : '#b43f38';
      ctx.fillRect(-10, -17, 20 * (u.morale / 100), 3);
    }
    ctx.restore();
  }

  function drawRegimentMarkers() {
    for (const reg of regiments) {
      if (reg.destroyed) continue;
      const members = regimentMembers(reg);
      if (!members.length) continue;
      const c = centroid(members);
      ctx.fillStyle = 'rgba(20,20,15,.72)';
      ctx.fillRect(c.x - 48, c.y - 40, 96, 16);
      ctx.fillStyle = COLORS.regiment;
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${reg.side === 'france' ? '🇫🇷' : '🇬🇧'} R${reg.id} · ${formationLabel(reg.formation)}`, c.x, c.y - 28);
    }
    ctx.textAlign = 'start';
  }

  function drawProjectile(p) {
    ctx.fillStyle = p.artillery ? '#202020' : '#f0dfaa';
    ctx.beginPath(); ctx.arc(p.x, p.y, p.artillery ? 3.2 : 1.8, 0, Math.PI * 2); ctx.fill();
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife); ctx.fillStyle = COLORS.smoke;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.save();
    ctx.translate(innerWidth / 2, innerHeight / 2); ctx.scale(camera.zoom, camera.zoom); ctx.translate(-camera.x, -camera.y);
    drawTerrain();
    resources.forEach(drawResource);
    buildings.forEach(drawBuilding);
    units.forEach(drawUnit);
    drawRegimentMarkers();
    projectiles.forEach(drawProjectile);
    drawParticles();
    ctx.restore();

    if (drag.active && drag.moved && !buildMode) {
      ctx.strokeStyle = 'rgba(245,220,112,.9)'; ctx.fillStyle = 'rgba(245,220,112,.12)';
      const x = Math.min(drag.startX, drag.x), y = Math.min(drag.startY, drag.y), w = Math.abs(drag.x - drag.startX), h = Math.abs(drag.y - drag.startY);
      ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
    }
  }
