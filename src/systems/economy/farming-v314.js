'use strict';
// v314: renewable wheat fields. Wood funds a permanent field; farmers still
// have to sow, harvest and haul grain to their own town center.
(function installRenewableFarmingV314(root){
  if(root.__FARMING_V314__)return;
  const CAPACITY=240;
  const INITIAL_CROP=80;
  const REGROW_PER_SECOND=3.5;  // 210 food/min per staffed, fully-used farm.
  const HARVEST_INTERVAL=0.45;
  const HARVEST_PER_TICK=5;
  const ROADLESS_PADDING=12;

  function activeFarm(b){
    return !!b && b.type==='farm' && !b.dead && b.complete;
  }
  function ensureCrop(b){
    if(!b || b.type!=='farm')return;
    if(!Number.isFinite(b.cropCapacity))b.cropCapacity=CAPACITY;
    if(!b.cropPlanted && b.complete){
      b.cropStock=INITIAL_CROP;
      b.cropPlanted=true;
    }
  }
  const baseCreateBuilding=createBuilding;
  createBuilding=function createFarmingBuilding(side,type,x,y,complete=true){
    const b=baseCreateBuilding(side,type,x,y,complete);
    if(b?.type==='farm'){
      b.cropCapacity=CAPACITY;
      b.cropStock=complete?INITIAL_CROP:0;
      b.cropPlanted=!!complete;
    }
    return b;
  };
  const baseValidBuildingSpot=validBuildingSpot;
  validBuildingSpot=function validFarmingBuildingSpot(type,x,y){
    if(!baseValidBuildingSpot(type,x,y))return false;
    if(type!=='farm')return true;
    const b=BUILDINGS.farm;
    // Don't hide or destroy harvestable bushes/ore, and keep existing paths free.
    return !resources.some(r=>!r.dead&&r.amount>0 &&
      Math.abs(r.x-x)<b.w*.5+(r.radius||20)+ROADLESS_PADDING &&
      Math.abs(r.y-y)<b.h*.5+(r.radius||20)+ROADLESS_PADDING);
  };
  function getFarm(id){return buildings.find(b=>b.id===id&&activeFarm(b))||null;}
  function nearestFarm(side,x,y){
    let best=null,bestDistance=Infinity;
    for(const b of buildings){
      if(!activeFarm(b)||b.side!==side)continue;
      const dist=Math.hypot(b.x-x,b.y-y);
      if(dist<bestDistance){bestDistance=dist;best=b;}
    }
    return best;
  }
  function assignWorker(worker,field){
    if(!worker||worker.dead||worker.type!=='worker'||
       !activeFarm(field)||worker.side!==field.side)return false;
    worker.farmId=field.id;
    worker.resourceTarget=null;
    worker.returnResource=null;
    worker.buildingTarget=null;
    worker.resourceExhaustedStop=false;
    worker.preferredResourceType='food';
    worker.gatherClock=0;
    // Preserve resources already carried on reassignment; deliver them first.
    worker.task=worker.carry>0?'farm-deliver':'farm';
    return true;
  }
  function assignSelectedWorkers(field){
    const workers=[...selectedUnits].filter(u=>!u.dead&&u.type==='worker'&&u.side==='france');
    let assigned=0;
    for(const u of workers)if(assignWorker(u,field))assigned++;
    if(assigned){
      statusEl.textContent=`${assigned} boer${assigned===1?'':'en'} werkt op de graanakker.`;
      updateHud(true);
    }
    return assigned;
  }
  function workPosition(u,b){
    // Stay OUTSIDE the building footprint, preferably on the town-center side.
    const tc=nearestTownCenter(u.side,b.x,b.y);
    const dx=tc?tc.x-b.x:-1,dy=tc?tc.y-b.y:0;
    if(Math.abs(dx)>=Math.abs(dy)){
      return{x:b.x+(dx>=0?1:-1)*(b.w/2+22),
        y:b.y+((u.id%5)-2)*17};
    }
    return{x:b.x+((u.id%5)-2)*18,
      y:b.y+(dy>=0?1:-1)*(b.h/2+22)};
  }
  function deliver(u,dt){
    const tc=nearestTownCenter(u.side,u.x,u.y);
    if(!tc){u.task=null;u.farmId=null;return;}
    if(Math.hypot(tc.x-u.x,tc.y-u.y)>62){
      moveToward(u,tc.x,tc.y,dt);return;
    }
    if(u.carry>0 && u.carryType){
      economies[u.side][u.carryType]+=u.carry;
    }
    u.carry=0;u.carryType=null;
    const field=getFarm(u.farmId);
    if(field&&field.side===u.side){
      u.task='farm';
    }else{
      u.task=null;u.farmId=null;
    }
  }
  function harvest(u,dt){
    const field=getFarm(u.farmId);
    if(!field||field.side!==u.side){
      if(u.carry>0){u.task='farm-deliver';deliver(u,dt);}
      else {u.task=null;u.farmId=null;}
      return;
    }
    ensureCrop(field);
    if(u.carry>=25){u.task='farm-deliver';deliver(u,dt);return;}
    const pos=workPosition(u,field);
    if(Math.hypot(pos.x-u.x,pos.y-u.y)>18){
      moveToward(u,pos.x,pos.y,dt);
      return;
    }
    u.gatherClock=(u.gatherClock||0)+dt;
    if(u.gatherClock<HARVEST_INTERVAL)return;
    u.gatherClock=0;
    const take=Math.min(HARVEST_PER_TICK,Math.floor(field.cropStock),25-u.carry);
    if(take<=0)return; // Rain/growth cycle: remain working, never kill the field.
    field.cropStock-=take;
    u.carry+=take;
    u.carryType='food';
    if(u.carry>=25)u.task='farm-deliver';
  }
  const baseUpdateWorker=updateWorker;
  updateWorker=function updateFarmingWorker(u,dt){
    if(u.task==='farm'){harvest(u,dt);return;}
    if(u.task==='farm-deliver'){deliver(u,dt);return;}
    // A builder automatically begins working their newly completed field.
    const wasBuilding=u.task==='build'&&u.buildingTarget?.type==='farm';
    const field=wasBuilding?u.buildingTarget:null;
    baseUpdateWorker(u,dt);
    if(field&&field.complete&&!field.dead&&u.side===field.side){
      assignWorker(u,field);
    }
  };
  const baseUpdateBuildings=updateBuildings;
  updateBuildings=function updateRenewableCrops(dt){
    baseUpdateBuildings(dt);
    for(const b of buildings){
      if(!activeFarm(b))continue;
      ensureCrop(b);
      b.cropStock=Math.min(b.cropCapacity,b.cropStock+REGROW_PER_SECOND*dt);
    }
  };
  // The countryside farming economy is available to both sides. Britain builds
  // fields when food reserves run low instead of consuming its finite berry stock.
  const baseAiDevelop=aiDevelop;
  aiDevelop=function aiDevelopWithFarms(){
    if(!gameOver&&elapsed>=65){
      const own=livingBuildings('britain').filter(b=>b.type==='farm');
      const workerCount=livingUnits('britain').filter(u=>u.type==='worker').length;
      if(own.length<3&&!own.some(b=>!b.complete) && workerCount>=3 &&
         economies.britain.food<720 && economies.britain.wood>=BUILDINGS.farm.cost.wood+80){
        if(aiBuild('farm'))return;
      }
    }
    return baseAiDevelop();
  };
  function fieldAt(x,y){
    return buildings.find(b=>activeFarm(b)&&
      Math.abs(x-b.x)<=b.w/2+8 && Math.abs(y-b.y)<=b.h/2+8)||null;
  }
  // Capture before ordinary contextmenu -> issueMove handler. Unhandled clicks
  // are left unchanged, including army orders and resource gathering.
  canvas.addEventListener('contextmenu',e=>{
    if(buildMode)return;
    const p=screenToWorld(e.clientX,e.clientY);
    const b=fieldAt(p.x,p.y);
    if(!b||b.side!=='france')return;
    if(![...selectedUnits].some(u=>u.type==='worker'&&!u.dead))return;
    e.preventDefault();e.stopImmediatePropagation();
    assignSelectedWorkers(b);
  },true);
  // Only workers get the contextual "work nearest field" action on mobile.
  const baseRenderDynamicActions=renderDynamicActions;
  renderDynamicActions=function renderFarmingActions(force=false){
    baseRenderDynamicActions(force);
    const workers=[...selectedUnits].filter(u=>!u.dead&&u.side==='france'&&u.type==='worker');
    const current=actionsEl.querySelector('[data-action="farm-assign"]');
    if(!workers.length){current?.remove();return;}
    if(!current){
      const btn=makeDynamicButton('farm-assign','Werk op akker<br><small>boeren inzetten</small>');
      actionsEl.prepend(btn);
    }
    const action=actionsEl.querySelector('[data-action="farm-assign"]');
    if(action)action.disabled=!workers.some(u=>nearestFarm('france',u.x,u.y));
  };
  actionsEl.addEventListener('click',e=>{
    const btn=e.target.closest('button[data-action]');
    if(!btn||btn.disabled)return;
    if(btn.dataset.action==='build-farm'){
      startBuild('farm');
      if(buildMode==='farm')statusEl.textContent='Plaats een graanakker op vrije, droge grond (180 hout).';
    }else if(btn.dataset.action==='farm-assign'){
      const u=[...selectedUnits].find(u=>!u.dead&&u.type==='worker'&&u.side==='france');
      const field=u&&nearestFarm('france',u.x,u.y);
      if(field)assignSelectedWorkers(field);
      else statusEl.textContent='Bouw eerst een graanakker en laat die voltooien.';
    }
  });
  const baseUpdateHud=updateHud;
  updateHud=function updateFarmHud(...args){
    baseUpdateHud(...args);
    if(selectedBuilding?.type==='farm'&&selectedBuilding.complete){
      const b=selectedBuilding;
      const farmers=units.filter(u=>!u.dead&&u.farmId===b.id&&
        (u.task==='farm'||u.task==='farm-deliver')).length;
      setSelectionDetails(`Graan ${Math.floor(b.cropStock||0)}/${b.cropCapacity||CAPACITY} · ${farmers} boeren · oogst groeit steeds opnieuw aan`);
    }
  };
  const api=Object.freeze({
    version:'314.0',twoDOnly:true,renewable:true,
    capacity:CAPACITY,initialCrop:INITIAL_CROP,growthPerSecond:REGROW_PER_SECOND,
    assignWorker,assignSelectedWorkers,getFarm,nearestFarm,fieldAt,
    stats:()=>({
      farms:buildings.filter(b=>b.type==='farm'&&!b.dead).length,
      completed:buildings.filter(activeFarm).length,
      french:buildings.filter(b=>activeFarm(b)&&b.side==='france').length,
      british:buildings.filter(b=>activeFarm(b)&&b.side==='britain').length,
      working:units.filter(u=>!u.dead&&['farm','farm-deliver'].includes(u.task)).length,
      stock:buildings.filter(activeFarm).reduce((total,b)=>total+(b.cropStock||0),0)
    })
  });
  root.__FARMING_V314__=api;
  root.NRTS?.subsystems?.register?.('renewable-farming-v314',api,{
    phase:'economy',legacyBridge:false,
    responsibility:'wood-funded 2D grain fields with farmer harvesting, crop regrowth, town-center delivery and AI adoption'
  });
})(window);
