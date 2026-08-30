'use strict';
// ---------- Village authority v6: hierarchical collision-safe settlement rendering ----------
(function installVillageAuthorityV6(global){
  const nrts=global.NRTS;
  if(!nrts) throw new Error('NRTS foundation runtime must load before Village V6 authority.');
  const villages=global.VILLAGE_SCENERY_V4||global.__VILLAGE_SCENERY_V4_DATA__;
  if(!villages) throw new Error('Village collision normalization must load before Village V6 authority.');
  if(typeof drawHouseV069!=='function') throw new Error('Village renderer must load before Village V6 authority.');

  function drawCanonicalVillagesV6(){
    ctx.save();
    for(const village of villages){
      if(typeof drawJunctionApronV069==='function') drawJunctionApronV069(village);
      if(typeof global.drawVillageLandscapeV6==='function') global.drawVillageLandscapeV6(village);
      else if(typeof global.drawVillageCommonsV5==='function') global.drawVillageCommonsV5(village);
    }
    for(const village of villages){
      village.houses.forEach((house,index)=>drawHouseV069(house,index,village));
    }
    ctx.restore();ctx.textAlign='start';
  }

  drawCanonicalVillagesV6.__nrtsVillageAuthority='village-authority-v6';
  drawHamletsV066=drawCanonicalVillagesV6;

  const api=Object.freeze({
    version:'village-authority-v6',
    sourceLayout:global.__VILLAGE_COLLISION_V4__?.sourceVersion||null,
    collisionLayer:'village-collision-v4',
    sourceRenderer:'village-renderer-v2',
    yardBlend:global.__VILLAGE_YARD_BLEND_V5__?.version||null,
    landscape:global.__VILLAGE_LANDSCAPE_V6__?.version||null,
    hierarchical:Boolean(global.__VILLAGE_LAYOUT_V6__),
    collisionSafe:true,
    naturalVillageFabric:Boolean(global.__VILLAGE_LANDSCAPE_V6__),
    visibleFacades:false
  });

  global.__VILLAGE_AUTHORITY_V6__=api;
  nrts.subsystems.register('village-authority-v6',api,{
    phase:'architecture-v2',legacyBridge:false,
    responsibility:'authoritative hierarchical Village V6 rendering after legacy v0.7.0 overrides'
  });
})(window);
