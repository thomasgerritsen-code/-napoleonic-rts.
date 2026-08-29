'use strict';
(function installFogScoutingV1(global){
  const nrts=global.NRTS;if(!nrts)throw new Error('NRTS required');
  const sightings=new Map();
  const baseVision=visionRadius;
  visionRadius=function(e){if(e?.type==='cavalry')return 430;if(e?.type==='officer')return 285;return baseVision(e);};
  function sources(side){return [...livingUnits(side),...livingBuildings(side).filter(b=>b.complete)];}
  function canSee(side,e){if(!e||e.side===side)return true;for(const s of sources(side)){if(Math.hypot(e.x-s.x,e.y-s.y)<=visionRadius(s))return true;}return false;}
  const oldVisible=isVisibleToFrance;
  isVisibleToFrance=function(e){const visible=oldVisible(e);if(visible&&e?.side==='britain')sightings.set(e.id,{id:e.id,x:e.x,y:e.y,type:e.type||e.kind,seenAt:elapsed});return visible;};
  function scoutReport(){for(const e of [...livingUnits('britain'),...livingBuildings('britain')])if(canSee('france',e))sightings.set(e.id,{id:e.id,x:e.x,y:e.y,type:e.type||e.kind,seenAt:elapsed});return [...sightings.values()].map(v=>({...v,age:elapsed-v.seenAt}));}
  const api=Object.freeze({canSee,report:scoutReport,cavalryVision:430,lastSeen:id=>sightings.get(id)||null});
  nrts.subsystems.register('fog-scouting',api,{phase:'architecture-v2',legacyBridge:false,responsibility:'side-aware visibility, cavalry scouting and last-known enemy intelligence'});
  global.__FOG_SCOUTING_V1__=api;
})(window);
