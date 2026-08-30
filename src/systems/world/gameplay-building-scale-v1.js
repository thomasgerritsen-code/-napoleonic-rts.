'use strict';
// ---------- Architecture v2.1: gameplay building scale authority ----------
(function installGameplayBuildingScaleV1(global){
  const nrts=global.NRTS;
  if(!nrts) throw new Error('NRTS foundation runtime must load before gameplay building scale.');
  const scale=global.NRTS_CONFIG?.world?.gameplayBuildings?.scale ?? 1.34;
  const marker='__nrtsBaseFootprintV1';

  for(const [type,def] of Object.entries(BUILDINGS)){
    if(!def||!Number.isFinite(def.w)||!Number.isFinite(def.h))continue;
    if(!def[marker]){
      Object.defineProperty(def,marker,{value:Object.freeze({w:def.w,h:def.h}),enumerable:false,configurable:false});
    }
    const base=def[marker];
    def.w=base.w*scale;
    def.h=base.h*scale;
  }

  let scaledExisting=0;
  for(const b of buildings){
    if(!b||b.dead||b.gameplayScaleV1===scale)continue;
    const def=BUILDINGS[b.type];
    if(!def)continue;
    b.w=def.w;b.h=def.h;b.gameplayScaleV1=scale;scaledExisting++;
  }

  const previousCreateBuilding=createBuilding;
  createBuilding=function createBuildingScaledV1(side,type,x,y,complete=true){
    const b=previousCreateBuilding(side,type,x,y,complete);
    if(b){
      const def=BUILDINGS[type];
      if(def){b.w=def.w;b.h=def.h;}
      b.gameplayScaleV1=scale;
    }
    return b;
  };

  const api=Object.freeze({
    version:'gameplay-building-scale-v1',
    scale,
    scaledExisting,
    types:Object.freeze(Object.fromEntries(Object.entries(BUILDINGS).map(([type,def])=>[type,Object.freeze({w:def.w,h:def.h})])))
  });
  global.__GAMEPLAY_BUILDING_SCALE_V1__=api;
  nrts.subsystems.register('gameplay-building-scale',api,{
    phase:'architecture-v2.1',legacyBridge:false,
    responsibility:'single authoritative gameplay-building footprint scale used by rendering, placement and collision'
  });
})(window);
