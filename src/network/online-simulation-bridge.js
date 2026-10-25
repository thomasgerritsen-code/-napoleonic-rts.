'use strict';
// Transitional adapter: the server runs the existing simulation without drawing.
// Online clients only consume views; they never call the simulation update chain.
(function installOnlineSimulationBridge(root) {
  if (document.readyState !== 'complete') { addEventListener('load', () => installOnlineSimulationBridge(root), {once:true}); return; }
  const flip = side => side === 'france' ? 'britain' : side === 'britain' ? 'france' : side;
  const scalar = value => value === null || typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean';
  function copyScalars(obj) {
    const result={};
    for(const key of Object.keys(obj)){
      const value=obj[key];if(!scalar(value))continue;
      // Keep Object.fromEntries semantics for a literal data property.
      if(key==='__proto__')Object.defineProperty(result,key,{value,enumerable:true,writable:true,configurable:true});
      else result[key]=value;
    }
    return result;
  }
  const point = p => p ? {x:p.x,y:p.y,type:p.type,kind:p.kind,dead:!!p.dead} : null;
  const visibleKeys = ['id','kind','side','type','x','y','facing','hp','maxHp','dead','morale','routing',
    'regimentId','troop','chargeTimer','reload','lastFireAt','firedAt','misfiredAt','attackMode','artilleryMode'];
  const pick = (obj,keys) => Object.fromEntries(keys.filter(k => scalar(obj[k])).map(k => [k,obj[k]]));

  if (root.__NRTS_SERVER__) {
    const deaths=new Map(),deadSeen=new WeakSet();
    root.__NRTS_HUMAN_BRITAIN__ = true;
    // All strategic AI entry points, including building helpers, stay off in PvP.
    for (const name of ['aiDevelop','aiMilitaryOrder','aiCommanderMilitaryOrderV1','aiOrderReg','aiBuild','aiQueue','autoAssignAIWorkers']) {
      if (typeof root[name] === 'function') root[name] = () => false;
    }
    // The legacy input layer assumes a French local player. A synchronous input
    // scope presents Britain's objects as local only while applying its command.
    // No simulation tick or asynchronous callback runs inside this scope. Restore
    // every object in finally, including entities created by the command.
    function apply(side,command) {
      const swap = side === 'britain';
      const sideEntities=()=>[...units,...buildings,...regiments,...(root.__REGIMENT_ORDERS_V1__?.trenches()||[])];
      const before = swap ? sideEntities() : [];
      const queueLength = command.buildingId ? buildings.find(b=>b.id===command.buildingId)?.queue.length : 0;
      const buildingCount=buildings.length,groupCount=regiments.length;
      if (command.type === 'gather' && !resources.some(r => r.id === command.data.resourceId && !r.dead)) return false;
      const troop = command.type === 'train-troop' && root.NRTS_CONFIG?.troops?.kinds[command.data.troop];
      if (troop && !(troop.sides || ['france','britain']).includes(side)) return false;
      if (swap) {
        for (const e of before) e.side=flip(e.side);
        [economies.france,economies.britain]=[economies.britain,economies.france];
        root.__VISION_EPOCH__=(root.__VISION_EPOCH__||0)+1;
      }
      root.__NRTS_COMMAND_SIDE__=side;
      try {
        const result=root.__COMMAND_GATEWAY_V1__.applyAuthorized(command);
        if(['train','train-troop'].includes(command.type))return buildings.find(b=>b.id===command.buildingId)?.queue.length>queueLength;
        if(command.type==='build')return buildings.length>buildingCount;
        if(command.type==='create-regiment')return regiments.length>groupCount;
        return result;
      }
      finally {
        if (swap) {
          for (const e of sideEntities()) e.side=flip(e.side);
          for(const r of regiments.slice(groupCount))r.name=r.name?.replace(/^Franse /,'Britse ').replace(/^Frans /,'Brits ');
          [economies.france,economies.britain]=[economies.britain,economies.france];
          root.__VISION_EPOCH__=(root.__VISION_EPOCH__||0)+1;
        }
        root.__NRTS_COMMAND_SIDE__=null;
      }
    }
    function snapshotFor(side) {
      for(const u of units){if(u.dead&&!deadSeen.has(u)){deadSeen.add(u);deaths.set(u.id,{u,at:elapsed});}else if(!u.dead){deaths.delete(u.id);deadSeen.delete(u);}}
      for(const [id,d]of deaths)if(elapsed-d.at>30)deaths.delete(id);
      while(deaths.size>512)deaths.delete(deaths.keys().next().value);
      // A snapshot is synchronous: sight ranges and positions do not change
      // while it is built. Reuse each watcher's range and each entity's result
      // only within this snapshot; the next side/tick gets fresh visibility.
      const watchers=[...units.filter(u=>!u.dead&&u.side===side),...buildings.filter(b=>!b.dead&&b.complete&&b.side===side)]
        .map(w=>({x:w.x,y:w.y,r2:visionRadius(w)**2}));
      const seen=new Map();
      const canSee=e=>{
        if(e.side===side)return true;
        if(seen.has(e))return seen.get(e);
        const visible=watchers.some(w=>(e.x-w.x)**2+(e.y-w.y)**2<=w.r2);
        seen.set(e,visible);return visible;
      };
      const visibleUnits=units.filter(u=>!u.dead&&canSee(u)), ids=new Set(visibleUnits.map(u=>u.id));
      const viewSide=e=>({...e,nativeSide:e.side,side:side==='britain'?flip(e.side):e.side});
      const unitViews=visibleUnits.map(u=>{
        const own=u.side===side, v=own?copyScalars(u):pick(u,visibleKeys);
        // Enemy destinations, tasks, economy and internal navigation are private.
        if (!own) {v.targetX=u.x;v.targetY=u.y;}
        if (own) for(const key of ['resourceTarget','buildingTarget','returnResource'])v[key]=point(u[key]);
        return viewSide(v);
      });
      const buildingViews=buildings.filter(b=>!b.dead&&canSee(b)).map(b=>{
        const own=b.side===side, v=own?copyScalars(b):pick(b,['id','kind','side','type','x','y','w','h','hp','maxHp','complete','construction','dead']);
        v.queue=own?b.queue.map(copyScalars):[]; v.production=own?b.production:0;
        return viewSide(v);
      });
      const groups=regiments.filter(r=>!r.destroyed&&r.memberIds.some(id=>ids.has(id))).map(r=>{
        const v=r.side===side?copyScalars(r):pick(r,['id','side','kind','name','formation','facing','morale','troop','destroyed','defend']);
        v.memberIds=r.memberIds.filter(id=>ids.has(id));
        v.crewIds=(r.crewIds||[]).filter(id=>ids.has(id));
        if(r.side===side){v.officerId=r.officerId;v.drummerId=r.drummerId;}
        return viewSide(v);
      });
      // Resource geography is public. Depletion is only revealed in vision.
      const resourceViews=resources.map(r=>({...copyScalars(r),amount:canSee(r)?r.amount:r.maxAmount,dead:canSee(r)?r.dead:false}));
      const shots=projectiles.filter(p=>canSee(p)).map(p=>({...copyScalars(p),side:side==='britain'?flip(p.side):p.side,target:canSee(p.target||p)?point(p.target):null}));
      const trenches=(root.__REGIMENT_ORDERS_V1__?.trenches()||[]).filter(canSee).map(t=>({...viewSide(copyScalars(t)),...(t.upgrade?{upgrade:pick(t.upgrade,['to','progress'])}:{})}));
      const wounded=(root.__MEDICS_V1__?.wounded()||[]).filter(canSee).map(w=>({...viewSide(copyScalars(w)),u:viewSide(pick(w.u,visibleKeys))}));
      const woundedById=new Map(wounded.map(w=>[w.id,w]));
      const teams=(root.__MEDICS_V1__?.teams()||[]).filter(canSee).map(t=>({...viewSide(copyScalars(t)),target:woundedById.get(t.target?.id)||null}));
      const animals=(root.__WILDLIFE_V1__?.animals()||[]).filter(canSee).map(a=>pick(a,['id','kind','x','y','facing','state']));
      const grenades={};
      for(const key of ['flying','bursts','scorches'])grenades[key]=(root.__GRENADES_V1__?.[key]()||[]).filter(g=>key==='flying'?canSee({x:g.x0,y:g.y0,side:g.side})&&canSee({x:g.x1,y:g.y1}):canSee(g)).map(copyScalars);
      let winner=null;
      if(gameOver){const alive=s=>buildings.some(b=>!b.dead&&b.side===s&&b.type==='towncenter')||units.some(u=>!u.dead&&u.side===s&&u.type!=='worker');winner=alive('france')?'france':alive('britain')?'britain':'draw';}
      return {elapsed,world:{...WORLD},economy:{...economies[side]},units:unitViews,buildings:buildingViews,groups,
        resources:resourceViews,projectiles:shots,trenches,wounded,teams,animals,grenades,deaths:[...deaths.values()].filter(d=>canSee(d.u)).map(d=>d.u.id),weather:root.__WEATHER_V1__?.state(),gameOver,winner};
    }
    const authority=root.NRTS_MATCH_AUTHORITY.create({unit:id=>units.find(u=>u.id===id),building:id=>buildings.find(b=>b.id===id),world:()=>WORLD,
      apply,step:dt=>{for(let i=0;i<3;i++)update(dt/3);},snapshotFor},{hz:20});
    authority.addPlayer('france','france');authority.addPlayer('britain','britain');
    root.__ONLINE_SIM_V1__=Object.freeze({
      advance(commands=[],advance=true,snapshot=true,seconds=.05){const receipts=commands.map(c=>({side:c.side,...authority.submit(c.side,c.command)}));if(advance)authority.advance(seconds);return {receipts,...(snapshot?{views:{france:authority.snapshotFor('france'),britain:authority.snapshotFor('britain')}}:{})};},
      stats:()=>authority.stats()
    });
    return;
  }

  const baseRegiment=getRegiment, baseMembers=regimentMembers;
  getRegiment=function(id){return root.__ONLINE_MATCH_V1__?.active?regiments.find(r=>r.id===id&&!r.destroyed)||null:baseRegiment(id);};
  regimentMembers=function(r){return root.__ONLINE_MATCH_V1__?.active?units.filter(u=>!u.dead&&r.memberIds.includes(u.id)):baseMembers(r);};
  let initial=true, receivedAt=0, serverElapsed=0, snapshotTime=0;
  const positions=new Map(),targets=new Map();
  const remoteWounds=[],remoteTeams=[],remoteWoundById=new Map();let medicsInstalled=false;
  function reconcile(list,rows){
    const map=new Map(list.map(e=>[e.id,e]));
    const keep=[];
    for(const row of rows){const obj=map.get(row.id)||{};for(const key of Object.keys(obj))if(!(key in row))delete obj[key];Object.assign(obj,row);keep.push(obj);}
    list.splice(0,list.length,...keep);
  }
  function receive(view){
    const s=view.state, now=performance.now();
    const deadIds=new Set(s.deaths);for(const u of units)if(deadIds.has(u.id))u.dead=true;
    for(const u of units)positions.set(u.id,{x:u.x,y:u.y,facing:u.facing});
    reconcile(units,s.units);reconcile(buildings,s.buildings);reconcile(regiments,s.groups);reconcile(resources,s.resources);
    targets.clear();for(const u of s.units)targets.set(u.id,u);
    projectiles.splice(0,projectiles.length,...s.projectiles);particles.length=0;
    const trenches=root.__REGIMENT_ORDERS_V1__?.trenches();if(trenches)trenches.splice(0,trenches.length,...s.trenches);
    const animals=root.__WILDLIFE_V1__?.animals();if(animals)animals.splice(0,animals.length,...s.animals);
    for(const key of ['flying','bursts','scorches']){const list=root.__GRENADES_V1__?.[key]();if(list)list.splice(0,list.length,...s.grenades[key]);}
    const M=root.__MEDICS_V1__;
    if(M){
      for(const w of s.wounded){const old=remoteWoundById.get(w.id)||{};Object.assign(old,w);remoteWoundById.set(w.id,old);}
      const woundIds=new Set(s.wounded.map(w=>w.id));for(const id of remoteWoundById.keys())if(!woundIds.has(id))remoteWoundById.delete(id);
      remoteWounds.splice(0,remoteWounds.length,...remoteWoundById.values());remoteTeams.splice(0,remoteTeams.length,...s.teams.map(t=>({...t,target:remoteWoundById.get(t.target?.id)||null})));
      if(!medicsInstalled){root.__MEDICS_V1__={...M,wounded:()=>remoteWounds,byId:id=>remoteWoundById.get(id)||null,isWounded:id=>remoteWoundById.has(id),teams:()=>remoteTeams};medicsInstalled=true;}
    }
    for(const id of positions.keys())if(!targets.has(id))positions.delete(id);
    for(const u of [...selectedUnits])if(!units.includes(u)||u.dead)selectedUnits.delete(u);
    if(!buildings.includes(selectedBuilding))selectedBuilding=null;
    Object.assign(WORLD,s.world);Object.assign(economies.france,s.economy);
    economies.britain={food:0,wood:0,iron:0,popCap:0};
    root.__WEATHER_V1__?.receive(s.weather);
    serverElapsed=s.elapsed;receivedAt=now;snapshotTime=Math.min(160,Math.max(50,now-(snapshotTime?root.__ONLINE_MATCH_V1__.lastReceivedAt:now-100)));
    elapsed=s.elapsed;gameOver=s.gameOver;root.__VISION_EPOCH__=(root.__VISION_EPOCH__||0)+1;
    if(initial){const home=buildings.find(b=>b.side==='france'&&b.type==='towncenter');if(home){camera.x=home.x;camera.y=home.y;}selectedUnits.clear();initial=false;}
    if(s.gameOver)showBattleOutcome(s.winner==='draw'?'GELIJKSPEL':s.winner===view.side?'OVERWINNING!':'NEDERLAAG','De online veldslag is afgelopen.');
    else messageEl.classList.add('hidden');
    actionSignature='';updateHud(true);
  }
  function frame(now,dt){
    const online=root.__ONLINE_MATCH_V1__, t=Math.min(1,(now-receivedAt)/Math.max(50,snapshotTime));
    for(const u of units){const from=positions.get(u.id);const to=targets.get(u.id);if(!from||!to)continue;
      u.x=from.x+(to.x-from.x)*t;u.y=from.y+(to.y-from.y)*t;
      let angle=to.facing-from.facing;angle=Math.atan2(Math.sin(angle),Math.cos(angle));u.facing=from.facing+angle*t;
      u.renderPrevXV071=u.x;u.renderPrevYV071=u.y;u.renderPrevFacingV071=u.facing;
    }
    elapsed=online.phase==='playing'?Math.max(0,serverElapsed-.1)+Math.min(.1,(now-receivedAt)/1000):serverElapsed;
    if(typeof V071_RENDER_ALPHA!=='undefined')V071_RENDER_ALPHA=1;
    const speed=520/camera.zoom*dt;
    if(keys.has('w')||keys.has('arrowup'))camera.y-=speed;if(keys.has('s')||keys.has('arrowdown'))camera.y+=speed;
    if(keys.has('a')||keys.has('arrowleft'))camera.x-=speed;if(keys.has('d')||keys.has('arrowright'))camera.x+=speed;
    clampCamera();
    if(typeof markExploredV06==='function')markExploredV06();
  }
  root.__ONLINE_VIEW_V1__=Object.freeze({receive,frame});
})(window);
