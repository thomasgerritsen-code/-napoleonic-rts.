'use strict';
// Iron is a finite geological reserve, accessible only through a completed,
// owned mine. All extraction runs in updateWorker, including on the authority.
(function installMining(root){
  const cfg=root.NRTS_CONFIG?.mining;if(!cfg||root.__MINES_V1__)return;
  const scale=root.__GAMEPLAY_BUILDING_SCALE_V1__?.scale||1.34;
  BUILDINGS.mine={w:72*scale,h:58*scale,hp:cfg.hp,label:'IJzermijn',cost:{wood:cfg.wood}};
  const baseValid=validBuildingSpot,baseCreate=createBuilding,baseConstruct=constructBuilding;
  let workerSide=null,assigningAI=false;
  const {edgeDistance,approach,walk}=root.__WORK_SITE_NAV_V1__;
  const deposits=()=>resources.filter(r=>r.type==='iron'&&r.deposit&&!r.dead);
  const reserve=b=>resources.find(r=>r.id===b?.depositId&&r.deposit)||deposits().find(r=>Math.hypot(r.x-(b?.x||0),r.y-(b?.y||0))<2);
  const occupied=r=>buildings.some(b=>!b.dead&&b.type==='mine'&&b.depositId===r.id);
  const depositAt=(x,y)=>deposits().find(r=>Math.hypot(r.x-x,r.y-y)<=r.radius);
  const mineFor=(r,side)=>buildings.find(b=>!b.dead&&b.complete&&b.type==='mine'&&b.side===side&&b.depositId===r?.id);
  const usable=(r,side)=>!!r?.deposit&&!r.dead&&r.amount>0&&!!mineFor(r,side);
  function clearSite(p){
    const radius=Math.hypot(BUILDINGS.mine.w,BUILDINGS.mine.h)/2;
    return baseValid('mine',p.x,p.y)&&!waterAtV067(p.x,p.y)&&
      !resources.some(r=>r.type!=='iron'&&!r.dead&&r.amount>0&&Math.hypot(r.x-p.x,r.y-p.y)<radius+(r.radius||20)+8);
  }
  function consolidate(){
    const raw=resources.filter(r=>r.type==='iron'&&!r.deposit&&!r.dead),groups=[];
    const remaining=new Set(raw);
    while(remaining.size){
      const first=remaining.values().next().value,group=[first];remaining.delete(first);
      for(let i=0;i<group.length;i++)for(const r of remaining)if(Math.hypot(r.x-group[i].x,r.y-group[i].y)<220){group.push(r);remaining.delete(r);}
      groups.push(group);
    }
    const removed=new Set();
    for(const group of groups){
      const center={x:group.reduce((n,r)=>n+r.x,0)/group.length,y:group.reduce((n,r)=>n+r.y,0)/group.length};
      let point=clearSite(center)&&!deposits().some(r=>Math.hypot(r.x-center.x,r.y-center.y)<220)?center:null;
      for(let ring=1;ring<=24&&!point;ring++)for(let i=0;i<24&&!point;i++){
        const a=i/24*Math.PI*2,p={x:center.x+Math.cos(a)*ring*24,y:center.y+Math.sin(a)*ring*24};
        if(clearSite(p)&&!deposits().some(r=>Math.hypot(r.x-p.x,r.y-p.y)<220))point=p;
      }
      if(!point)throw Error('Geen veilige plek voor steenrijk gebied');
      const r=group[0],amount=group.reduce((n,r)=>n+r.amount,0);
      Object.assign(r,{...point,amount,maxAmount:amount,radius:cfg.depositRadius,deposit:true,visualKind:'iron-field'});
      for(const old of group.slice(1)){removed.add(old);old.dead=true;old.amount=0;}
    }
    if(removed.size)resources.splice(0,resources.length,...resources.filter(r=>!removed.has(r)));
    root.__VISION_EPOCH__=(root.__VISION_EPOCH__||0)+1;
    root.__LARGE_ARMY_PERFORMANCE_V1__?.prepareFrameIndexes();
  }
  function buildSite(x,y){const r=depositAt(x,y);return r&&r.amount>0&&!occupied(r)&&baseValid('mine',r.x,r.y)?r:null;}
  validBuildingSpot=function validMineSite(type,x,y){return type==='mine'?!!buildSite(x,y):baseValid(type,x,y);};
  createBuilding=function createMine(side,type,x,y,complete=true){
    if(type!=='mine')return baseCreate(side,type,x,y,complete);
    const r=buildSite(x,y);if(!r)return null;
    const b=baseCreate(side,type,r.x,r.y,complete);if(b)b.depositId=r.id;return b;
  };
  constructBuilding=function constructMine(side,type,x,y,workers){
    if(type!=='mine')return baseConstruct(side,type,x,y,workers);
    const r=buildSite(x,y);
    if(!r){if(side==='france')statusEl.textContent='Bouw een mijn op een vrije, steenrijke afzetting.';return null;}
    return baseConstruct(side,type,r.x,r.y,workers);
  };
  const baseNearest=nearestResource;
  nearestResource=function nearestWorkableResource(type,x,y,excluded=null){
    if(type!=='iron')return baseNearest(type,x,y,excluded);
    if(assigningAI&&units.filter(u=>!u.dead&&u.side==='britain'&&u.preferredResourceType==='iron'&&['mine','return','gather'].includes(u.task)).length>=2)return null;
    return deposits().filter(r=>r!==excluded&&usable(r,workerSide||'france')).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0]||null;
  };
  function assign(u,r){
    const b=mineFor(r,u?.side);if(!u||u.dead||u.type!=='worker'||!usable(r,u.side)||!b)return false;
    if(u.mineId===b.id&&u.task==='mine')return true;
    const slots=new Set(units.filter(v=>v!==u&&!v.dead&&v.mineId===b.id&&['mine','return'].includes(v.task)).map(v=>v.mineSlot));
    let slot=0;while(slots.has(slot))slot++;
    const p=root.__UNIT_PLACEMENT__.nearest({x:b.x+(slot%6-2.5)*18,y:b.y+b.h/2+32+Math.floor(slot/6)*23},'worker',{ignore:u});
    if(!p)return false;
    delete u.lumberCampId;
    Object.assign(u,{mineId:b.id,mineSlot:slot,mineWorkX:p.x,mineWorkY:p.y,resourceTarget:r,returnResource:r,
      preferredResourceType:'iron',resourceExhaustedStop:false,buildingTarget:null,farmId:null,gatherClock:0,task:u.carry>0?'return':'mine',targetX:p.x,targetY:p.y});
    return true;
  }
  const baseAssign=assignWorkerToResource;
  assignWorkerToResource=function assignMineResource(u,r){
    if(r?.type==='iron')return assign(u,r);
    if(u){delete u.mineId;delete u.mineSlot;}
    return baseAssign(u,r);
  };
  const baseGather=assignGather;
  assignGather=function gatherThroughMine(r){
    if(r?.type!=='iron')return baseGather(r);
    let count=0;for(const u of selectedUnits)if(u?.side==='france'&&assign(u,r))count++;
    statusEl.textContent=count?`${count} boer${count===1?'':'en'} werkt in de ijzermijn.`:'Bouw en voltooi eerst een eigen mijn op dit steenrijke gebied.';
    return count>0;
  };
  const baseWorker=updateWorker;
  updateWorker=function updateMineWorker(u,dt){
    const prior=workerSide;workerSide=u.side;
    try{
      const wasBuild=u.task==='build'&&u.buildingTarget?.type==='mine',built=wasBuild?u.buildingTarget:null;
      if(wasBuild){
        if(built.dead||built.side!==u.side){stopWorkerAtCurrentPosition(u);return;}
        if(built.complete){assign(u,reserve(built));return;}
        if(edgeDistance(u,built)>64){const p=approach(u,built);walk(u,p.x,p.y,dt);return;}
        built.construction=Math.min(1,built.construction+dt*.20);built.hp=built.maxHp*built.construction;
        if(built.construction>=1){built.complete=true;recalcPopCap(built.side);actionSignature='';assign(u,reserve(built));}
        return;
      }
      if(u.task==='gather'&&u.resourceTarget?.type==='iron'){
        if(!assign(u,u.resourceTarget)){if(u.carry>0)u.task='return';else stopWorkerAtCurrentPosition(u);return;}
      }
      // Delivery uses distance to the footprint: the larger headquarters cannot
      // be entered, so a fixed centre distance strands carts outside its walls.
      if(u.task==='return'&&u.mineId){
        const tc=nearestTownCenter(u.side,u.x,u.y);if(!tc){stopWorkerAtCurrentPosition(u);return;}
        if(edgeDistance(u,tc)>64){const p=approach(u,tc);walk(u,p.x,p.y,dt);return;}
        if(u.carryType&&u.carry>0)economies[u.side][u.carryType]+=u.carry;
        u.carry=0;u.carryType=null;
        const r=reserve(buildings.find(b=>b.id===u.mineId));
        if(!assign(u,r))stopWorkerAtCurrentPosition(u);
        return;
      }
      if(u.task==='mine'){
        const b=buildings.find(b=>b.id===u.mineId),r=reserve(b);
        if(!b||b.dead||!b.complete||b.side!==u.side||!r||r.amount<=0){
          if(u.carry>0)u.task='return';else stopWorkerAtCurrentPosition(u);
          return;
        }
        if(u.carry>=25){u.task='return';return;}
        if(Math.hypot(u.x-u.mineWorkX,u.y-u.mineWorkY)>8){walk(u,u.mineWorkX,u.mineWorkY,dt);return;}
        u.gatherClock=(u.gatherClock||0)+dt;
        if(u.gatherClock>=.45){const take=Math.min(5,r.amount,25-u.carry);u.gatherClock=0;r.amount-=take;u.carry+=take;u.carryType='iron';if(u.carry>=25||r.amount<=0)u.task='return';}
        return;
      }
      const result=baseWorker(u,dt);
      if(built?.complete&&!built.dead)assign(u,reserve(built));
      return result;
    }finally{workerSide=prior;}
  };
  const baseAI=autoAssignAIWorkers;
  autoAssignAIWorkers=function assignMiningAI(){
    const prior=workerSide;workerSide='britain';
    try{
      assigningAI=true;try{baseAI();}finally{assigningAI=false;}
      if(elapsed<70||root.__NRTS_SERVER__||root.__NRTS_HUMAN_BRITAIN__)return;
      const mines=buildings.filter(b=>!b.dead&&b.type==='mine'&&b.side==='britain'&&reserve(b)?.amount>0);
      if(!mines.length&&canAfford('britain',BUILDINGS.mine.cost)){
        const home=livingBuildings('britain').find(b=>b.type==='towncenter'),workers=livingUnits('britain').filter(u=>u.type==='worker'&&u.task!=='build'&&u.task!=='mine'&&!u.carry).slice(-2);
        const site=home&&deposits().filter(r=>buildSite(r.x,r.y)).sort((a,b)=>Math.hypot(a.x-home.x,a.y-home.y)-Math.hypot(b.x-home.x,b.y-home.y))[0];
        if(site&&workers.length)constructBuilding('britain','mine',site.x,site.y,workers);
      }
      for(const b of mines.filter(b=>!b.complete))if(!units.some(u=>!u.dead&&u.task==='build'&&u.buildingTarget===b)){
        for(const u of livingUnits('britain').filter(u=>u.type==='worker'&&u.task!=='build'&&!u.carry).slice(-2))Object.assign(u,{task:'build',buildingTarget:b,targetX:b.x,targetY:b.y});
      }
      const site=deposits().find(r=>usable(r,'britain'));
      if(site&&units.filter(u=>!u.dead&&u.side==='britain'&&u.task==='mine').length<2){
        const u=livingUnits('britain').find(u=>u.type==='worker'&&u.task!=='build'&&u.task!=='mine'&&!u.carry);if(u)assign(u,site);
      }
    }finally{workerSide=prior;}
  };
  const baseReset=resetGame;
  resetGame=function resetMining(...args){const r=baseReset.apply(this,args);consolidate();return r;};
  const api={deposits,reserve,depositAt,buildSite,usable,mineFor,assign,
    nearestMine(side,x,y){return deposits().filter(r=>usable(r,side)).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0]||null;},
    stats:()=>({deposits:deposits().length,mines:buildings.filter(b=>!b.dead&&b.type==='mine').length,workers:units.filter(u=>!u.dead&&u.task==='mine').length})};
  root.__MINES_V1__=Object.freeze(api);
  if(document.readyState==='complete')consolidate();else addEventListener('load',consolidate,{once:true});
  if(root.__NRTS_SERVER__)return;
  const baseActions=renderDynamicActions;
  renderDynamicActions=function miningActions(...args){
    baseActions(...args);
    const workers=[...selectedUnits].filter(u=>!u.dead&&u.side==='france'&&u.type==='worker');
    for(const[action,label]of[['build-mine',`IJzermijn<br><small>${cfg.wood} 🪵 · op afzetting</small>`],['mine-assign','Werk in mijn<br><small>boeren inzetten</small>']]){
      let button=actionsEl.querySelector(`[data-action="${action}"]`);
      if(!workers.length){button?.remove();continue;}
      if(!button){button=makeDynamicButton(action,label);actionsEl.appendChild(button);}
      button.disabled=action==='build-mine'?!canAfford('france',BUILDINGS.mine.cost):!api.nearestMine('france',workers[0].x,workers[0].y);
    }
  };
  actionsEl.addEventListener('click',e=>{
    const action=e.target.closest('button')?.dataset.action;
    if(action==='build-mine'){startBuild('mine');statusEl.textContent='Plaats de ijzermijn op een steenrijk gebied.';}
    if(action==='mine-assign'){const u=[...selectedUnits].find(u=>u.type==='worker');const r=u&&api.nearestMine('france',u.x,u.y);if(r)assignGather(r);}
  });
  canvas.addEventListener('contextmenu',e=>{
    if(buildMode||![...selectedUnits].some(u=>u.type==='worker'))return;
    const p=screenToWorld(e.clientX,e.clientY),b=buildingAt(p.x,p.y,'france');
    if(b?.type==='mine'){e.preventDefault();e.stopImmediatePropagation();assignGather(reserve(b));}
  },true);
  const baseHud=updateHud;
  updateHud=function miningHud(...args){const r=baseHud(...args);const b=selectedBuilding;
    if(b?.type==='mine'){const d=reserve(b),count=units.filter(u=>!u.dead&&u.mineId===b.id&&['mine','return'].includes(u.task)).length;setSelectionDetails(`${b.complete?'IJzerreserve':'Bouwplaats'} · ${Math.floor(d?.amount||0)} ijzer · ${count} mijnwerkers${d?.amount<=0?' · uitgeput':''}`);}
    return r;
  };
})(window);
