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
  const camera = { x: 650, y: 800, zoom: 0.76 };
  const keys = new Set();
  const units = [];
  const buildings = [];
  const resources = [];
  const projectiles = [];
  const particles = [];
  const selectedUnits = new Set();
  let selectedBuilding = null;
  let nextId = 1;
  let lastTime = performance.now();
  let gameOver = false;
  let aiClock = 0;
  let buildMode = null;
  let currentFormation = 'line';
  const drag = { active: false, startX: 0, startY: 0, x: 0, y: 0, moved: false };

  const economy = { food: 1000, wood: 1000, popCap: 20 };

  const TYPES = {
    worker:    { radius: 7, speed: 70, hp: 65,  range: 12,  damage: 7,  cooldown: 1.1, projectileSpeed: 0, pop: 1, label: 'Boer' },
    infantry: { radius: 6, speed: 56, hp: 100, range: 110, damage: 18, cooldown: 1.4, projectileSpeed: 380, pop: 1, label: 'Musketier' },
    cavalry:  { radius: 9, speed: 96, hp: 155, range: 18,  damage: 32, cooldown: .9, projectileSpeed: 0, pop: 2, label: 'Cavalerie' },
    artillery:{ radius: 11,speed: 30, hp: 195, range: 285, damage: 74, cooldown: 4.2, projectileSpeed: 265, pop: 3, label: 'Artillerie' }
  };

  const BUILDINGS = {
    towncenter: { w: 92, h: 76, hp: 1200, label: 'Town Center', pop: 20 },
    barracks:   { w: 80, h: 58, hp: 800,  label: 'Barracks', cost: { wood: 300 } },
    house:      { w: 54, h: 48, hp: 420,  label: 'House', cost: { wood: 120 }, pop: 10 }
  };

  const COLORS = {
    grass: '#65784f', grid: 'rgba(255,255,255,.035)', france: '#244d9a', franceLight: '#a9c2f2',
    britain: '#a5322f', britainLight: '#f1aaa1', outline: '#171914', selected: '#f5dc70',
    smoke: 'rgba(232,227,211,.64)', tree: '#234b2b', tree2: '#38663c', food: '#b78d45', building: '#a58a67'
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
    const unit = {
      id: nextId++, kind: 'unit', side, type, x, y, targetX: x, targetY: y,
      hp: t.hp, maxHp: t.hp, cooldown: Math.random() * t.cooldown,
      facing: side === 'france' ? 0 : Math.PI, dead: false,
      task: null, resourceTarget: null, carryType: null, carry: 0, gatherClock: 0, returnResource: null
    };
    units.push(unit);
    return unit;
  }

  function createBuilding(side, type, x, y, complete = true) {
    const b = BUILDINGS[type];
    const building = {
      id: nextId++, kind: 'building', side, type, x, y, w: b.w, h: b.h,
      hp: complete ? b.hp : Math.round(b.hp * .15), maxHp: b.hp,
      complete, construction: complete ? 1 : .15, dead: false,
      queue: [], production: 0
    };
    buildings.push(building);
    return building;
  }

  function createResource(type, x, y, amount) {
    resources.push({ id: nextId++, kind: 'resource', type, x, y, amount, maxAmount: amount, radius: type === 'wood' ? 20 : 18, dead: false });
  }

  function spawnLine(side, type, x, y, count, cols = 12, spacing = 18) {
    for (let i = 0; i < count; i++) {
      const c = i % cols, r = Math.floor(i / cols);
      const dir = side === 'france' ? 1 : -1;
      createUnit(side, type, x + dir * c * spacing, y + r * spacing);
    }
  }

  function populationUsed() {
    return units.filter(u => !u.dead && u.side === 'france').reduce((n, u) => n + TYPES[u.type].pop, 0);
  }

  function recalcPopCap() {
    economy.popCap = buildings.filter(b => !b.dead && b.side === 'france' && b.complete).reduce((sum, b) => sum + (BUILDINGS[b.type].pop || 0), 0);
  }

  function resetGame() {
    units.length = buildings.length = resources.length = projectiles.length = particles.length = 0;
    selectedUnits.clear(); selectedBuilding = null; nextId = 1; gameOver = false; aiClock = 0; buildMode = null;
    economy.food = 1000; economy.wood = 1000; economy.popCap = 20;
    camera.x = 650; camera.y = 800; camera.zoom = .76;
    messageEl.classList.add('hidden'); buildHintEl.classList.add('hidden');

    createBuilding('france', 'towncenter', 520, 820, true);
    for (let i = 0; i < 6; i++) createUnit('france', 'worker', 610 + (i % 3) * 24, 770 + Math.floor(i / 3) * 28);
    spawnLine('france', 'infantry', 670, 940, 24, 12, 18);

    createBuilding('britain', 'towncenter', 2280, 820, true);
    createBuilding('britain', 'barracks', 2180, 970, true);
    spawnLine('britain', 'infantry', 2080, 690, 44, 15, 18);
    spawnLine('britain', 'cavalry', 2290, 600, 10, 5, 24);
    spawnLine('britain', 'artillery', 2140, 1040, 4, 4, 42);

    const forests = [
      [330,530],[390,570],[450,535],[305,610],[370,645],[455,630],[760,420],[825,455],[890,410],
      [980,1230],[1045,1280],[1120,1240],[1000,1330],[1090,1360],[1210,1300]
    ];
    forests.forEach(([x,y]) => {
      for (let i = 0; i < 5; i++) createResource('wood', x + (Math.random()-.5)*45, y + (Math.random()-.5)*45, 180);
    });
    [[690,610],[750,640],[810,610],[710,680],[790,690]].forEach(([x,y]) => createResource('food', x, y, 320));

    recalcPopCap(); updateHud(); updateActionButtons();
    statusEl.textContent = 'Selecteer boeren en rechtsklik op bomen of voedsel om te verzamelen.';
  }

  function screenToWorld(sx, sy) {
    return { x: (sx - innerWidth / 2) / camera.zoom + camera.x, y: (sy - innerHeight / 2) / camera.zoom + camera.y };
  }
  function worldToScreen(wx, wy) {
    return { x: (wx - camera.x) * camera.zoom + innerWidth / 2, y: (wy - camera.y) * camera.zoom + innerHeight / 2 };
  }
  function clampCamera() {
    const halfW = innerWidth / (2 * camera.zoom), halfH = innerHeight / (2 * camera.zoom);
    camera.x = Math.max(halfW, Math.min(WORLD.width - halfW, camera.x));
    camera.y = Math.max(halfH, Math.min(WORLD.height - halfH, camera.y));
  }

  function livingUnits(side) { return units.filter(u => !u.dead && u.side === side); }
  function livingBuildings(side) { return buildings.filter(b => !b.dead && b.side === side); }

  function updateHud() {
    for (const u of [...selectedUnits]) if (u.dead) selectedUnits.delete(u);
    if (selectedBuilding && selectedBuilding.dead) selectedBuilding = null;
    recalcPopCap();
    foodEl.textContent = Math.floor(economy.food);
    woodEl.textContent = Math.floor(economy.wood);
    populationEl.textContent = `${populationUsed()}/${economy.popCap}`;
    frenchCountEl.textContent = livingUnits('france').length;
    britishCountEl.textContent = livingUnits('britain').length;

    if (selectedBuilding) {
      const b = selectedBuilding;
      const label = BUILDINGS[b.type].label;
      selectionTitleEl.textContent = label;
      if (!b.complete) selectionDetailsEl.textContent = `In aanbouw · ${Math.floor(b.construction * 100)}%`;
      else if (b.queue.length) selectionDetailsEl.textContent = `Productie: ${b.queue[0].label} · ${Math.floor(b.production * 100)}%`;
      else selectionDetailsEl.textContent = `${Math.max(0, Math.floor(b.hp))}/${b.maxHp} HP`;
    } else if (selectedUnits.size) {
      const group = [...selectedUnits];
      const workers = group.filter(u => u.type === 'worker').length;
      selectionTitleEl.textContent = group.length === 1 ? TYPES[group[0].type].label : `${group.length} eenheden`;
      selectionDetailsEl.textContent = workers ? `${workers} boeren · rechtsklik op grondstof om te verzamelen` : `Formatie: ${formationLabel(currentFormation)}`;
    } else {
      selectionTitleEl.textContent = 'Niets geselecteerd';
      selectionDetailsEl.textContent = 'Selecteer troepen of een gebouw.';
    }
    updateActionButtons();
  }

  function formationLabel(mode) { return mode === 'square' ? 'Carré' : mode === 'column' ? 'Colonne' : 'Linie'; }

  function updateActionButtons() {
    for (const btn of actionsEl.querySelectorAll('button')) btn.classList.remove('active');
    const trainWorker = actionsEl.querySelector('[data-action="train-worker"]');
    const trainInfantry = actionsEl.querySelector('[data-action="train-infantry"]');
    if (trainWorker) trainWorker.remove();
    if (trainInfantry) trainInfantry.remove();

    if (selectedBuilding?.complete && selectedBuilding.side === 'france') {
      if (selectedBuilding.type === 'towncenter') {
        const b = document.createElement('button'); b.dataset.action = 'train-worker'; b.innerHTML = 'Boer +1<br><small>50 🍞</small>'; actionsEl.prepend(b);
      }
      if (selectedBuilding.type === 'barracks') {
        const b = document.createElement('button'); b.dataset.action = 'train-infantry'; b.innerHTML = 'Musketier<br><small>80 🍞 · 20 🪵</small>'; actionsEl.prepend(b);
      }
    }
    const active = actionsEl.querySelector(`[data-action="build-${buildMode}"]`);
    if (active) active.classList.add('active');
  }

  function nearestEnemy(unit, maxRange) {
    let best = null, bestD2 = maxRange * maxRange;
    for (const other of units) {
      if (other.dead || other.side === unit.side || other.type === 'worker') continue;
      const dx = other.x - unit.x, dy = other.y - unit.y, d2 = dx*dx + dy*dy;
      if (d2 < bestD2) { bestD2 = d2; best = other; }
    }
    return best;
  }

  function fire(unit, enemy) {
    const t = TYPES[unit.type];
    unit.cooldown = t.cooldown * (.85 + Math.random() * .3);
    unit.facing = Math.atan2(enemy.y - unit.y, enemy.x - unit.x);
    if (unit.type === 'cavalry' || unit.type === 'worker') {
      enemy.hp -= t.damage * (.8 + Math.random() * .4); spawnImpact(enemy.x, enemy.y, 4);
      if (enemy.hp <= 0) enemy.dead = true; return;
    }
    projectiles.push({ x: unit.x, y: unit.y, target: enemy, side: unit.side, damage: t.damage, speed: t.projectileSpeed, artillery: unit.type === 'artillery', dead: false });
    spawnSmoke(unit.x + Math.cos(unit.facing)*9, unit.y + Math.sin(unit.facing)*9, unit.type === 'artillery' ? 8 : 3);
  }

  function spawnSmoke(x, y, amount) {
    for (let i=0;i<amount;i++) particles.push({ x,y,vx:(Math.random()-.5)*12,vy:-4-Math.random()*10,life:.7+Math.random()*.8,maxLife:1.5,size:4+Math.random()*8 });
  }
  function spawnImpact(x, y, amount) {
    for (let i=0;i<amount;i++) particles.push({ x,y,vx:(Math.random()-.5)*45,vy:(Math.random()-.5)*45,life:.25+Math.random()*.35,maxLife:.6,size:2+Math.random()*3 });
  }

  function moveToward(unit, tx, ty, dt, speed = TYPES[unit.type].speed) {
    const dx = tx-unit.x, dy=ty-unit.y, dist=Math.hypot(dx,dy);
    if (dist <= 2) return true;
    const step = Math.min(dist, speed*dt); unit.x += dx/dist*step; unit.y += dy/dist*step; unit.facing = Math.atan2(dy,dx); return dist <= 4;
  }

  function nearestTownCenter(side, x, y) {
    let best=null,bestD=Infinity;
    for (const b of buildings) {
      if (b.dead || !b.complete || b.side !== side || b.type !== 'towncenter') continue;
      const d=Math.hypot(b.x-x,b.y-y); if(d<bestD){bestD=d;best=b;}
    }
    return best;
  }

  function updateWorker(unit, dt) {
    if (!unit.task) { moveToward(unit, unit.targetX, unit.targetY, dt); return; }
    if (unit.task === 'gather') {
      const r = unit.resourceTarget;
      if (!r || r.dead || r.amount <= 0) { unit.task=null; unit.resourceTarget=null; return; }
      const d = Math.hypot(r.x-unit.x, r.y-unit.y);
      if (d > r.radius + 11) { moveToward(unit, r.x, r.y, dt); return; }
      unit.gatherClock += dt;
      if (unit.gatherClock >= .45) {
        unit.gatherClock = 0;
        const take = Math.min(5, r.amount, 20-unit.carry);
        r.amount -= take; unit.carry += take; unit.carryType = r.type;
        if (r.amount <= 0) r.dead = true;
        if (unit.carry >= 20 || r.dead) {
          unit.returnResource = r; unit.task = 'return';
        }
      }
      return;
    }
    if (unit.task === 'return') {
      const tc = nearestTownCenter(unit.side, unit.x, unit.y);
      if (!tc) { unit.task=null; return; }
      const d = Math.hypot(tc.x-unit.x, tc.y-unit.y);
      if (d > 60) { moveToward(unit, tc.x, tc.y, dt); return; }
      if (unit.side === 'france') economy[unit.carryType] += unit.carry;
      unit.carry = 0; unit.carryType = null;
      if (unit.returnResource && !unit.returnResource.dead) { unit.resourceTarget = unit.returnResource; unit.task='gather'; }
      else { unit.task=null; unit.resourceTarget=null; }
      return;
    }
    if (unit.task === 'build') {
      const b = unit.buildingTarget;
      if (!b || b.dead || b.complete) { unit.task=null; unit.buildingTarget=null; return; }
      const d=Math.hypot(b.x-unit.x,b.y-unit.y);
      if(d>Math.max(b.w,b.h)*.7){moveToward(unit,b.x,b.y,dt);return;}
      b.construction += dt*.14; b.hp = Math.min(b.maxHp, b.maxHp*b.construction);
      if(b.construction>=1){b.construction=1;b.complete=true;b.hp=b.maxHp;unit.task=null;unit.buildingTarget=null;recalcPopCap();statusEl.textContent=`${BUILDINGS[b.type].label} voltooid.`;}
    }
  }

  function updateUnit(unit, dt) {
    if (unit.dead) return;
    unit.cooldown -= dt;
    if (unit.type === 'worker' && unit.task) { updateWorker(unit, dt); return; }
    const t = TYPES[unit.type], enemy = nearestEnemy(unit, t.range);
    if (enemy && unit.cooldown <= 0) fire(unit, enemy);
    const dx=unit.targetX-unit.x,dy=unit.targetY-unit.y,dist=Math.hypot(dx,dy);
    if(dist>2){ const stop=enemy && unit.type!=='cavalry'; if(!stop) moveToward(unit,unit.targetX,unit.targetY,dt); }
    unit.x=Math.max(8,Math.min(WORLD.width-8,unit.x)); unit.y=Math.max(8,Math.min(WORLD.height-8,unit.y));
  }

  function updateBuildings(dt) {
    for (const b of buildings) {
      if (b.dead || !b.complete || !b.queue.length) continue;
      b.production += dt / b.queue[0].time;
      if (b.production >= 1) {
        const item=b.queue.shift(); b.production=0;
        const pop=TYPES[item.type].pop;
        if (b.side === 'france' && populationUsed()+pop>economy.popCap) { b.queue.unshift(item); continue; }
        createUnit(b.side,item.type,b.x+(b.side==='france'?b.w:-b.w),b.y+b.h*.65);
        if (b.side === 'france') statusEl.textContent=`${TYPES[item.type].label} is klaar.`;
      }
    }
  }

  function updateProjectiles(dt) {
    for(const p of projectiles){
      if(p.dead)continue; if(!p.target||p.target.dead){p.dead=true;continue;}
      const dx=p.target.x-p.x,dy=p.target.y-p.y,dist=Math.hypot(dx,dy),hit=p.artillery?12:6;
      if(dist<=hit){
        if(p.artillery){spawnImpact(p.target.x,p.target.y,16);spawnSmoke(p.target.x,p.target.y,12);for(const u of units){if(u.dead||u.side===p.side)continue;const d=Math.hypot(u.x-p.target.x,u.y-p.target.y);if(d<38){u.hp-=p.damage*Math.max(.25,1-d/46);if(u.hp<=0)u.dead=true;}}}
        else {p.target.hp-=p.damage*(.75+Math.random()*.5);spawnImpact(p.target.x,p.target.y,3);if(p.target.hp<=0)p.target.dead=true;}
        p.dead=true;
      } else {const step=Math.min(dist,p.speed*dt);p.x+=dx/dist*step;p.y+=dy/dist*step;}
    }
    for(let i=projectiles.length-1;i>=0;i--)if(projectiles[i].dead)projectiles.splice(i,1);
  }

  function updateParticles(dt){for(const p of particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.97;p.vy*=.97;}for(let i=particles.length-1;i>=0;i--)if(particles[i].life<=0)particles.splice(i,1);}

  function commandFormation(group,x,y,mode='line'){
    if(!group.length)return;const n=group.length;let cols,spacingX=18,spacingY=18;
    if(mode==='line'){cols=Math.min(28,n);spacingX=17;spacingY=19;}else if(mode==='column'){cols=Math.min(7,Math.ceil(Math.sqrt(n)));spacingX=19;spacingY=17;}else{cols=Math.max(4,Math.ceil(Math.sqrt(n)));spacingX=19;spacingY=19;}
    const rows=Math.ceil(n/cols),sorted=[...group].sort((a,b)=>a.type.localeCompare(b.type)||a.id-b.id);
    sorted.forEach((u,i)=>{const row=Math.floor(i/cols),col=i%cols;let ox=(col-(cols-1)/2)*spacingX,oy=(row-(rows-1)/2)*spacingY;
      if(mode==='square'&&n>=12){const side=Math.ceil(Math.sqrt(n)),perim=Math.max(4,side*4-4),k=i%perim,s=(side-1)*spacingX;if(k<side){ox=-s/2+k*spacingX;oy=-s/2;}else if(k<side*2-1){ox=s/2;oy=-s/2+(k-side+1)*spacingY;}else if(k<side*3-2){ox=s/2-(k-(side*2-1)+1)*spacingX;oy=s/2;}else{ox=-s/2;oy=s/2-(k-(side*3-2)+1)*spacingY;}}
      u.task=null;u.resourceTarget=null;u.targetX=Math.max(20,Math.min(WORLD.width-20,x+ox));u.targetY=Math.max(20,Math.min(WORLD.height-20,y+oy));
    });
  }

  function issueMove(x,y){const group=[...selectedUnits].filter(u=>!u.dead);if(!group.length)return;commandFormation(group,x,y,currentFormation);statusEl.textContent=`${group.length} eenheden bewegen in ${formationLabel(currentFormation).toLowerCase()}.`;}

  function assignGather(resource){
    const workers=[...selectedUnits].filter(u=>!u.dead&&u.type==='worker');
    if(!workers.length)return false;
    workers.forEach(u=>{u.task='gather';u.resourceTarget=resource;u.returnResource=resource;u.targetX=resource.x;u.targetY=resource.y;});
    statusEl.textContent=`${workers.length} boeren verzamelen ${resource.type==='wood'?'hout':'voedsel'}.`; return true;
  }

  function canAfford(cost){return (!cost.food||economy.food>=cost.food)&&(!cost.wood||economy.wood>=cost.wood);}
  function pay(cost){if(cost.food)economy.food-=cost.food;if(cost.wood)economy.wood-=cost.wood;}

  function startBuild(type){
    const workers=[...selectedUnits].filter(u=>!u.dead&&u.type==='worker');
    if(!workers.length){statusEl.textContent='Selecteer eerst één of meer boeren.';return;}
    const cost=BUILDINGS[type].cost;
    if(!canAfford(cost)){statusEl.textContent='Niet genoeg hout.';return;}
    buildMode=type;buildHintEl.classList.remove('hidden');updateActionButtons();
  }

  function placeBuilding(type,x,y){
    const workers=[...selectedUnits].filter(u=>!u.dead&&u.type==='worker'); if(!workers.length)return;
    const def=BUILDINGS[type],cost=def.cost;
    if(!canAfford(cost))return;
    if(x<100||y<100||x>WORLD.width-100||y>WORLD.height-100){statusEl.textContent='Hier kun je niet bouwen.';return;}
    for(const b of buildings){if(!b.dead&&Math.abs(b.x-x)<(b.w+def.w)*.7&&Math.abs(b.y-y)<(b.h+def.h)*.7){statusEl.textContent='Te dicht bij een ander gebouw.';return;}}
    pay(cost);const b=createBuilding('france',type,x,y,false);
    workers.forEach((u,i)=>{u.task='build';u.buildingTarget=b;u.targetX=x+(i-workers.length/2)*12;u.targetY=y+def.h*.7;});
    buildMode=null;buildHintEl.classList.add('hidden');statusEl.textContent=`${def.label} wordt gebouwd.`;updateHud();
  }

  function queueUnit(type){
    if(!selectedBuilding||!selectedBuilding.complete||selectedBuilding.side!=='france')return;
    const costs={worker:{food:50},infantry:{food:80,wood:20}}, times={worker:7,infantry:6};
    const cost=costs[type]; if(!canAfford(cost)){statusEl.textContent='Niet genoeg grondstoffen.';return;}
    if(populationUsed()+TYPES[type].pop>economy.popCap){statusEl.textContent='Population cap bereikt. Bouw een House.';return;}
    pay(cost);selectedBuilding.queue.push({type,label:TYPES[type].label,time:times[type]});statusEl.textContent=`${TYPES[type].label} toegevoegd aan productie.`;updateHud();
  }

  function centroid(group){if(!group.length)return{x:camera.x,y:camera.y};let x=0,y=0;for(const u of group){x+=u.x;y+=u.y;}return{x:x/group.length,y:y/group.length};}
  function aiOrder(){
    const british=livingUnits('britain').filter(u=>u.type!=='worker'), french=livingUnits('france').filter(u=>u.type!=='worker'); if(!british.length||!french.length)return;
    const f=centroid(french),inf=british.filter(u=>u.type==='infantry'),cav=british.filter(u=>u.type==='cavalry'),art=british.filter(u=>u.type==='artillery');
    commandFormation(inf,f.x+220,f.y,'line'); commandFormation(cav,f.x+65,f.y-120,'column'); commandFormation(art,f.x+390,f.y+140,'line');
  }

  function checkVictory(){
    if(gameOver)return;const fCombat=livingUnits('france').filter(u=>u.type!=='worker').length,b=livingUnits('britain').length;
    if(b===0){gameOver=true;messageEl.textContent='FRANSE OVERWINNING';messageEl.classList.remove('hidden');}
    else if(fCombat===0 && livingBuildings('france').filter(b=>b.type==='barracks').length===0){gameOver=true;messageEl.textContent='BRITSE OVERWINNING';messageEl.classList.remove('hidden');}
  }

  function update(dt){
    if(!gameOver){for(const u of units)updateUnit(u,dt);updateBuildings(dt);updateProjectiles(dt);updateParticles(dt);aiClock+=dt;if(aiClock>11){aiClock=0;aiOrder();}checkVictory();}
    else updateParticles(dt);
    const speed=520/camera.zoom;if(keys.has('w')||keys.has('arrowup'))camera.y-=speed*dt;if(keys.has('s')||keys.has('arrowdown'))camera.y+=speed*dt;if(keys.has('a')||keys.has('arrowleft'))camera.x-=speed*dt;if(keys.has('d')||keys.has('arrowright'))camera.x+=speed*dt;clampCamera();updateHud();
  }

  function drawTerrain(){
    ctx.fillStyle=COLORS.grass;ctx.fillRect(0,0,WORLD.width,WORLD.height);
    ctx.strokeStyle=COLORS.grid;ctx.lineWidth=1/camera.zoom;for(let x=0;x<WORLD.width;x+=100){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,WORLD.height);ctx.stroke();}for(let y=0;y<WORLD.height;y+=100){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(WORLD.width,y);ctx.stroke();}
    ctx.fillStyle='rgba(219,201,146,.13)';ctx.fillRect(0,780,WORLD.width,120);
  }

  function drawResource(r){
    if(r.dead)return;const ratio=r.amount/r.maxAmount;
    if(r.type==='wood'){
      ctx.fillStyle='#553b28';ctx.fillRect(r.x-3,r.y+3,6,13);ctx.fillStyle=COLORS.tree;ctx.beginPath();ctx.arc(r.x,r.y,15+ratio*5,0,Math.PI*2);ctx.fill();ctx.fillStyle=COLORS.tree2;ctx.beginPath();ctx.arc(r.x-5,r.y-5,9+ratio*3,0,Math.PI*2);ctx.fill();
    } else {
      ctx.fillStyle=COLORS.food;for(let i=0;i<7;i++){const a=i/7*Math.PI*2;ctx.beginPath();ctx.arc(r.x+Math.cos(a)*10,r.y+Math.sin(a)*7,5+ratio*2,0,Math.PI*2);ctx.fill();}
    }
  }

  function drawBuilding(b){
    if(b.dead)return;const sideColor=b.side==='france'?COLORS.france:COLORS.britain;
    ctx.save();ctx.translate(b.x,b.y);ctx.globalAlpha=b.complete?1:.65;
    ctx.fillStyle='#594936';ctx.fillRect(-b.w/2,-b.h/2,b.w,b.h);
    ctx.fillStyle=sideColor;ctx.fillRect(-b.w/2,-b.h/2,b.w,9);
    ctx.fillStyle='#b69a72';ctx.fillRect(-b.w*.34,-b.h*.35,b.w*.68,b.h*.58);
    if(b.type==='towncenter'){ctx.fillStyle='#6a553e';ctx.beginPath();ctx.moveTo(-b.w*.48,-b.h*.25);ctx.lineTo(0,-b.h*.72);ctx.lineTo(b.w*.48,-b.h*.25);ctx.fill();}
    if(b.type==='barracks'){ctx.fillStyle='#6a553e';ctx.fillRect(-b.w*.42,-b.h*.65,b.w*.84,b.h*.24);}
    if(b.type==='house'){ctx.fillStyle='#6a553e';ctx.beginPath();ctx.moveTo(-b.w*.5,-b.h*.3);ctx.lineTo(0,-b.h*.72);ctx.lineTo(b.w*.5,-b.h*.3);ctx.fill();}
    if(selectedBuilding===b){ctx.strokeStyle=COLORS.selected;ctx.lineWidth=3/camera.zoom;ctx.strokeRect(-b.w/2-5,-b.h/2-5,b.w+10,b.h+10);}
    if(!b.complete){ctx.fillStyle='rgba(0,0,0,.5)';ctx.fillRect(-b.w/2,b.h/2+7,b.w,6);ctx.fillStyle=COLORS.selected;ctx.fillRect(-b.w/2,b.h/2+7,b.w*b.construction,6);}
    else if(b.queue.length){ctx.fillStyle='rgba(0,0,0,.5)';ctx.fillRect(-b.w/2,b.h/2+7,b.w,6);ctx.fillStyle='#d7bd61';ctx.fillRect(-b.w/2,b.h/2+7,b.w*b.production,6);}
    ctx.restore();
  }

  function drawUnit(u){
    if(u.dead)return;const t=TYPES[u.type],base=u.side==='france'?COLORS.france:COLORS.britain,light=u.side==='france'?COLORS.franceLight:COLORS.britainLight;
    ctx.save();ctx.translate(u.x,u.y);ctx.rotate(u.facing);
    if(selectedUnits.has(u)){ctx.strokeStyle=COLORS.selected;ctx.lineWidth=2/camera.zoom;ctx.beginPath();ctx.arc(0,0,t.radius+5,0,Math.PI*2);ctx.stroke();}
    if(u.type==='cavalry'){ctx.fillStyle='#5b4635';ctx.beginPath();ctx.ellipse(-2,1,10,6,0,0,Math.PI*2);ctx.fill();}
    if(u.type==='artillery'){ctx.strokeStyle='#4b3b2b';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-10,5);ctx.lineTo(13,-2);ctx.stroke();ctx.fillStyle='#222';ctx.beginPath();ctx.arc(-6,7,4,0,Math.PI*2);ctx.arc(6,5,4,0,Math.PI*2);ctx.fill();}
    if(u.type==='worker'){ctx.fillStyle='#7d674a';ctx.fillRect(-5,-5,10,11);ctx.fillStyle=base;ctx.fillRect(-5,-5,10,4);}
    else {ctx.fillStyle=base;ctx.beginPath();ctx.arc(0,0,t.radius,0,Math.PI*2);ctx.fill();ctx.fillStyle=light;ctx.fillRect(1,-2,t.radius+5,3);}
    ctx.rotate(-u.facing);if(u.carry>0){ctx.fillStyle=u.carryType==='wood'?'#8a5b31':'#d6b75f';ctx.fillRect(-5,-14,10,5);}
    ctx.restore();
  }

  function drawProjectile(p){ctx.fillStyle=p.artillery?'#202020':'#f0dfaa';ctx.beginPath();ctx.arc(p.x,p.y,p.artillery?3.2:1.8,0,Math.PI*2);ctx.fill();}
  function drawParticles(){for(const p of particles){ctx.globalAlpha=Math.max(0,p.life/p.maxLife);ctx.fillStyle=COLORS.smoke;ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;}

  function draw(){
    ctx.clearRect(0,0,innerWidth,innerHeight);ctx.save();ctx.translate(innerWidth/2,innerHeight/2);ctx.scale(camera.zoom,camera.zoom);ctx.translate(-camera.x,-camera.y);
    drawTerrain();for(const r of resources)drawResource(r);for(const b of buildings)drawBuilding(b);for(const u of units)drawUnit(u);for(const p of projectiles)drawProjectile(p);drawParticles();ctx.restore();
    if(drag.active&&drag.moved&&!buildMode){ctx.strokeStyle='rgba(245,220,112,.9)';ctx.fillStyle='rgba(245,220,112,.12)';ctx.lineWidth=1;const x=Math.min(drag.startX,drag.x),y=Math.min(drag.startY,drag.y),w=Math.abs(drag.x-drag.startX),h=Math.abs(drag.y-drag.startY);ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);}
  }

  function unitAt(wx,wy,side=null){let best=null,bestD=24/camera.zoom;for(const u of units){if(u.dead||(side&&u.side!==side))continue;const d=Math.hypot(u.x-wx,u.y-wy);if(d<bestD){bestD=d;best=u;}}return best;}
  function buildingAt(wx,wy,side=null){for(let i=buildings.length-1;i>=0;i--){const b=buildings[i];if(b.dead||(side&&b.side!==side))continue;if(Math.abs(wx-b.x)<=b.w/2+8&&Math.abs(wy-b.y)<=b.h/2+8)return b;}return null;}
  function resourceAt(wx,wy){let best=null,bestD=32/camera.zoom;for(const r of resources){if(r.dead)continue;const d=Math.hypot(r.x-wx,r.y-wy);if(d<bestD){bestD=d;best=r;}}return best;}

  function selectPoint(wx,wy,add=false){
    const b=buildingAt(wx,wy,'france');if(b){if(!add)selectedUnits.clear();selectedBuilding=b;updateHud();return;}
    const u=unitAt(wx,wy,'france');if(!add){selectedUnits.clear();selectedBuilding=null;}if(u){if(add&&selectedUnits.has(u))selectedUnits.delete(u);else selectedUnits.add(u);}updateHud();
  }

  function selectBox(x1,y1,x2,y2){selectedUnits.clear();selectedBuilding=null;const a=screenToWorld(Math.min(x1,x2),Math.min(y1,y2)),b=screenToWorld(Math.max(x1,x2),Math.max(y1,y2));for(const u of units){if(!u.dead&&u.side==='france'&&u.x>=a.x&&u.x<=b.x&&u.y>=a.y&&u.y<=b.y)selectedUnits.add(u);}updateHud();}

  canvas.addEventListener('mousedown',e=>{if(e.button!==0)return;drag.active=true;drag.startX=drag.x=e.clientX;drag.startY=drag.y=e.clientY;drag.moved=false;});
  canvas.addEventListener('mousemove',e=>{if(!drag.active)return;drag.x=e.clientX;drag.y=e.clientY;if(Math.hypot(drag.x-drag.startX,drag.y-drag.startY)>5)drag.moved=true;});
  canvas.addEventListener('mouseup',e=>{
    if(e.button!==0||!drag.active)return;drag.active=false;const w=screenToWorld(e.clientX,e.clientY);
    if(buildMode){placeBuilding(buildMode,w.x,w.y);return;}
    if(drag.moved)selectBox(drag.startX,drag.startY,e.clientX,e.clientY);else selectPoint(w.x,w.y,e.shiftKey);
  });
  canvas.addEventListener('contextmenu',e=>{
    e.preventDefault();if(buildMode)return;const w=screenToWorld(e.clientX,e.clientY),r=resourceAt(w.x,w.y);if(r&&assignGather(r))return;issueMove(w.x,w.y);
  });
  canvas.addEventListener('wheel',e=>{e.preventDefault();const before=screenToWorld(e.clientX,e.clientY);camera.zoom=Math.max(.42,Math.min(1.55,camera.zoom*(e.deltaY>0?.9:1.1)));const after=screenToWorld(e.clientX,e.clientY);camera.x+=before.x-after.x;camera.y+=before.y-after.y;clampCamera();},{passive:false});

  let touchTap=null;
  canvas.addEventListener('touchstart',e=>{if(e.touches.length!==1)return;touchTap={x:e.touches[0].clientX,y:e.touches[0].clientY,time:performance.now()};},{passive:false});
  canvas.addEventListener('touchend',e=>{if(!touchTap||!e.changedTouches.length)return;const t=e.changedTouches[0],w=screenToWorld(t.clientX,t.clientY);if(buildMode){placeBuilding(buildMode,w.x,w.y);touchTap=null;return;}const hit=unitAt(w.x,w.y,'france')||buildingAt(w.x,w.y,'france');if(hit){selectedUnits.clear();selectedBuilding=null;if(hit.kind==='unit')selectedUnits.add(hit);else selectedBuilding=hit;updateHud();}else{const r=resourceAt(w.x,w.y);if(r&&!assignGather(r))issueMove(w.x,w.y);else if(!r)issueMove(w.x,w.y);}touchTap=null;},{passive:false});

  addEventListener('keydown',e=>{const k=e.key.toLowerCase();keys.add(k);if(k==='escape'){buildMode=null;buildHintEl.classList.add('hidden');updateActionButtons();}if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k))e.preventDefault();});
  addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));

  actionsEl.addEventListener('click',e=>{const btn=e.target.closest('button');if(!btn)return;if(btn.dataset.formation){currentFormation=btn.dataset.formation;statusEl.textContent=`Formatie ingesteld op ${formationLabel(currentFormation)}.`;return;}const a=btn.dataset.action;if(a==='build-barracks')startBuild('barracks');else if(a==='build-house')startBuild('house');else if(a==='train-worker')queueUnit('worker');else if(a==='train-infantry')queueUnit('infantry');});
  document.getElementById('resetBtn').addEventListener('click',resetGame);

  function frame(now){const dt=Math.min(.033,(now-lastTime)/1000);lastTime=now;update(dt);draw();requestAnimationFrame(frame);}
  resetGame();requestAnimationFrame(frame);
})();
