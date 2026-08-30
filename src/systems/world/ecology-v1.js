'use strict';
// ---------- Architecture v2.1: collision-safe battlefield ecology ----------
(function installBattlefieldEcologyV1(global){
  const nrts=global.NRTS;
  if(!nrts) throw new Error('NRTS foundation runtime must load before battlefield ecology.');

  const cfg=global.NRTS_CONFIG?.world?.vegetation || {};
  const villageCfg=global.NRTS_CONFIG?.world?.village || {};
  const buildingPadding=cfg.buildingPadding ?? 18;
  const villageHousePadding=cfg.villageHousePadding ?? 12;
  const resourceGap=cfg.resourceGap ?? 8;
  const relocationStep=cfg.relocationStep ?? 22;
  const relocationRings=cfg.relocationRings ?? 18;
  const berryVillagePadding=villageCfg.berryExclusionPadding ?? 70;

  function villageData(){
    return global.VILLAGE_SCENERY_V4 || global.__VILLAGE_SCENERY_V4_DATA__ || [];
  }
  function houseRadius(h){
    return Number.isFinite(h?.plotRadius) ? h.plotRadius : Math.hypot(h?.w||0,h?.h||0)*.72+10;
  }
  function resourceRadius(type){
    return type==='wood' ? 22 : (cfg.berryRadius ?? 19);
  }
  function buildingConflict(type,x,y,padding=buildingPadding){
    const rr=resourceRadius(type);
    return buildings.some(b=>{
      if(!b||b.dead)return false;
      const hw=b.w*.5+rr+padding,hh=b.h*.5+rr+padding;
      return Math.abs(x-b.x)<hw && Math.abs(y-b.y)<hh;
    });
  }
  function villageHouseConflict(type,x,y){
    const rr=resourceRadius(type);
    for(const village of villageData()){
      for(const h of village.houses||[]){
        if(Math.hypot(x-h.x,y-h.y)<rr+houseRadius(h)+villageHousePadding)return true;
      }
    }
    return false;
  }
  function villageEnvelope(village){
    const houses=village.houses||[];
    if(!houses.length)return {x:village.x||0,y:village.y||0,radius:berryVillagePadding};
    const cx=Number.isFinite(village.x)?village.x:houses.reduce((s,h)=>s+h.x,0)/houses.length;
    const cy=Number.isFinite(village.y)?village.y:houses.reduce((s,h)=>s+h.y,0)/houses.length;
    let radius=0;
    for(const h of houses)radius=Math.max(radius,Math.hypot(h.x-cx,h.y-cy)+houseRadius(h));
    return {x:cx,y:cy,radius:radius+berryVillagePadding};
  }
  function insideVillage(x,y){
    return villageData().some(v=>{
      const e=villageEnvelope(v);
      return Math.hypot(x-e.x,y-e.y)<=e.radius;
    });
  }
  function resourceConflict(type,x,y,ignore=null){
    const rr=resourceRadius(type);
    for(const r of resources){
      if(!r||r.dead||r===ignore)continue;
      const other=resourceRadius(r.type);
      if(Math.hypot(x-r.x,y-r.y)<rr+other+resourceGap)return true;
    }
    return false;
  }
  function validResourceSpot(type,x,y,ignore=null){
    const rr=resourceRadius(type);
    if(x<rr+16||y<rr+16||x>WORLD.width-rr-16||y>WORLD.height-rr-16)return false;
    if(buildingConflict(type,x,y)||villageHouseConflict(type,x,y))return false;
    if(type==='food'&&insideVillage(x,y))return false;
    return !resourceConflict(type,x,y,ignore);
  }
  function deterministicPhase(type,x,y){
    let seed=((Math.round(x)*73856093)^(Math.round(y)*19349663)^(type==='wood'?83492791:2654435761))>>>0;
    seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
    return ((seed>>>0)/4294967296)*Math.PI*2;
  }
  function nearestEcologySpot(type,x,y,ignore=null){
    if(validResourceSpot(type,x,y,ignore))return{x,y};
    const phase=deterministicPhase(type,x,y);
    for(let ring=1;ring<=relocationRings;ring++){
      const radius=ring*relocationStep,steps=12+ring*2;
      for(let step=0;step<steps;step++){
        const a=phase+step/steps*Math.PI*2;
        const px=x+Math.cos(a)*radius,py=y+Math.sin(a)*radius;
        if(validResourceSpot(type,px,py,ignore))return{x:px,y:py};
      }
    }
    return null;
  }

  const previousCreateResource=createResource;
  createResource=function createResourceEcologyV1(type,x,y,amount){
    const safe=nearestEcologySpot(type,x,y,null);
    if(!safe)return null;
    const r=previousCreateResource(type,safe.x,safe.y,amount);
    if(r){
      r.radius=resourceRadius(type);
      r.visualKind=type==='food'?'berry-bush':'deciduous-tree';
      r.ecologyV1=true;
    }
    return r;
  };

  // Initial resources are generated before Architecture-v2 world systems load. Normalize
  // them once and keep the same gameplay resource objects/amounts.
  let relocated=0,removed=0;
  for(const r of [...resources]){
    if(!r||r.dead)continue;
    const safe=nearestEcologySpot(r.type,r.x,r.y,r);
    if(!safe){r.dead=true;removed++;continue;}
    if(Math.hypot(safe.x-r.x,safe.y-r.y)>.5)relocated++;
    r.x=safe.x;r.y=safe.y;
    r.radius=resourceRadius(r.type);
    r.visualKind=r.type==='food'?'berry-bush':'deciduous-tree';
    r.ecologyV1=true;
  }

  const api=Object.freeze({
    version:'battlefield-ecology-v1',
    validSpot:validResourceSpot,
    nearestSafe:nearestEcologySpot,
    insideVillage,
    buildingConflict,
    villageHouseConflict,
    relocatedInitial:relocated,
    removedInitial:removed,
    berryVillageExclusion:true,
    resourceBuildingExclusion:true
  });
  global.__BATTLEFIELD_ECOLOGY_V1__=api;
  nrts.subsystems.register('battlefield-ecology',api,{
    phase:'architecture-v2.1',legacyBridge:false,
    responsibility:'collision-safe tree and berry placement with village exclusion for food resources'
  });
})(window);
