'use strict';
// Forests remain finite and visible. A finished, owned camp is required to fell
// nearby trees; cargo is credited only when a worker reaches its delivery yard.
(function installLogging(root){
  const cfg=root.NRTS_CONFIG?.logging;if(!cfg||root.__LUMBER_V1__)return;
  const {walk,approach,edgeDistance}=root.__WORK_SITE_NAV_V1__;
  const scale=root.__GAMEPLAY_BUILDING_SCALE_V1__?.scale||1.34;
  BUILDINGS.lumbercamp={w:76*scale,h:54*scale,hp:cfg.hp,label:'Houthakkerskamp',cost:{wood:cfg.wood}};
  const tree=r=>r?.type==='wood'&&!r.dead&&r.amount>0;
  const camps=side=>buildings.filter(b=>!b.dead&&b.type==='lumbercamp'&&(!side||b.side===side));
  const covered=(r,b)=>tree(r)&&b&&Math.hypot(r.x-b.x,r.y-b.y)<=cfg.radius;
  function campFor(r,side){return camps(side).filter(b=>b.complete&&covered(r,b)).sort((a,b)=>Math.hypot(a.x-r.x,a.y-r.y)-Math.hypot(b.x-r.x,b.y-r.y))[0]||null;}
  function nearestTree(side,x,y,camp=null,excluded=null){
    let best=null,distance=Infinity;
    const own=camps(side).filter(b=>b.complete&&(!camp||b===camp));if(!own.length)return null;
    for(const r of resources){if(r===excluded||!tree(r)||!own.some(b=>covered(r,b)))continue;const d=(r.x-x)**2+(r.y-y)**2;if(d<distance){best=r;distance=d;}}
    return best;
  }
  const baseValid=validBuildingSpot,baseCreate=createBuilding;
  function validSite(x,y){
    if(!baseValid('lumbercamp',x,y)||waterAtV067(x,y))return false;
    const d=BUILDINGS.lumbercamp,clearance=Math.hypot(d.w,d.h)/2+20;let count=0;
    for(const r of resources){
      if(r.dead||r.amount<=0)continue;const distance=Math.hypot(r.x-x,r.y-y);
      if(distance<clearance+(r.radius||12))return false;if(tree(r)&&distance<=cfg.radius)count++;
    }
    if(typeof TERRAIN_WOODS!=='undefined'&&TERRAIN_WOODS.some(w=>x>w.x-d.w/2-16&&x<w.x+w.w+d.w/2+16&&y>w.y-d.h/2-16&&y<w.y+w.h+d.h/2+16))return false;
    return count>=cfg.minTrees;
  }
  validBuildingSpot=function validCamp(type,x,y){return type==='lumbercamp'?validSite(x,y):baseValid(type,x,y);};
  createBuilding=function createCamp(side,type,x,y,complete=true){if(type==='lumbercamp'&&!validSite(x,y))return null;return baseCreate(side,type,x,y,complete);};
  function findSite(side){
    const home=livingBuildings(side).find(b=>b.type==='towncenter');if(!home)return null;
    const nearby=resources.filter(tree).sort((a,b)=>Math.hypot(a.x-home.x,a.y-home.y)-Math.hypot(b.x-home.x,b.y-home.y));
    for(const r of nearby.slice(0,40))for(const radius of[130,190,260,330])for(let i=0;i<12;i++){
      const a=Math.atan2(home.y-r.y,home.x-r.x)+i/12*Math.PI*2,p={x:r.x+Math.cos(a)*radius,y:r.y+Math.sin(a)*radius};if(validSite(p.x,p.y))return p;
    }
    return null;
  }
  let workerSide=null;
  const baseNearest=nearestResource;
  nearestResource=function nearestCampResource(type,x,y,excluded=null){return type==='wood'?nearestTree(workerSide||'france',x,y,null,excluded):baseNearest(type,x,y,excluded);};
  const baseAssign=assignWorkerToResource;
  function assign(u,r,camp=null){
    if(!u||u.dead||u.type!=='worker'||!tree(r))return false;
    const b=camp||campFor(r,u.side);if(!b||b.dead||!b.complete||b.side!==u.side||!covered(r,b))return false;
    baseAssign(u,r);u.lumberCampId=b.id;u.buildingTarget=null;u.farmId=null;u.gatherClock=0;
    if(u.carry>0)u.task='lumber-deliver';return true;
  }
  assignWorkerToResource=function assignCampResource(u,r){
    if(r?.type==='wood')return assign(u,r);
    if(u)delete u.lumberCampId;return baseAssign(u,r);
  };
  const baseGather=assignGather;
  assignGather=function gatherWithCamp(r){
    if(r?.type!=='wood')return baseGather(r);
    let n=0;for(const u of selectedUnits)if(u?.side==='france'&&assign(u,r))n++;
    statusEl.textContent=n?`${n} boer${n===1?'':'en'} kapt hout voor het houthakkerskamp.`:'Bouw en voltooi eerst een eigen houthakkerskamp bij dit bos.';return n>0;
  };
  function startCampWork(u,b){const r=nearestTree(u.side,u.x,u.y,b);if(!r||!assign(u,r,b))stopWorkerAtCurrentPosition(u);}
  const baseWorker=updateWorker;
  updateWorker=function updateLumberWorker(u,dt){
    const prior=workerSide;workerSide=u.side;
    try{
      const b=u.task==='build'&&u.buildingTarget?.type==='lumbercamp'?u.buildingTarget:null;
      if(b){
        if(b.dead||b.side!==u.side){stopWorkerAtCurrentPosition(u);return;}
        if(b.complete){startCampWork(u,b);return;}
        if(edgeDistance(u,b)>64){const p=approach(u,b);walk(u,p.x,p.y,dt);return;}
        b.construction=Math.min(1,b.construction+dt*.20);b.hp=b.maxHp*b.construction;
        if(b.construction>=1){b.complete=true;recalcPopCap(b.side);actionSignature='';startCampWork(u,b);}
        return;
      }
      if(u.task==='return'&&u.lumberCampId)u.task='lumber-deliver';
      if(u.task==='lumber-deliver'){
        let destination=u.carryType==='wood'?camps(u.side).filter(b=>b.complete).sort((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y))[0]:null;
        destination=destination||nearestTownCenter(u.side,u.x,u.y);if(!destination){stopWorkerAtCurrentPosition(u);return;}
        if(edgeDistance(u,destination)>64){const p=approach(u,destination);walk(u,p.x,p.y,dt);return;}
        if(u.carry>0&&u.carryType)economies[u.side][u.carryType]+=u.carry;
        u.carry=0;u.carryType=null;
        const r=tree(u.returnResource)&&campFor(u.returnResource,u.side)?u.returnResource:nearestTree(u.side,u.x,u.y);
        if(!assign(u,r))stopWorkerAtCurrentPosition(u);return;
      }
      if(u.task==='gather'&&u.resourceTarget?.type==='wood'){
        const r=u.resourceTarget,b=buildings.find(b=>b.id===u.lumberCampId);
        if(!b||b.dead||!b.complete||b.side!==u.side||!covered(r,b)){
          if(u.carry>0){u.task='lumber-deliver';return;}
          if(!assign(u,nearestTree(u.side,u.x,u.y)))stopWorkerAtCurrentPosition(u);return;
        }
      }
      const result=baseWorker(u,dt);
      if(u.task==='return'&&u.lumberCampId)u.task='lumber-deliver';return result;
    }finally{workerSide=prior;}
  };
  function developCamps(){
    if(root.__NRTS_SERVER__||root.__NRTS_HUMAN_BRITAIN__||gameOver)return;
    let own=camps('britain').filter(b=>!b.complete||resources.some(r=>covered(r,b)));
    if(!own.length&&canAfford('britain',BUILDINGS.lumbercamp.cost)){
      const ws=livingUnits('britain').filter(u=>u.type==='worker'&&u.task!=='build'&&!u.carry).slice(-2),p=ws.length&&findSite('britain');
      if(p){const b=constructBuilding('britain','lumbercamp',p.x,p.y,ws);if(b)own=[b];}
    }
    for(const b of own.filter(b=>!b.complete))if(!units.some(u=>!u.dead&&u.task==='build'&&u.buildingTarget===b)){
      for(const u of livingUnits('britain').filter(u=>u.type==='worker'&&u.task!=='build'&&!u.carry).slice(-2))Object.assign(u,{task:'build',buildingTarget:b,targetX:b.x,targetY:b.y});
    }
  }
  const baseAI=autoAssignAIWorkers;
  autoAssignAIWorkers=function assignCampAI(){const prior=workerSide;workerSide='britain';try{developCamps();return baseAI();}finally{workerSide=prior;}};
  const baseDevelop=aiDevelop;
  aiDevelop=function developCampAI(){const prior=workerSide;workerSide='britain';try{return baseDevelop();}finally{workerSide=prior;}};
  const api={camps,campFor,nearestTree,findSite,validSite,assign,radius:cfg.radius,
    stats:()=>({camps:camps().length,workers:units.filter(u=>!u.dead&&u.lumberCampId&&['gather','lumber-deliver'].includes(u.task)).length})};
  root.__LUMBER_V1__=Object.freeze(api);
  if(root.__NRTS_SERVER__)return;
  const baseActions=renderDynamicActions;
  renderDynamicActions=function lumberActions(...args){
    baseActions(...args);const ws=[...selectedUnits].filter(u=>!u.dead&&u.side==='france'&&u.type==='worker');
    for(const[action,label]of[['build-lumbercamp',`Houthakkerskamp<br><small>${cfg.wood} 🪵 · bij bos</small>`],['lumber-assign','Hout hakken<br><small>via eigen kamp</small>']]){
      let button=actionsEl.querySelector(`[data-action="${action}"]`);if(!ws.length){button?.remove();continue;}
      if(!button){button=makeDynamicButton(action,label);actionsEl.appendChild(button);}
      button.disabled=action==='build-lumbercamp'?!canAfford('france',BUILDINGS.lumbercamp.cost):!nearestTree('france',ws[0].x,ws[0].y);
    }
  };
  actionsEl.addEventListener('click',e=>{
    const button=e.target.closest('button');if(!button||button.disabled)return;
    if(button.dataset.action==='build-lumbercamp'){startBuild('lumbercamp');statusEl.textContent='Plaats het houthakkerskamp op vrije grond aan de bosrand.';}
    if(button.dataset.action==='lumber-assign'){const u=[...selectedUnits].find(u=>u.type==='worker'),r=u&&nearestTree('france',u.x,u.y);if(r)assignGather(r);}
  });
  canvas.addEventListener('contextmenu',e=>{
    if(buildMode||![...selectedUnits].some(u=>u.type==='worker'))return;const p=screenToWorld(e.clientX,e.clientY),b=buildingAt(p.x,p.y,'france');
    if(b?.type!=='lumbercamp')return;e.preventDefault();e.stopImmediatePropagation();const r=nearestTree('france',b.x,b.y,b);if(r)assignGather(r);
  },true);
  const baseHud=updateHud;
  updateHud=function lumberHud(...args){const result=baseHud(...args),b=selectedBuilding;
    if(b?.type==='lumbercamp'){
      const stock=resources.filter(r=>covered(r,b)).reduce((n,r)=>n+r.amount,0),n=units.filter(u=>!u.dead&&u.lumberCampId===b.id&&['gather','lumber-deliver'].includes(u.task)).length;
      setSelectionDetails(`${b.complete?'Hout in omgeving':'Bouwplaats'} · ${Math.floor(stock)} hout · ${n} houthakkers${stock?'':' · bos uitgeput'}`);
    }return result;
  };
})(window);
