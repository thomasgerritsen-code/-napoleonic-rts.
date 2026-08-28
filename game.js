(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const selectedCountEl = document.getElementById('selectedCount');
  const frenchCountEl = document.getElementById('frenchCount');
  const britishCountEl = document.getElementById('britishCount');
  const statusEl = document.getElementById('status');
  const messageEl = document.getElementById('message');

  const WORLD = { width: 2400, height: 1500 };
  const camera = { x: 390, y: 270, zoom: 0.82 };
  const keys = new Set();
  const units = [];
  const projectiles = [];
  const particles = [];
  const selected = new Set();
  let nextUnitId = 1;
  let lastTime = performance.now();
  let gameOver = false;
  let aiClock = 0;

  const drag = { active: false, startX: 0, startY: 0, x: 0, y: 0, moved: false };
  let touchStart = null;

  const TYPES = {
    infantry: { radius: 6, speed: 54, hp: 100, range: 102, damage: 18, cooldown: 1.35, projectileSpeed: 360 },
    cavalry:  { radius: 8, speed: 92, hp: 150, range: 18, damage: 30, cooldown: 0.9, projectileSpeed: 0 },
    artillery:{ radius: 10, speed: 28, hp: 190, range: 270, damage: 72, cooldown: 4.2, projectileSpeed: 255 }
  };

  const COLORS = {
    grass: '#647a4d',
    grid: 'rgba(255,255,255,.035)',
    france: '#244d9a',
    franceLight: '#9dbaf2',
    britain: '#a5322f',
    britainLight: '#f1aaa1',
    outline: '#181914',
    selected: '#f7df73',
    smoke: 'rgba(230,226,210,.62)'
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
    units.push({
      id: nextUnitId++, side, type, x, y, targetX: x, targetY: y,
      hp: t.hp, maxHp: t.hp, cooldown: Math.random() * t.cooldown,
      facing: side === 'france' ? 0 : Math.PI,
      dead: false
    });
  }

  function spawnFormation(side, type, startX, startY, rows, cols, spacingX, spacingY) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const sx = side === 'france' ? c : -c;
        createUnit(side, type, startX + sx * spacingX, startY + r * spacingY);
      }
    }
  }

  function resetGame() {
    units.length = 0;
    projectiles.length = 0;
    particles.length = 0;
    selected.clear();
    nextUnitId = 1;
    gameOver = false;
    aiClock = 0;
    messageEl.classList.add('hidden');
    camera.x = 390; camera.y = 270; camera.zoom = 0.82;

    spawnFormation('france', 'infantry', 520, 530, 6, 22, 17, 17);
    spawnFormation('france', 'infantry', 520, 710, 5, 18, 17, 17);
    spawnFormation('france', 'cavalry', 455, 400, 4, 8, 22, 22);
    spawnFormation('france', 'artillery', 610, 865, 2, 6, 38, 34);

    spawnFormation('britain', 'infantry', 1900, 505, 6, 22, 17, 17);
    spawnFormation('britain', 'infantry', 1900, 710, 5, 18, 17, 17);
    spawnFormation('britain', 'cavalry', 1970, 390, 4, 8, 22, 22);
    spawnFormation('britain', 'artillery', 1810, 865, 2, 6, 38, 34);

    updateHud();
    statusEl.textContent = 'Sleep over Franse troepen en geef een verplaatsingsbevel.';
  }

  function screenToWorld(sx, sy) {
    return {
      x: (sx - innerWidth / 2) / camera.zoom + camera.x,
      y: (sy - innerHeight / 2) / camera.zoom + camera.y
    };
  }

  function worldToScreen(wx, wy) {
    return {
      x: (wx - camera.x) * camera.zoom + innerWidth / 2,
      y: (wy - camera.y) * camera.zoom + innerHeight / 2
    };
  }

  function clampCamera() {
    const halfW = innerWidth / (2 * camera.zoom);
    const halfH = innerHeight / (2 * camera.zoom);
    camera.x = Math.max(halfW, Math.min(WORLD.width - halfW, camera.x));
    camera.y = Math.max(halfH, Math.min(WORLD.height - halfH, camera.y));
  }

  function living(side) {
    return units.filter(u => !u.dead && u.side === side);
  }

  function updateHud() {
    for (const u of [...selected]) if (u.dead) selected.delete(u);
    selectedCountEl.textContent = selected.size;
    frenchCountEl.textContent = living('france').length;
    britishCountEl.textContent = living('britain').length;
  }

  function nearestEnemy(unit, maxRange) {
    let best = null;
    let bestD2 = maxRange * maxRange;
    for (const other of units) {
      if (other.dead || other.side === unit.side) continue;
      const dx = other.x - unit.x, dy = other.y - unit.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; best = other; }
    }
    return best;
  }

  function fire(unit, enemy) {
    const t = TYPES[unit.type];
    unit.cooldown = t.cooldown * (0.85 + Math.random() * 0.3);
    unit.facing = Math.atan2(enemy.y - unit.y, enemy.x - unit.x);

    if (unit.type === 'cavalry') {
      enemy.hp -= t.damage * (0.8 + Math.random() * 0.4);
      spawnImpact(enemy.x, enemy.y, 5);
      if (enemy.hp <= 0) enemy.dead = true;
      return;
    }

    projectiles.push({
      x: unit.x, y: unit.y,
      target: enemy,
      side: unit.side,
      damage: t.damage,
      speed: t.projectileSpeed,
      artillery: unit.type === 'artillery',
      dead: false
    });
    spawnSmoke(unit.x + Math.cos(unit.facing) * 9, unit.y + Math.sin(unit.facing) * 9, unit.type === 'artillery' ? 8 : 3);
  }

  function spawnSmoke(x, y, amount) {
    for (let i = 0; i < amount; i++) {
      particles.push({ x, y, vx: (Math.random() - .5) * 12, vy: -4 - Math.random() * 10, life: .7 + Math.random() * .8, maxLife: 1.5, size: 4 + Math.random() * 8 });
    }
  }
  function spawnImpact(x, y, amount) {
    for (let i = 0; i < amount; i++) {
      particles.push({ x, y, vx: (Math.random() - .5) * 45, vy: (Math.random() - .5) * 45, life: .25 + Math.random() * .35, maxLife: .6, size: 2 + Math.random() * 3 });
    }
  }

  function updateUnit(unit, dt) {
    if (unit.dead) return;
    unit.cooldown -= dt;
    const t = TYPES[unit.type];
    const enemy = nearestEnemy(unit, t.range);
    if (enemy && unit.cooldown <= 0) fire(unit, enemy);

    const dx = unit.targetX - unit.x, dy = unit.targetY - unit.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 2) {
      const stopForCombat = enemy && unit.type !== 'cavalry';
      if (!stopForCombat) {
        const step = Math.min(dist, t.speed * dt);
        unit.x += dx / dist * step;
        unit.y += dy / dist * step;
        unit.facing = Math.atan2(dy, dx);
      }
    }
    unit.x = Math.max(8, Math.min(WORLD.width - 8, unit.x));
    unit.y = Math.max(8, Math.min(WORLD.height - 8, unit.y));
  }

  function updateProjectiles(dt) {
    for (const p of projectiles) {
      if (p.dead) continue;
      if (!p.target || p.target.dead) { p.dead = true; continue; }
      const dx = p.target.x - p.x, dy = p.target.y - p.y;
      const dist = Math.hypot(dx, dy);
      const hitRadius = p.artillery ? 12 : 6;
      if (dist <= hitRadius) {
        if (p.artillery) {
          spawnImpact(p.target.x, p.target.y, 16);
          spawnSmoke(p.target.x, p.target.y, 12);
          for (const u of units) {
            if (u.dead || u.side === p.side) continue;
            const d = Math.hypot(u.x - p.target.x, u.y - p.target.y);
            if (d < 36) {
              u.hp -= p.damage * Math.max(.25, 1 - d / 44);
              if (u.hp <= 0) u.dead = true;
            }
          }
        } else {
          p.target.hp -= p.damage * (0.75 + Math.random() * .5);
          spawnImpact(p.target.x, p.target.y, 3);
          if (p.target.hp <= 0) p.target.dead = true;
        }
        p.dead = true;
      } else {
        const step = Math.min(dist, p.speed * dt);
        p.x += dx / dist * step;
        p.y += dy / dist * step;
      }
    }
    for (let i = projectiles.length - 1; i >= 0; i--) if (projectiles[i].dead) projectiles.splice(i, 1);
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= .97; p.vy *= .97;
    }
    for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
  }

  function commandFormation(group, x, y, mode = 'line') {
    if (!group.length) return;
    const n = group.length;
    let cols, spacingX = 18, spacingY = 18;
    if (mode === 'line') { cols = Math.min(28, n); spacingX = 17; spacingY = 19; }
    else if (mode === 'column') { cols = Math.min(7, Math.ceil(Math.sqrt(n))); spacingX = 19; spacingY = 17; }
    else { cols = Math.max(4, Math.ceil(Math.sqrt(n))); spacingX = 19; spacingY = 19; }

    const rows = Math.ceil(n / cols);
    const sorted = [...group].sort((a,b) => a.type.localeCompare(b.type) || a.id - b.id);
    sorted.forEach((u, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      let ox = (col - (cols - 1) / 2) * spacingX;
      let oy = (row - (rows - 1) / 2) * spacingY;

      if (mode === 'square' && n >= 12) {
        const side = Math.ceil(Math.sqrt(n));
        const perim = Math.max(4, side * 4 - 4);
        const k = i % perim;
        const s = (side - 1) * spacingX;
        if (k < side) { ox = -s/2 + k*spacingX; oy = -s/2; }
        else if (k < side*2-1) { ox = s/2; oy = -s/2 + (k-side+1)*spacingY; }
        else if (k < side*3-2) { ox = s/2 - (k-(side*2-1)+1)*spacingX; oy = s/2; }
        else { ox = -s/2; oy = s/2 - (k-(side*3-2)+1)*spacingY; }
      }
      u.targetX = Math.max(20, Math.min(WORLD.width - 20, x + ox));
      u.targetY = Math.max(20, Math.min(WORLD.height - 20, y + oy));
    });
  }

  function centroid(group) {
    if (!group.length) return { x: camera.x, y: camera.y };
    let x = 0, y = 0;
    for (const u of group) { x += u.x; y += u.y; }
    return { x: x / group.length, y: y / group.length };
  }

  function issueMove(x, y, mode = 'line') {
    const group = [...selected].filter(u => !u.dead);
    if (!group.length) return;
    commandFormation(group, x, y, mode);
    statusEl.textContent = `${group.length} eenheden bewegen in ${mode === 'square' ? 'carré' : mode === 'column' ? 'colonne' : 'linie'}.`;
  }

  function aiOrder() {
    const british = living('britain');
    const french = living('france');
    if (!british.length || !french.length) return;
    const f = centroid(french);
    const groups = {
      infantry: british.filter(u => u.type === 'infantry'),
      cavalry: british.filter(u => u.type === 'cavalry'),
      artillery: british.filter(u => u.type === 'artillery')
    };
    commandFormation(groups.infantry, f.x + 240, f.y, 'line');
    commandFormation(groups.cavalry, f.x + 70, f.y - 120, 'column');
    commandFormation(groups.artillery, f.x + 390, f.y + 120, 'line');
  }

  function checkVictory() {
    if (gameOver) return;
    const f = living('france').length;
    const b = living('britain').length;
    if (f === 0 || b === 0) {
      gameOver = true;
      messageEl.textContent = b === 0 ? 'FRANSE OVERWINNING' : 'BRITSE OVERWINNING';
      messageEl.classList.remove('hidden');
    }
  }

  function update(dt) {
    if (!gameOver) {
      for (const u of units) updateUnit(u, dt);
      updateProjectiles(dt);
      updateParticles(dt);
      aiClock += dt;
      if (aiClock > 7.5) { aiClock = 0; aiOrder(); }
      checkVictory();
    } else {
      updateParticles(dt);
    }

    const camSpeed = 520 * dt / camera.zoom;
    if (keys.has('w') || keys.has('arrowup')) camera.y -= camSpeed;
    if (keys.has('s') || keys.has('arrowdown')) camera.y += camSpeed;
    if (keys.has('a') || keys.has('arrowleft')) camera.x -= camSpeed;
    if (keys.has('d') || keys.has('arrowright')) camera.x += camSpeed;
    clampCamera();
  }

  function drawGround() {
    ctx.fillStyle = COLORS.grass;
    ctx.fillRect(0, 0, innerWidth, innerHeight);
    const tl = screenToWorld(0, 0), br = screenToWorld(innerWidth, innerHeight);
    const grid = 100;
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (let x = Math.floor(tl.x / grid) * grid; x < br.x; x += grid) {
      const a = worldToScreen(x, tl.y), b = worldToScreen(x, br.y);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (let y = Math.floor(tl.y / grid) * grid; y < br.y; y += grid) {
      const a = worldToScreen(tl.x, y), b = worldToScreen(br.x, y);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }

    ctx.save();
    ctx.globalAlpha = .13;
    ctx.strokeStyle = '#bba476';
    ctx.lineWidth = 34 * camera.zoom;
    const p1 = worldToScreen(0, 1040), p2 = worldToScreen(2400, 940);
    ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.bezierCurveTo(innerWidth*.35, p1.y-40, innerWidth*.65, p2.y+40, p2.x,p2.y); ctx.stroke();
    ctx.restore();
  }

  function drawUnit(u) {
    if (u.dead) return;
    const s = worldToScreen(u.x, u.y);
    const t = TYPES[u.type];
    const r = Math.max(3, t.radius * camera.zoom);
    if (s.x < -20 || s.x > innerWidth+20 || s.y < -20 || s.y > innerHeight+20) return;

    if (selected.has(u)) {
      ctx.beginPath(); ctx.arc(s.x, s.y, r + 5, 0, Math.PI*2);
      ctx.strokeStyle = COLORS.selected; ctx.lineWidth = 2; ctx.stroke();
    }

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(u.facing);
    ctx.fillStyle = u.side === 'france' ? COLORS.france : COLORS.britain;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.2;

    if (u.type === 'infantry') {
      ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = u.side === 'france' ? COLORS.franceLight : COLORS.britainLight;
      ctx.beginPath(); ctx.moveTo(r*.7,0); ctx.lineTo(r+5,0); ctx.stroke();
    } else if (u.type === 'cavalry') {
      ctx.beginPath(); ctx.ellipse(0,0,r+2,r-1,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(r,0); ctx.lineTo(r+7,0); ctx.stroke();
    } else {
      ctx.fillRect(-r,-r*.6,r*2,r*1.2); ctx.strokeRect(-r,-r*.6,r*2,r*1.2);
      ctx.beginPath(); ctx.moveTo(r,0); ctx.lineTo(r+11,0); ctx.stroke();
      ctx.beginPath(); ctx.arc(-r*.65,r*.75,2.7,0,Math.PI*2); ctx.arc(r*.65,r*.75,2.7,0,Math.PI*2); ctx.fillStyle='#282922'; ctx.fill();
    }
    ctx.restore();

    if (u.hp < u.maxHp) {
      const w = 16 * camera.zoom;
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(s.x-w/2, s.y-r-7, w, 2.5);
      ctx.fillStyle = '#d7d6bd'; ctx.fillRect(s.x-w/2, s.y-r-7, w*(u.hp/u.maxHp), 2.5);
    }
  }

  function drawProjectiles() {
    for (const p of projectiles) {
      const s = worldToScreen(p.x,p.y);
      ctx.fillStyle = p.artillery ? '#191812' : '#f0df9c';
      ctx.beginPath(); ctx.arc(s.x,s.y,p.artillery?3.2:1.7,0,Math.PI*2); ctx.fill();
    }
  }

  function drawParticles() {
    for (const p of particles) {
      const s = worldToScreen(p.x,p.y);
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = COLORS.smoke;
      ctx.beginPath(); ctx.arc(s.x,s.y,p.size*camera.zoom,0,Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawSelectionBox() {
    if (!drag.active || !drag.moved) return;
    const x = Math.min(drag.startX, drag.x), y = Math.min(drag.startY, drag.y);
    const w = Math.abs(drag.x-drag.startX), h = Math.abs(drag.y-drag.startY);
    ctx.fillStyle = 'rgba(247,223,115,.10)';
    ctx.strokeStyle = 'rgba(247,223,115,.95)';
    ctx.lineWidth = 1;
    ctx.fillRect(x,y,w,h); ctx.strokeRect(x,y,w,h);
  }

  function drawWorldBounds() {
    const a = worldToScreen(0,0), b = worldToScreen(WORLD.width,WORLD.height);
    ctx.strokeStyle = 'rgba(30,25,18,.35)'; ctx.lineWidth = 5;
    ctx.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y);
  }

  function render() {
    ctx.clearRect(0,0,innerWidth,innerHeight);
    drawGround();
    drawWorldBounds();
    for (const u of units) drawUnit(u);
    drawProjectiles();
    drawParticles();
    drawSelectionBox();
  }

  function selectAt(sx, sy, additive = false) {
    const w = screenToWorld(sx,sy);
    let best = null, bestD2 = (18/camera.zoom) ** 2;
    for (const u of units) {
      if (u.dead || u.side !== 'france') continue;
      const dx=u.x-w.x, dy=u.y-w.y, d2=dx*dx+dy*dy;
      if (d2<bestD2) { bestD2=d2; best=u; }
    }
    if (!additive) selected.clear();
    if (best) selected.add(best);
    updateHud();
  }

  canvas.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    drag.active = true; drag.startX = drag.x = e.clientX; drag.startY = drag.y = e.clientY; drag.moved = false;
  });
  canvas.addEventListener('mousemove', e => {
    if (!drag.active) return;
    drag.x=e.clientX; drag.y=e.clientY;
    if (Math.hypot(drag.x-drag.startX,drag.y-drag.startY)>5) drag.moved=true;
  });
  addEventListener('mouseup', e => {
    if (!drag.active || e.button !== 0) return;
    drag.active=false;
    if (!drag.moved) {
      selectAt(e.clientX,e.clientY,e.shiftKey);
    } else {
      const a=screenToWorld(Math.min(drag.startX,drag.x),Math.min(drag.startY,drag.y));
      const b=screenToWorld(Math.max(drag.startX,drag.x),Math.max(drag.startY,drag.y));
      if (!e.shiftKey) selected.clear();
      for (const u of units) if (!u.dead && u.side==='france' && u.x>=a.x&&u.x<=b.x&&u.y>=a.y&&u.y<=b.y) selected.add(u);
      updateHud();
    }
  });
  canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
    const w=screenToWorld(e.clientX,e.clientY);
    issueMove(w.x,w.y,'line');
  });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const before=screenToWorld(e.clientX,e.clientY);
    camera.zoom=Math.max(.45,Math.min(1.75,camera.zoom*Math.exp(-e.deltaY*.0012)));
    const after=screenToWorld(e.clientX,e.clientY);
    camera.x += before.x-after.x; camera.y += before.y-after.y;
    clampCamera();
  }, {passive:false});

  canvas.addEventListener('touchstart', e => {
    if (e.touches.length!==1) return;
    const t=e.touches[0]; touchStart={x:t.clientX,y:t.clientY,time:performance.now()};
  }, {passive:false});
  canvas.addEventListener('touchend', e => {
    if (!touchStart || !e.changedTouches.length) return;
    const t=e.changedTouches[0];
    const moved=Math.hypot(t.clientX-touchStart.x,t.clientY-touchStart.y);
    if (moved<18) {
      const w=screenToWorld(t.clientX,t.clientY);
      let nearFriendly=false;
      for (const u of units) {
        if (!u.dead&&u.side==='france'&&Math.hypot(u.x-w.x,u.y-w.y)<24/camera.zoom) { nearFriendly=true; break; }
      }
      if (nearFriendly || selected.size===0) selectAt(t.clientX,t.clientY,false);
      else issueMove(w.x,w.y,'line');
    }
    touchStart=null;
  }, {passive:false});

  addEventListener('keydown', e => { keys.add(e.key.toLowerCase()); });
  addEventListener('keyup', e => { keys.delete(e.key.toLowerCase()); });

  document.querySelectorAll('[data-formation]').forEach(btn => btn.addEventListener('click', () => {
    const group=[...selected].filter(u=>!u.dead);
    const c=centroid(group);
    const mode=btn.dataset.formation;
    commandFormation(group,c.x,c.y,mode);
    statusEl.textContent=`Formatie gewijzigd naar ${mode==='square'?'carré':mode==='column'?'colonne':'linie'}.`;
  }));
  document.getElementById('resetBtn').addEventListener('click', resetGame);

  function loop(now) {
    const dt=Math.min(.035,(now-lastTime)/1000); lastTime=now;
    update(dt); render();
    if ((now|0)%400<18) updateHud();
    requestAnimationFrame(loop);
  }

  resetGame();
  setTimeout(aiOrder, 4500);
  requestAnimationFrame(loop);
})();
