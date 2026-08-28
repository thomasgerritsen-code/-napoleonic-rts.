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
  const units = [], buildings = [], resources = [], projectiles = [], particles = [];
  const selectedUnits = new Set();
  let selectedBuilding = null, nextId = 1, lastTime = performance.now(), gameOver = false;
  let aiClock = 0, buildMode = null, currentFormation = 'line', volleyClock = 0;
  const drag = { active: false, startX: 0, startY: 0, x: 0, y: 0, moved: false };
  const economy = { food: 1000, wood: 1000, popCap: 20 };

  const TYPES = {
    worker:    { radius: 7, speed: 70, hp: 65,  range: 12,  damage: 7,  reload: 1.1, projectileSpeed: 0, pop: 1, label: 'Boer' },
    infantry: { radius: 6, speed: 56, hp: 100, range: 120, damage: 20, reload: 3.0, projectileSpeed: 410, pop: 1, label: 'Musketier' },
    cavalry:  { radius: 9, speed: 96, hp: 155, range: 18,  damage: 30, reload: .9, projectileSpeed: 0, pop: 2, label: 'Cavalerie' },
    artillery:{ radius: 11,speed: 30, hp: 195, range: 300, damage: 82, reload: 5.0, projectileSpeed: 280, pop: 3, label: 'Artillerie' }
  };
  const BUILDINGS = {
    towncenter: { w: 92, h: 76, hp: 1200, label: 'Town Center', pop: 20 },
    barracks:   { w: 80, h: 58, hp: 800, label: 'Barracks', cost: { wood: 300 } },
    house:      { w: 54, h: 48, hp: 420, label: 'House', cost: { wood: 120 }, pop: 10 }
  };
  const COLORS = {
    grass:'#65784f',grid:'rgba(255,255,255,.035)',france:'#244d9a',franceLight:'#a9c2f2',
    britain:'#a5322f',britainLight:'#f1aaa1',outline:'#171914',selected:'#f5dc70',
    smoke:'rgba(232,227,211,.64)',tree:'#234b2b',tree2:'#38663c',food:'#b78d45'
  };

  function resize(){const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.floor(innerWidth*dpr);canvas.height=Math.floor(innerHeight*dpr);canvas.style.width=`${innerWidth}px`;canvas.style.height=`${innerHeight}px`;ctx.setTransform(dpr,0,0,dpr,0,0);}
  addEventListener('resize',resize);resize();

  function createUnit(side,type,x,y){
    const t=TYPES[type];
    const u={id:nextId++,kind:'unit',side,type,x,y,targetX:x,targetY:y,hp:t.hp,maxHp:t.hp,reload:Math.random()*t.reload,
      facing:side==='france'?0:Math.PI,dead:false,task:null,resourceTarget:null,carryType:null,carry:0,gatherClock:0,returnResource:null,
      morale:100,routing:false,chargeTimer:0,attackMode:'fire',artilleryMode:'round',recentHit:0};
    units.push(u);return u;
  }
  function createBuilding(side,type,x,y,complete=true){const d=BUILDINGS[type];const b={id:nextId++,kind:'building',side,type,x,y,w:d.w,h:d.h,hp:complete?d.hp:Math.round(d.hp*.15),maxHp:d.hp,complete,construction:complete?1:.15,dead:false,queue:[],production:0};buildings.push(b);return b;}
  function createResource(type,x,y,amount){resources.push({id:nextId++,kind:'resource',type,x,y,amount,maxAmount:amount,radius:type==='wood'?20:18,dead:false});}
  function spawnLine(side,type,x,y,count,cols=12,spacing=18){for(let i=0;i<count;i++){const c=i%cols,r=Math.floor(i/cols),dir=side==='france'?1:-1;createUnit(side,type,x+dir*c*spacing,y+r*spacing);}}
  function livingUnits(side){return units.filter(u=>!u.dead&&u.side===side);}
  function livingBuildings(side){return buildings.filter(b=>!b.dead&&b.side===side);}
  function populationUsed(){return livingUnits('france').reduce((n,u)=>n+TYPES[u.type].pop,0);}
  function recalcPopCap(){economy.popCap=livingBuildings('france').filter(b=>b.complete).reduce((s,b)=>s+(BUILDINGS[b.type].pop||0),0);}

  function resetGame(){
    units.length=buildings.length=resources.length=projectiles.length=particles.length=0;selectedUnits.clear();selectedBuilding=null;nextId=1;gameOver=false;aiClock=0;buildMode=null;volleyClock=0;
    economy.food=1000;economy.wood=1000;economy.popCap=20;camera.x=650;camera.y=800;camera.zoom=.76;messageEl.classList.add('hidden');buildHintEl.classList.add('hidden');
    createBuilding('france','towncenter',520,820,true);for(let i=0;i<6;i++)createUnit('france','worker',610+(i%3)*24,770+Math.floor(i/3)*28);spawnLine('france','infantry',670,940,24,12,18);
    createBuilding('britain','towncenter',2280,820,true);createBuilding('britain','barracks',2180,970,true);spawnLine('britain','infantry',2080,690,44,15,18);spawnLine('britain','cavalry',2290,600,10,5,24);spawnLine('britain','artillery',2140,1040,4,4,42);
    const forests=[[330,530],[390,570],[450,535],[305,610],[370,645],[455,630],[760,420],[825,455],[890,410],[980,1230],[1045,1280],[1120,1240],[1000,1330],[1090,1360],[1210,1300]];
    forests.forEach(([x,y])=>{for(let i=0;i<5;i++)createResource('wood',x+(Math.random()-.5)*45,y+(Math.random()-.5)*45,180);});
    [[690,610],[750,640],[810,610],[710,680],[790,690]].forEach(([x,y])=>createResource('food',x,y,320));
    recalcPopCap();updateHud();statusEl.textContent='v0.3: bouw je leger op en houd de morale van je troepen in de gaten.';
  }

  function screenToWorld(sx,sy){return{x:(sx-innerWidth/2)/camera.zoom+camera.x,y:(sy-innerHeight/2)/camera.zoom+camera.y};}
  function clampCamera(){const hw=innerWidth/(2*camera.zoom),hh=innerHeight/(2*camera.zoom);camera.x=Math.max(hw,Math.min(WORLD.width-hw,camera.x));camera.y=Math.max(hh,Math.min(WORLD.height-hh,camera.y));}
  function formationLabel(m){return m==='square'?'Carré':m==='column'?'Colonne':'Linie';}
  function avgMorale(group){if(!group.length)return 0;return group.reduce((s,u)=>s+u.morale,0)/group.length;}

  function updateHud(){
    for(const u of [...selectedUnits])if(u.dead)selectedUnits.delete(u);if(selectedBuilding?.dead)selectedBuilding=null;recalcPopCap();
    foodEl.textContent=Math.floor(economy.food);woodEl.textContent=Math.floor(economy.wood);populationEl.textContent=`${populationUsed()}/${economy.popCap}`;frenchCountEl.textContent=livingUnits('france').length;britishCountEl.textContent=livingUnits('britain').length;
    if(selectedBuilding){const b=selectedBuilding;selectionTitleEl.textContent=BUILDINGS[b.type].label;selectionDetailsEl.textContent=!b.complete?`In aanbouw · ${Math.floor(b.construction*100)}%`:b.queue.length?`Productie: ${b.queue[0].label} · ${Math.floor(b.production*100)}%`:`${Math.max(0,Math.floor(b.hp))}/${b.maxHp} HP`;}
    else if(selectedUnits.size){const group=[...selectedUnits],workers=group.filter(u=>u.type==='worker').length,routing=group.filter(u=>u.routing).length;selectionTitleEl.textContent=group.length===1?TYPES[group[0].type].label:`${group.length} eenheden`;selectionDetailsEl.textContent=workers?`${workers} boeren · rechtsklik op grondstof om te verzamelen`:`Morale ${Math.round(avgMorale(group))}% · ${formationLabel(currentFormation)}${routing?` · ${routing} op de vlucht`:''}`;}
    else{selectionTitleEl.textContent='Niets geselecteerd';selectionDetailsEl.textContent='Selecteer troepen of een gebouw.';}
    updateActionButtons();
  }

  function dynamicButton(action,label){const b=document.createElement('button');b.dataset.action=action;b.innerHTML=label;actionsEl.prepend(b);}
  function updateActionButtons(){
    for(const b of [...actionsEl.querySelectorAll('[data-dynamic="1"]')])b.remove();
    for(const btn of actionsEl.querySelectorAll('button'))btn.classList.remove('active');
    if(selectedBuilding?.complete&&selectedBuilding.side==='france'){
      if(selectedBuilding.type==='towncenter'){dynamicButton('train-worker','Boer +1<br><small>50 🍞</small>');actionsEl.firstElementChild.dataset.dynamic='1';}
      if(selectedBuilding.type==='barracks'){dynamicButton('train-infantry','Musketier<br><small>80 🍞 · 20 🪵</small>');actionsEl.firstElementChild.dataset.dynamic='1';}
    }
    const group=[...selectedUnits].filter(u=>!u.dead&&!u.routing);
    if(group.some(u=>u.type==='infantry')){dynamicButton('bayonet','Bajonet<br><small>charge</small>');actionsEl.firstElementChild.dataset.dynamic='1';}
    if(group.some(u=>u.type==='cavalry')){dynamicButton('charge','Cavalerie<br><small>charge</small>');actionsEl.firstElementChild.dataset.dynamic='1';}
    if(group.some(u=>u.type==='artillery')){const mode=group.find(u=>u.type==='artillery').artilleryMode;dynamicButton('artillery-mode',mode==='round'?'Kanonkogel<br><small>→ grapeshot</small>':'Grapeshot<br><small>→ kogel</small>');actionsEl.firstElementChild.dataset.dynamic='1';}
    const active=actionsEl.querySelector(`[data-action="build-${buildMode}"]`);if(active)active.classList.add('active');
  }

  function nearestEnemy(unit,maxRange){let best=null,bestD2=maxRange*maxRange;for(const o of units){if(o.dead||o.side===unit.side||o.type==='worker'||o.routing)continue;const dx=o.x-unit.x,dy=o.y-unit.y,d2=dx*dx+dy*dy;if(d2<bestD2){bestD2=d2;best=o;}}return best;}
  function moraleShock(victim,amount){victim.morale=Math.max(0,victim.morale-amount);victim.recentHit=2;for(const u of units){if(u.dead||u.side!==victim.side||u===victim)continue;const d=Math.hypot(u.x-victim.x,u.y-victim.y);if(d<55)u.morale=Math.max(0,u.morale-amount*.18);}}
  function applyDamage(victim,damage,shock=8){if(!victim||victim.dead)return;victim.hp-=damage;moraleShock(victim,shock+damage*.08);if(victim.hp<=0){victim.dead=true;victim.morale=0;for(const u of units){if(!u.dead&&u.side===victim.side&&Math.hypot(u.x-victim.x,u.y-victim.y)<75)u.morale=Math.max(0,u.morale-7);}}}
  function spawnSmoke(x,y,n){for(let i=0;i<n;i++)particles.push({x,y,vx:(Math.random()-.5)*12,vy:-4-Math.random()*10,life:.7+Math.random()*.8,maxLife:1.5,size:4+Math.random()*8});}
  function spawnImpact(x,y,n){for(let i=0;i<n;i++)particles.push({x,y,vx:(Math.random()-.5)*45,vy:(Math.random()-.5)*45,life:.25+Math.random()*.35,maxLife:.6,size:2+Math.random()*3});}

  function fire(unit,enemy){
    const t=TYPES[unit.type];unit.reload=t.reload*(.9+Math.random()*.25);unit.facing=Math.atan2(enemy.y-unit.y,enemy.x-unit.x);
    if(unit.type==='cavalry'||unit.type==='worker'){const bonus=unit.type==='cavalry'&&unit.chargeTimer>0?2.0:1;applyDamage(enemy,t.damage*bonus*(.85+Math.random()*.3),unit.chargeTimer>0?24:9);spawnImpact(enemy.x,enemy.y,4);if(unit.type==='cavalry')unit.chargeTimer=Math.max(0,unit.chargeTimer-.8);return;}
    if(unit.type==='artillery'&&unit.artilleryMode==='grape'){
      const ang=unit.facing;for(const o of units){if(o.dead||o.side===unit.side)continue;const dx=o.x-unit.x,dy=o.y-unit.y,d=Math.hypot(dx,dy);if(d>145)continue;const da=Math.abs(Math.atan2(Math.sin(Math.atan2(dy,dx)-ang),Math.cos(Math.atan2(dy,dx)-ang)));if(da<.28){applyDamage(o,24*(1-d/190),18);spawnImpact(o.x,o.y,3);}}
      spawnSmoke(unit.x+Math.cos(ang)*12,unit.y+Math.sin(ang)*12,14);return;
    }
    projectiles.push({x:unit.x,y:unit.y,target:enemy,side:unit.side,damage:t.damage,speed:t.projectileSpeed,artillery:unit.type==='artillery',dead:false});spawnSmoke(unit.x+Math.cos(unit.facing)*9,unit.y+Math.sin(unit.facing)*9,unit.type==='artillery'?10:4);
  }

  function moveToward(u,tx,ty,dt,speed=TYPES[u.type].speed){const dx=tx-u.x,dy=ty-u.y,d=Math.hypot(dx,dy);if(d<=2)return true;const step=Math.min(d,speed*dt);u.x+=dx/d*step;u.y+=dy/d*step;u.facing=Math.atan2(dy,dx);return d<=4;}
  function nearestTownCenter(side,x,y){let best=null,bd=Infinity;for(const b of buildings){if(b.dead||!b.complete||b.side!==side||b.type!=='towncenter')continue;const d=Math.hypot(b.x-x,b.y-y);if(d<bd){bd=d;best=b;}}return best;}

  function updateWorker(u,dt){
    if(!u.task){moveToward(u,u.targetX,u.targetY,dt);return;}
    if(u.task==='gather'){const r=u.resourceTarget;if(!r||r.dead||r.amount<=0){u.task=null;u.resourceTarget=null;return;}const d=Math.hypot(r.x-u.x,r.y-u.y);if(d>r.radius+11){moveToward(u,r.x,r.y,dt);return;}u.gatherClock+=dt;if(u.gatherClock>=.45){u.gatherClock=0;const take=Math.min(5,r.amount,20-u.carry);r.amount-=take;u.carry+=take;u.carryType=r.type;if(r.amount<=0)r.dead=true;if(u.carry>=20||r.dead){u.returnResource=r;u.task='return';}}return;}
    if(u.task==='return'){const tc=nearestTownCenter(u.side,u.x,u.y);if(!tc){u.task=null;return;}if(Math.hypot(tc.x-u.x,tc.y-u.y)>60){moveToward(u,tc.x,tc.y,dt);return;}if(u.side==='france')economy[u.carryType]+=u.carry;u.carry=0;u.carryType=null;if(u.returnResource&&!u.returnResource.dead){u.resourceTarget=u.returnResource;u.task='gather';}else{u.task=null;u.resourceTarget=null;}return;}
    if(u.task==='build'){const b=u.buildingTarget;if(!b||b.dead||b.complete){u.task=null;u.buildingTarget=null;return;}if(Math.hypot(b.x-u.x,b.y-u.y)>Math.max(b.w,b.h)*.7){moveToward(u,b.x,b.y,dt);return;}b.construction+=dt*.14;b.hp=Math.min(b.maxHp,b.maxHp*b.construction);if(b.construction>=1){b.construction=1;b.complete=true;b.hp=b.maxHp;u.task=null;u.buildingTarget=null;recalcPopCap();statusEl.textContent=`${BUILDINGS[b.type].label} voltooid.`;}}
  }

  function routeUnit(u){if(u.routing||u.type==='worker')return;u.routing=true;u.task=null;u.attackMode='fire';u.chargeTimer=0;u.targetX=u.side==='france'?35:WORLD.width-35;u.targetY=Math.max(50,Math.min(WORLD.height-50,u.y+(Math.random()-.5)*300));}
  function updateUnit(u,dt){
    if(u.dead)return;u.reload-=dt;u.recentHit=Math.max(0,u.recentHit-dt);u.chargeTimer=Math.max(0,u.chargeTimer-dt);
    if(u.type==='worker'&&u.task){updateWorker(u,dt);return;}
    const near=nearestEnemy(u,170);if(!u.routing){const recovery=near?0.25:1.5;u.morale=Math.min(100,u.morale+recovery*dt);if(u.morale<24)routeUnit(u);}
    if(u.routing){moveToward(u,u.targetX,u.targetY,dt,TYPES[u.type].speed*1.25);if((u.side==='france'&&u.x<45)||(u.side==='britain'&&u.x>WORLD.width-45))u.dead=true;return;}
    let range=TYPES[u.type].range;if(u.type==='artillery'&&u.artilleryMode==='grape')range=145;if(u.type==='infantry'&&u.attackMode==='bayonet')range=16;
    const enemy=nearestEnemy(u,range);
    if(enemy&&u.reload<=0){if(u.type!=='infantry'||u.attackMode==='bayonet'||volleyClock<.16)fire(u,enemy);}
    const dx=u.targetX-u.x,dy=u.targetY-u.y,dist=Math.hypot(dx,dy);if(dist>2){const stop=enemy&&u.type!=='cavalry'&&u.attackMode!=='bayonet';if(!stop)moveToward(u,u.targetX,u.targetY,dt,TYPES[u.type].speed*(u.chargeTimer>0?1.45:1));}
    u.x=Math.max(8,Math.min(WORLD.width-8,u.x));u.y=Math.max(8,Math.min(WORLD.height-8,u.y));
  }

  function updateBuildings(dt){for(const b of buildings){if(b.dead||!b.complete||!b.queue.length)continue;b.production+=dt/b.queue[0].time;if(b.production>=1){const item=b.queue.shift();b.production=0;if(b.side==='france'&&populationUsed()+TYPES[item.type].pop>economy.popCap){b.queue.unshift(item);continue;}createUnit(b.side,item.type,b.x+(b.side==='france'?b.w:-b.w),b.y+b.h*.65);if(b.side==='france')statusEl.textContent=`${TYPES[item.type].label} is klaar.`;}}}
  function updateProjectiles(dt){for(const p of projectiles){if(p.dead)continue;if(!p.target||p.target.dead){p.dead=true;continue;}const dx=p.target.x-p.x,dy=p.target.y-p.y,d=Math.hypot(dx,dy),hit=p.artillery?12:6;if(d<=hit){if(p.artillery){spawnImpact(p.target.x,p.target.y,16);spawnSmoke(p.target.x,p.target.y,12);for(const u of units){if(u.dead||u.side===p.side)continue;const dd=Math.hypot(u.x-p.target.x,u.y-p.target.y);if(dd<42)applyDamage(u,p.damage*Math.max(.22,1-dd/50),24);}}else{applyDamage(p.target,p.damage*(.75+Math.random()*.5),10);spawnImpact(p.target.x,p.target.y,3);}p.dead=true;}else{const step=Math.min(d,p.speed*dt);p.x+=dx/d*step;p.y+=dy/d*step;}}for(let i=projectiles.length-1;i>=0;i--)if(projectiles[i].dead)projectiles.splice(i,1);}
  function updateParticles(dt){for(const p of particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.97;p.vy*=.97;}for(let i=particles.length-1;i>=0;i--)if(particles[i].life<=0)particles.splice(i,1);}

  function commandFormation(group,x,y,mode='line'){
    if(!group.length)return;const n=group.length;let cols,sx=18,sy=18;if(mode==='line'){cols=Math.min(28,n);sx=17;sy=19;}else if(mode==='column'){cols=Math.min(7,Math.ceil(Math.sqrt(n)));sx=19;sy=17;}else{cols=Math.max(4,Math.ceil(Math.sqrt(n)));sx=19;sy=19;}const rows=Math.ceil(n/cols),sorted=[...group].sort((a,b)=>a.type.localeCompare(b.type)||a.id-b.id);
    sorted.forEach((u,i)=>{const row=Math.floor(i/cols),col=i%cols;let ox=(col-(cols-1)/2)*sx,oy=(row-(rows-1)/2)*sy;if(mode==='square'&&n>=12){const side=Math.ceil(Math.sqrt(n)),per=Math.max(4,side*4-4),k=i%per,s=(side-1)*sx;if(k<side){ox=-s/2+k*sx;oy=-s/2;}else if(k<side*2-1){ox=s/2;oy=-s/2+(k-side+1)*sy;}else if(k<side*3-2){ox=s/2-(k-(side*2-1)+1)*sx;oy=s/2;}else{ox=-s/2;oy=s/2-(k-(side*3-2)+1)*sy;}}u.task=null;u.resourceTarget=null;u.targetX=Math.max(20,Math.min(WORLD.width-20,x+ox));u.targetY=Math.max(20,Math.min(WORLD.height-20,y+oy));});
  }
  function issueMove(x,y){const g=[...selectedUnits].filter(u=>!u.dead&&!u.routing);if(!g.length)return;commandFormation(g,x,y,currentFormation);statusEl.textContent=`${g.length} eenheden bewegen in ${formationLabel(currentFormation).toLowerCase()}.`;}
  function assignGather(r){const w=[...selectedUnits].filter(u=>!u.dead&&u.type==='worker');if(!w.length)return false;w.forEach(u=>{u.task='gather';u.resourceTarget=r;u.returnResource=r;u.targetX=r.x;u.targetY=r.y;});statusEl.textContent=`${w.length} boeren verzamelen ${r.type==='wood'?'hout':'voedsel'}.`;return true;}
  function canAfford(c){return(!c.food||economy.food>=c.food)&&(!c.wood||economy.wood>=c.wood);}
  function pay(c){if(c.food)economy.food-=c.food;if(c.wood)economy.wood-=c.wood;}
  function startBuild(type){const w=[...selectedUnits].filter(u=>!u.dead&&u.type==='worker');if(!w.length){statusEl.textContent='Selecteer eerst één of meer boeren.';return;}const c=BUILDINGS[type].cost;if(!canAfford(c)){statusEl.textContent='Niet genoeg hout.';return;}buildMode=type;buildHintEl.classList.remove('hidden');updateActionButtons();}
  function placeBuilding(type,x,y){const w=[...selectedUnits].filter(u=>!u.dead&&u.type==='worker');if(!w.length)return;const d=BUILDINGS[type],c=d.cost;if(!canAfford(c))return;if(x<100||y<100||x>WORLD.width-100||y>WORLD.height-100){statusEl.textContent='Hier kun je niet bouwen.';return;}for(const b of buildings){if(!b.dead&&Math.abs(b.x-x)<(b.w+d.w)*.7&&Math.abs(b.y-y)<(b.h+d.h)*.7){statusEl.textContent='Te dicht bij een ander gebouw.';return;}}pay(c);const b=createBuilding('france',type,x,y,false);w.forEach((u,i)=>{u.task='build';u.buildingTarget=b;u.targetX=x+(i-w.length/2)*12;u.targetY=y+d.h*.7;});buildMode=null;buildHintEl.classList.add('hidden');statusEl.textContent=`${d.label} wordt gebouwd.`;updateHud();}
  function queueUnit(type){if(!selectedBuilding||!selectedBuilding.complete||selectedBuilding.side!=='france')return;const costs={worker:{food:50},infantry:{food:80,wood:20}},times={worker:7,infantry:6},c=costs[type];if(!canAfford(c)){statusEl.textContent='Niet genoeg grondstoffen.';return;}if(populationUsed()+TYPES[type].pop>economy.popCap){statusEl.textContent='Population cap bereikt. Bouw een House.';return;}pay(c);selectedBuilding.queue.push({type,label:TYPES[type].label,time:times[type]});statusEl.textContent=`${TYPES[type].label} toegevoegd aan productie.`;updateHud();}

  function centroid(g){if(!g.length)return{x:camera.x,y:camera.y};let x=0,y=0;for(const u of g){x+=u.x;y+=u.y;}return{x:x/g.length,y:y/g.length};}
  function aiOrder(){const b=livingUnits('britain').filter(u=>u.type!=='worker'&&!u.routing),f=livingUnits('france').filter(u=>u.type!=='worker'&&!u.routing);if(!b.length||!f.length)return;const c=centroid(f),inf=b.filter(u=>u.type==='infantry'),cav=b.filter(u=>u.type==='cavalry'),art=b.filter(u=>u.type==='artillery');commandFormation(inf,c.x+220,c.y,'line');commandFormation(cav,c.x+65,c.y-120,'column');commandFormation(art,c.x+390,c.y+140,'line');cav.forEach(u=>u.chargeTimer=6);art.forEach(u=>u.artilleryMode=Math.random()<.25?'grape':'round');}
  function checkVictory(){if(gameOver)return;const f=livingUnits('france').filter(u=>u.type!=='worker').length,b=livingUnits('britain').length;if(b===0){gameOver=true;messageEl.textContent='FRANSE OVERWINNING';messageEl.classList.remove('hidden');}else if(f===0&&livingBuildings('france').filter(b=>b.type==='barracks').length===0){gameOver=true;messageEl.textContent='BRITSE OVERWINNING';messageEl.classList.remove('hidden');}}

  function update(dt){
    volleyClock=(volleyClock+dt)%3.1;
    if(!gameOver){for(const u of units)updateUnit(u,dt);updateBuildings(dt);updateProjectiles(dt);updateParticles(dt);aiClock+=dt;if(aiClock>10){aiClock=0;aiOrder();}checkVictory();}else updateParticles(dt);
    const speed=520/camera.zoom;if(keys.has('w')||keys.has('arrowup'))camera.y-=speed*dt;if(keys.has('s')||keys.has('arrowdown'))camera.y+=speed*dt;if(keys.has('a')||keys.has('arrowleft'))camera.x-=speed*dt;if(keys.has('d')||keys.has('arrowright'))camera.x+=speed*dt;clampCamera();updateHud();
  }

  function drawTerrain(){ctx.fillStyle=COLORS.grass;ctx.fillRect(0,0,WORLD.width,WORLD.height);ctx.strokeStyle=COLORS.grid;ctx.lineWidth=1/camera.zoom;for(let x=0;x<WORLD.width;x+=100){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,WORLD.height);ctx.stroke();}for(let y=0;y<WORLD.height;y+=100){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(WORLD.width,y);ctx.stroke();}ctx.fillStyle='rgba(219,201,146,.13)';ctx.fillRect(0,780,WORLD.width,120);}
  function drawResource(r){if(r.dead)return;const ratio=r.amount/r.maxAmount;if(r.type==='wood'){ctx.fillStyle='#553b28';ctx.fillRect(r.x-3,r.y+3,6,13);ctx.fillStyle=COLORS.tree;ctx.beginPath();ctx.arc(r.x,r.y,15+ratio*5,0,Math.PI*2);ctx.fill();ctx.fillStyle=COLORS.tree2;ctx.beginPath();ctx.arc(r.x-5,r.y-5,9+ratio*3,0,Math.PI*2);ctx.fill();}else{ctx.fillStyle=COLORS.food;for(let i=0;i<7;i++){const a=i/7*Math.PI*2;ctx.beginPath();ctx.arc(r.x+Math.cos(a)*10,r.y+Math.sin(a)*7,5+ratio*2,0,Math.PI*2);ctx.fill();}}}
  function drawBuilding(b){if(b.dead)return;const side=b.side==='france'?COLORS.france:COLORS.britain;ctx.save();ctx.translate(b.x,b.y);ctx.globalAlpha=b.complete?1:.65;ctx.fillStyle='#594936';ctx.fillRect(-b.w/2,-b.h/2,b.w,b.h);ctx.fillStyle=side;ctx.fillRect(-b.w/2,-b.h/2,b.w,9);ctx.fillStyle='#b69a72';ctx.fillRect(-b.w*.34,-b.h*.35,b.w*.68,b.h*.58);ctx.fillStyle='#6a553e';if(b.type==='towncenter'||b.type==='house'){ctx.beginPath();ctx.moveTo(-b.w*.48,-b.h*.25);ctx.lineTo(0,-b.h*.72);ctx.lineTo(b.w*.48,-b.h*.25);ctx.fill();}else ctx.fillRect(-b.w*.42,-b.h*.65,b.w*.84,b.h*.24);if(selectedBuilding===b){ctx.strokeStyle=COLORS.selected;ctx.lineWidth=3/camera.zoom;ctx.strokeRect(-b.w/2-5,-b.h/2-5,b.w+10,b.h+10);}if(!b.complete){ctx.fillStyle='rgba(0,0,0,.5)';ctx.fillRect(-b.w/2,b.h/2+7,b.w,6);ctx.fillStyle=COLORS.selected;ctx.fillRect(-b.w/2,b.h/2+7,b.w*b.construction,6);}else if(b.queue.length){ctx.fillStyle='rgba(0,0,0,.5)';ctx.fillRect(-b.w/2,b.h/2+7,b.w,6);ctx.fillStyle='#d7bd61';ctx.fillRect(-b.w/2,b.h/2+7,b.w*b.production,6);}ctx.restore();}
  function drawUnit(u){if(u.dead)return;const t=TYPES[u.type],base=u.side==='france'?COLORS.france:COLORS.britain,light=u.side==='france'?COLORS.franceLight:COLORS.britainLight;ctx.save();ctx.translate(u.x,u.y);ctx.rotate(u.facing);if(selectedUnits.has(u)){ctx.strokeStyle=COLORS.selected;ctx.lineWidth=2/camera.zoom;ctx.beginPath();ctx.arc(0,0,t.radius+5,0,Math.PI*2);ctx.stroke();}if(u.type==='cavalry'){ctx.fillStyle='#5b4635';ctx.beginPath();ctx.ellipse(-2,1,10,6,0,0,Math.PI*2);ctx.fill();if(u.chargeTimer>0){ctx.strokeStyle='#f0cc5a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(5,-6);ctx.lineTo(18,-9);ctx.stroke();}}if(u.type==='artillery'){ctx.strokeStyle='#4b3b2b';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-10,5);ctx.lineTo(13,-2);ctx.stroke();ctx.fillStyle='#222';ctx.beginPath();ctx.arc(-6,7,4,0,Math.PI*2);ctx.arc(6,5,4,0,Math.PI*2);ctx.fill();}if(u.type==='worker'){ctx.fillStyle='#7d674a';ctx.fillRect(-5,-5,10,11);ctx.fillStyle=base;ctx.fillRect(-5,-5,10,4);}else{ctx.fillStyle=u.routing?'#777':base;ctx.beginPath();ctx.arc(0,0,t.radius,0,Math.PI*2);ctx.fill();ctx.fillStyle=light;ctx.fillRect(1,-2,t.radius+5,3);}ctx.rotate(-u.facing);if(u.carry>0){ctx.fillStyle=u.carryType==='wood'?'#8a5b31':'#d6b75f';ctx.fillRect(-5,-14,10,5);}if(u.type!=='worker'){ctx.fillStyle='rgba(0,0,0,.45)';ctx.fillRect(-10,-16,20,3);ctx.fillStyle=u.morale>55?'#d8d06a':u.morale>25?'#d49a4b':'#b43f38';ctx.fillRect(-10,-16,20*(u.morale/100),3);}ctx.restore();}
  function drawProjectile(p){ctx.fillStyle=p.artillery?'#202020':'#f0dfaa';ctx.beginPath();ctx.arc(p.x,p.y,p.artillery?3.2:1.8,0,Math.PI*2);ctx.fill();}
  function drawParticles(){for(const p of particles){ctx.globalAlpha=Math.max(0,p.life/p.maxLife);ctx.fillStyle=COLORS.smoke;ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;}
  function draw(){ctx.clearRect(0,0,innerWidth,innerHeight);ctx.save();ctx.translate(innerWidth/2,innerHeight/2);ctx.scale(camera.zoom,camera.zoom);ctx.translate(-camera.x,-camera.y);drawTerrain();for(const r of resources)drawResource(r);for(const b of buildings)drawBuilding(b);for(const u of units)drawUnit(u);for(const p of projectiles)drawProjectile(p);drawParticles();ctx.restore();if(drag.active&&drag.moved&&!buildMode){ctx.strokeStyle='rgba(245,220,112,.9)';ctx.fillStyle='rgba(245,220,112,.12)';const x=Math.min(drag.startX,drag.x),y=Math.min(drag.startY,drag.y),w=Math.abs(drag.x-drag.startX),h=Math.abs(drag.y-drag.startY);ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);}}

  function unitAt(wx,wy,side=null){let best=null,bd=24/camera.zoom;for(const u of units){if(u.dead||(side&&u.side!==side))continue;const d=Math.hypot(u.x-wx,u.y-wy);if(d<bd){bd=d;best=u;}}return best;}
  function buildingAt(wx,wy,side=null){for(let i=buildings.length-1;i>=0;i--){const b=buildings[i];if(b.dead||(side&&b.side!==side))continue;if(Math.abs(wx-b.x)<=b.w/2+8&&Math.abs(wy-b.y)<=b.h/2+8)return b;}return null;}
  function resourceAt(wx,wy){let best=null,bd=32/camera.zoom;for(const r of resources){if(r.dead)continue;const d=Math.hypot(r.x-wx,r.y-wy);if(d<bd){bd=d;best=r;}}return best;}
  function selectPoint(wx,wy,add=false){const b=buildingAt(wx,wy,'france');if(b){if(!add)selectedUnits.clear();selectedBuilding=b;updateHud();return;}const u=unitAt(wx,wy,'france');if(!add){selectedUnits.clear();selectedBuilding=null;}if(u){if(add&&selectedUnits.has(u))selectedUnits.delete(u);else selectedUnits.add(u);}updateHud();}
  function selectBox(x1,y1,x2,y2){selectedUnits.clear();selectedBuilding=null;const a=screenToWorld(Math.min(x1,x2),Math.min(y1,y2)),b=screenToWorld(Math.max(x1,x2),Math.max(y1,y2));for(const u of units){if(!u.dead&&u.side==='france'&&u.x>=a.x&&u.x<=b.x&&u.y>=a.y&&u.y<=b.y)selectedUnits.add(u);}updateHud();}

  function bayonetCommand(){const g=[...selectedUnits].filter(u=>!u.dead&&!u.routing&&u.type==='infantry');if(!g.length)return;const enemies=livingUnits('britain').filter(u=>!u.routing);if(!enemies.length)return;const c=centroid(g);let target=enemies[0],bd=Infinity;for(const e of enemies){const d=Math.hypot(e.x-c.x,e.y-c.y);if(d<bd){bd=d;target=e;}}g.forEach(u=>{u.attackMode='bayonet';u.chargeTimer=6;u.morale=Math.min(100,u.morale+8);});commandFormation(g,target.x,target.y,'line');statusEl.textContent='Bajonetten vooruit! Infanterie gaat over tot de aanval.';}
  function cavalryCharge(){const g=[...selectedUnits].filter(u=>!u.dead&&!u.routing&&u.type==='cavalry');if(!g.length)return;g.forEach(u=>{u.chargeTimer=7;u.morale=Math.min(100,u.morale+10);});statusEl.textContent='Cavaleriecharge! Snelheid en impactschade tijdelijk verhoogd.';}
  function toggleArtillery(){const g=[...selectedUnits].filter(u=>!u.dead&&u.type==='artillery');if(!g.length)return;const next=g[0].artilleryMode==='round'?'grape':'round';g.forEach(u=>u.artilleryMode=next);statusEl.textContent=next==='grape'?'Artillerie geladen met grapeshot: kort bereik, brede schade.':'Artillerie geladen met ronde kogel: lang bereik.';updateActionButtons();}

  canvas.addEventListener('mousedown',e=>{if(e.button!==0)return;drag.active=true;drag.startX=drag.x=e.clientX;drag.startY=drag.y=e.clientY;drag.moved=false;});
  canvas.addEventListener('mousemove',e=>{if(!drag.active)return;drag.x=e.clientX;drag.y=e.clientY;if(Math.hypot(drag.x-drag.startX,drag.y-drag.startY)>5)drag.moved=true;});
  canvas.addEventListener('mouseup',e=>{if(e.button!==0||!drag.active)return;drag.active=false;const w=screenToWorld(e.clientX,e.clientY);if(buildMode){placeBuilding(buildMode,w.x,w.y);return;}if(drag.moved)selectBox(drag.startX,drag.startY,e.clientX,e.clientY);else selectPoint(w.x,w.y,e.shiftKey);});
  canvas.addEventListener('contextmenu',e=>{e.preventDefault();if(buildMode)return;const w=screenToWorld(e.clientX,e.clientY),r=resourceAt(w.x,w.y);if(r&&assignGather(r))return;issueMove(w.x,w.y);});
  canvas.addEventListener('wheel',e=>{e.preventDefault();camera.zoom=Math.max(.42,Math.min(1.55,camera.zoom*(e.deltaY>0?.9:1.1)));clampCamera();},{passive:false});
  let touchTap=null;canvas.addEventListener('touchstart',e=>{if(e.touches.length!==1)return;touchTap={x:e.touches[0].clientX,y:e.touches[0].clientY};},{passive:false});canvas.addEventListener('touchend',e=>{if(!touchTap||!e.changedTouches.length)return;const t=e.changedTouches[0],w=screenToWorld(t.clientX,t.clientY);if(buildMode){placeBuilding(buildMode,w.x,w.y);touchTap=null;return;}const hit=unitAt(w.x,w.y,'france')||buildingAt(w.x,w.y,'france');if(hit){selectedUnits.clear();selectedBuilding=null;if(hit.kind==='unit')selectedUnits.add(hit);else selectedBuilding=hit;updateHud();}else{const r=resourceAt(w.x,w.y);if(r&&!assignGather(r))issueMove(w.x,w.y);else if(!r)issueMove(w.x,w.y);}touchTap=null;},{passive:false});
  addEventListener('keydown',e=>{const k=e.key.toLowerCase();keys.add(k);if(k==='escape'){buildMode=null;buildHintEl.classList.add('hidden');updateActionButtons();}if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k))e.preventDefault();});addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
  actionsEl.addEventListener('click',e=>{const btn=e.target.closest('button');if(!btn)return;if(btn.dataset.formation){currentFormation=btn.dataset.formation;statusEl.textContent=`Formatie ingesteld op ${formationLabel(currentFormation)}.`;return;}const a=btn.dataset.action;if(a==='build-barracks')startBuild('barracks');else if(a==='build-house')startBuild('house');else if(a==='train-worker')queueUnit('worker');else if(a==='train-infantry')queueUnit('infantry');else if(a==='bayonet')bayonetCommand();else if(a==='charge')cavalryCharge();else if(a==='artillery-mode')toggleArtillery();});
  document.getElementById('resetBtn').addEventListener('click',resetGame);
  function frame(now){const dt=Math.min(.033,(now-lastTime)/1000);lastTime=now;update(dt);draw();requestAnimationFrame(frame);}resetGame();requestAnimationFrame(frame);
})();