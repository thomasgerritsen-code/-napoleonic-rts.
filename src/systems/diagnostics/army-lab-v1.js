'use strict';
// Testveld: an empty battlefield to try large armies on, without a match.
// Opened from the start menu (play.html?lab=1). The bases stay but no one
// works or trains, the battle never ends, and a panel - usable on a phone -
// sets up armies of any size from the test lab's own regiment builders, lets
// them fight (or not), and shows how fast the game runs.
(function installArmyLab(root){
  if(!new URLSearchParams(location.search).has('lab'))return;
  if(document.readyState!=='complete'){addEventListener('load',()=>setTimeout(()=>installArmyLab(root),50),{once:true});return;}
  if(root.__ARMY_LAB_V1__||typeof makeInfantryRegimentScenarioV062!=='function')return;
  // Open ground east of the river, clear of villages and both bases.
  const FIELD={x:5000,y:1900},GAP=900;
  const PRESETS={klein:{infantry:2,cavalry:0,artillery:0},middel:{infantry:6,cavalry:2,artillery:2},
    groot:{infantry:12,cavalry:4,artillery:4},enorm:{infantry:20,cavalry:6,artillery:6}};
  const LIMITS={infantry:24,cavalry:8,artillery:8};
  const config={france:{...PRESETS.middel},britain:{...PRESETS.middel},men:24,aiBritain:false,fog:false};
  const stats={setups:0,lastPlaced:0};

  // Nobody wins or loses here: the field stays open until the player leaves.
  checkVictory=function labNoVictory(){};
  if(root.__BATTLE__)root.__BATTLE__=Object.freeze({...root.__BATTLE__,territoryStep(){}});

  // The whole field is in sight: one watcher over the middle of the map that
  // sees everything. The explored map is filled once, not every step.
  const WATCHER={kind:'lab-watcher',side:'france',x:WORLD.width/2,y:WORLD.height/2};
  const SIGHT=Math.hypot(WORLD.width,WORLD.height);
  let explored=false;
  const baseSources=frenchVisionSources,baseRadius=visionRadius;
  frenchVisionSources=function labVisionSources(){const list=baseSources.apply(this,arguments);if(!config.fog&&(!explored||!marking))list.unshift(WATCHER);return list;};
  visionRadius=function labVisionRadius(entity){return entity===WATCHER?SIGHT:baseRadius.apply(this,arguments);};
  const baseVisible=isVisibleToFrance;
  isVisibleToFrance=function labAllVisible(){return config.fog?baseVisible.apply(this,arguments):true;};
  let marking=false;
  if(typeof markExploredV06==='function'){
    const baseMark=markExploredV06;
    markExploredV06=function labMarkExplored(){marking=true;try{return baseMark.apply(this,arguments);}finally{marking=false;explored=true;}};
  }

  function clearField(){
    clearScenarioUnitsV062();
    // No peasants and no training: the bases are scenery.
    for(const b of buildings)if(b.queue)b.queue.length=0;
    economies.britain.food=economies.britain.wood=0;
    if('iron' in economies.britain)economies.britain.iron=0;
    v05PeaceMode=!config.aiBritain;gameOver=false;
    if(typeof rebuildSpatialHash==='function')rebuildSpatialHash();
  }

  // One side's army in lines facing the enemy: infantry in the centre (eight
  // battalions to a line), guns behind it and horse on both wings.
  function placeSide(side,army){
    const dir=side==='france'?-1:1,facing=side==='france'?0:Math.PI,front=FIELD.x+dir*GAP/2;
    const spacing=Math.max(170,config.men*8),perLine=8,made=[];
    const lines=Math.ceil(army.infantry/perLine),widest=Math.min(army.infantry,perLine);
    const at=(x,y)=>({x:Math.max(80,Math.min(WORLD.width-80,x)),y:Math.max(80,Math.min(WORLD.height-80,y))});
    const form=(reg,p)=>{if(reg){made.push(reg);orderGroupPathV06(reg,p.x,p.y,'line',facing);}};
    for(let i=0;i<army.infantry;i++){
      const line=Math.floor(i/perLine),inLine=Math.min(perLine,army.infantry-line*perLine),slot=i%perLine;
      const p=at(front+dir*line*170,FIELD.y+(slot-(inLine-1)/2)*spacing);
      form(makeInfantryRegimentScenarioV062(side,p.x-80,p.y-20,config.men),p);
    }
    for(let i=0;i<army.artillery;i++){
      const p=at(front+dir*(lines*170+60),FIELD.y+(i-(army.artillery-1)/2)*110);
      const battery=makeBatteryScenarioV062(side,p.x,p.y);if(battery)made.push(battery);
    }
    const wing=(Math.max(1,widest)-1)/2*spacing+spacing;
    for(let i=0;i<army.cavalry;i++){
      const flank=i%2?1:-1,rank=Math.floor(i/2),p=at(front+dir*rank*150,FIELD.y+flank*(wing+60));
      form(makeCavalryRegimentScenarioV062(side,p.x-45,p.y-16,Math.max(6,Math.round(config.men/2.5))),p);
    }
    return made;
  }

  function focus(){camera.x=FIELD.x;camera.y=FIELD.y;camera.zoom=Math.min(camera.zoom||.6,.55);clampCamera();}
  // On a phone the iso view frames the base and the French once its pictures
  // have loaded (it marks its canvas no longer busy); look at the armies again.
  const busy=new MutationObserver(records=>{
    if(records.some(r=>r.target.getAttribute?.('aria-busy')==='false')){busy.disconnect();focus();}
  });
  busy.observe(document.body,{subtree:true,attributes:true,attributeFilter:['aria-busy']});
  setTimeout(()=>busy.disconnect(),60000);

  function setup(){
    clearField();
    const groups=[...placeSide('france',config.france),...placeSide('britain',config.britain)];
    recalcPopCap('france');recalcPopCap('britain');
    if(typeof rebuildSpatialHash==='function')rebuildSpatialHash();
    focus();
    stats.setups++;stats.lastPlaced=units.filter(u=>!u.dead).length;
    statusEl.textContent=`Testveld: ${stats.lastPlaced} soldaten opgesteld.`;
    updateHud(true);render();
    return groups.length;
  }
  // Both armies march on each other: every regiment keeps its place in the
  // line and goes for the enemy's centre line.
  function charge(){
    const centre=side=>{const men=units.filter(u=>!u.dead&&u.side===side);return men.length?centroid(men):null;};
    const fr=centre('france'),br=centre('britain');if(!fr||!br)return;
    const order=(side,own,enemy)=>{const facing=side==='france'?0:Math.PI;
      for(const reg of regiments.filter(r=>!r.destroyed&&r.side===side)){
        const men=regimentMembers(reg);if(!men.length)continue;const c=centroid(men);
        orderGroupPathV06(reg,enemy.x,enemy.y+(c.y-own.y),'line',facing);
      }};
    order('france',fr,br);if(!config.aiBritain)order('britain',br,fr);
    statusEl.textContent='Testveld: de legers rukken op.';
  }
  function setAI(on){config.aiBritain=!!on;v05PeaceMode=!on;render();}
  // Fog of war as in a match (clouds over what the French have not seen), to
  // compare its cost; off again lifts it everywhere.
  function setFog(on){
    config.fog=!!on;explored=false;
    if(config.fog&&typeof exploredCells!=='undefined')exploredCells.clear();
    root.__VISION_EPOCH__=(root.__VISION_EPOCH__||0)+1;render();
  }

  // ---- panel ----
  const style=document.createElement('style');
  style.textContent=`
  .army-lab-toggle{position:fixed;left:250px;top:122px;z-index:60;font:600 14px system-ui,sans-serif;
    padding:9px 14px;border-radius:10px;border:1px solid #c9a24d;background:#1b2621ee;color:#f3e6c4;box-shadow:0 2px 10px #0008}
  .army-lab{position:fixed;left:250px;top:170px;z-index:60;width:min(320px,calc(100vw - 24px));
    max-height:calc(100vh - 300px);overflow:auto;padding:12px;border-radius:12px;border:1px solid #c9a24d;background:#141c18f2;
    color:#f3e6c4;font:13px/1.35 system-ui,sans-serif;box-shadow:0 4px 18px #000a}
  /* Phone: above the bottom bar on the left, compact and scrolling. */
  @media (max-height:520px),(max-width:700px){
    .army-lab-toggle{left:12px;top:auto;bottom:calc(70px + env(safe-area-inset-bottom));padding:7px 12px;font-size:13px}
    .army-lab{left:12px;top:auto;bottom:calc(114px + env(safe-area-inset-bottom));max-height:calc(100vh - 170px);padding:8px 10px;font-size:12px;width:min(300px,calc(100vw - 24px))}
    .army-lab h2{display:none}
    .army-lab button{min-height:30px;padding:4px 8px;font-size:12px}
    .army-lab .lab-metrics b{font-size:14px}
  }
  .army-lab[hidden]{display:none}
  .army-lab h2{margin:0 0 8px;font-size:15px;letter-spacing:.04em}
  .army-lab .lab-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:10px}
  .army-lab .lab-metrics span{background:#0006;border-radius:6px;padding:4px 6px;text-align:center}
  .army-lab .lab-metrics b{display:block;font-size:16px}
  .army-lab .lab-presets,.army-lab .lab-actions{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px}
  .army-lab button{font:600 13px system-ui,sans-serif;min-height:36px;padding:6px 10px;border-radius:8px;border:1px solid #6d6142;background:#2a352d;color:#f3e6c4}
  .army-lab button.primary{background:#7a5a1c;border-color:#c9a24d}
  .army-lab button[aria-pressed=true]{background:#c9a24d;color:#1b2621}
  .army-lab table{width:100%;border-collapse:collapse;margin-bottom:6px}
  .army-lab th{font-weight:600;text-align:left;padding:2px 0}
  .army-lab td{padding:3px 0}
  .army-lab .stepper{display:inline-flex;align-items:center;gap:4px}
  .army-lab .stepper button{min-width:34px;min-height:32px;padding:0}
  .army-lab .stepper output{min-width:24px;text-align:center;font-weight:700}
  .army-lab label{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:4px 0}`;
  document.head.appendChild(style);
  const toggle=document.createElement('button');
  toggle.type='button';toggle.className='army-lab-toggle';toggle.textContent='Testveld';
  const panel=document.createElement('aside');
  panel.className='army-lab';panel.id='armyLab';panel.setAttribute('aria-label','Testveld');
  const KINDS=[['infantry','Infanterie'],['cavalry','Cavalerie'],['artillery','Kanonnen']];
  const stepper=(side,kind)=>`<span class="stepper"><button type="button" data-step="${side}:${kind}:-1" aria-label="minder">−</button><output data-count="${side}:${kind}"></output><button type="button" data-step="${side}:${kind}:1" aria-label="meer">+</button></span>`;
  panel.innerHTML=`<h2>TESTVELD</h2>
    <div class="lab-metrics"><span>FPS<b data-metric="fps">–</b></span><span>Frame<b data-metric="frame">–</b></span><span>Soldaten<b data-metric="units">–</b></span><span>Scherpte<b data-metric="res">–</b></span></div>
    <div class="lab-presets">${Object.keys(PRESETS).map(k=>`<button type="button" data-preset="${k}">${k[0].toUpperCase()+k.slice(1)}</button>`).join('')}</div>
    <table><tr><th></th><th>Frankrijk</th><th>Brittannië</th></tr>
    ${KINDS.map(([k,label])=>`<tr><td>${label}</td><td>${stepper('france',k)}</td><td>${stepper('britain',k)}</td></tr>`).join('')}</table>
    <label>Man per regiment<span class="stepper"><button type="button" data-men="-4" aria-label="minder">−</button><output data-men-count></output><button type="button" data-men="4" aria-label="meer">+</button></span></label>
    <label>Britse AI voert bevel<button type="button" data-ai aria-pressed="false">Uit</button></label>
    <label>Fog of war<button type="button" data-fog aria-pressed="false">Uit</button></label>
    <label>Tekenen met<button type="button" data-renderer>Canvas</button></label>
    <div class="lab-actions"><button type="button" class="primary" data-action="setup">Plaats legers</button><button type="button" data-action="charge">Ten aanval!</button><button type="button" data-action="clear">Leeg veld</button></div>`;
  toggle.addEventListener('click',()=>{panel.hidden=!panel.hidden;});
  panel.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.step){const[side,kind,d]=b.dataset.step.split(':');config[side][kind]=Math.max(0,Math.min(LIMITS[kind],config[side][kind]+Number(d)));}
    else if(b.dataset.preset){config.france={...PRESETS[b.dataset.preset]};config.britain={...PRESETS[b.dataset.preset]};}
    else if(b.dataset.men)config.men=Math.max(8,Math.min(48,config.men+Number(b.dataset.men)));
    else if('ai' in b.dataset)setAI(!config.aiBritain);
    else if('fog' in b.dataset)setFog(!config.fog);
    // The WebGL scene is chosen when the page loads: reload with the other one.
    else if('renderer' in b.dataset){const url=new URL(location.href);url.searchParams.set('gl',root.__ISO_GL_SCENE_V1__?.active()?'0':'1');location.replace(url.href);return;}
    else if(b.dataset.action==='setup')setup();
    else if(b.dataset.action==='charge')charge();
    else if(b.dataset.action==='clear'){clearField();statusEl.textContent='Testveld: het veld is leeg.';}
    render();
  });
  // Open on a large screen; on a phone it waits behind its button.
  panel.hidden=matchMedia('(max-height:520px),(max-width:700px)').matches;
  document.body.append(panel,toggle);
  function render(){
    for(const o of panel.querySelectorAll('[data-count]')){const[side,kind]=o.dataset.count.split(':');o.textContent=config[side][kind];}
    panel.querySelector('[data-men-count]').textContent=config.men;
    const ai=panel.querySelector('[data-ai]');ai.setAttribute('aria-pressed',String(config.aiBritain));ai.textContent=config.aiBritain?'Aan':'Uit';
    const gl=panel.querySelector('[data-renderer]');gl.textContent=root.__ISO_GL_SCENE_V1__?.active()?'WebGL':'Canvas';
    const fog=panel.querySelector('[data-fog]');fog.setAttribute('aria-pressed',String(config.fog));fog.textContent=config.fog?'Aan':'Uit';
  }
  // Frame rate measured here, independent of which renderer is drawing.
  let frames=0,since=performance.now(),worst=0,last=since;
  const fpsEl=panel.querySelector('[data-metric=fps]'),frameEl=panel.querySelector('[data-metric=frame]'),unitsEl=panel.querySelector('[data-metric=units]'),resEl=panel.querySelector('[data-metric=res]');
  (function tick(now){
    frames++;worst=Math.max(worst,now-last);last=now;
    if(now-since>=500){
      if(!panel.hidden){fpsEl.textContent=Math.round(frames*1000/(now-since));frameEl.textContent=`${Math.round(worst)} ms`;
        unitsEl.textContent=units.reduce((n,u)=>n+(u.dead?0:1),0);
        // Drawing resolution: the adaptive governor's share of the full budget.
        const k=root.__MOBILE_RENDER_BUDGET_V1__?.scale?.()??1;resEl.textContent=`${Math.round(k*100)}%`;}
      frames=0;since=now;worst=0;
    }
    requestAnimationFrame(tick);
  })(performance.now());

  // A reset (new game from the menu) brings back a normal match; set the field up again.
  root.NRTS?.events?.on?.('game:reset',()=>setTimeout(setup,0));
  setup();
  root.__ARMY_LAB_V1__=Object.freeze({version:'1.0',config,setup,charge,clear:clearField,setAI,setFog,field:FIELD,stats:()=>({...stats})});
})(window);
