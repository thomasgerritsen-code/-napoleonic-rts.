'use strict';
// ---------- Architecture v2.1: stable world service ----------
(function installWorldServiceV21(global) {
  const nrts=global.NRTS;
  if (!nrts?.services) throw new Error('NRTS v2.1 service registry must load before the world service.');
  const generation=global.NRTS_CONFIG?.architecture?.serviceGeneration ?? 21;

  function roads(){
    return global.NRTS_ROAD_NETWORK_V7 || (typeof ROAD_NETWORK_V066!=='undefined' ? ROAD_NETWORK_V066 : []);
  }

  function hamlets(){
    return global.NRTS_ROAD_HAMLETS_V7 || (typeof ROAD_HAMLETS_V066!=='undefined' ? ROAD_HAMLETS_V066 : []);
  }

  function villages(){
    return global.VILLAGE_SCENERY_V4 || global.__VILLAGE_SCENERY_V4_DATA__ || global.VILLAGE_SCENERY_V6 || [];
  }

  function structures(){
    return villages().flatMap(village=>village.houses || []);
  }

  const api=Object.freeze({
    version:'world-service-v2.1',
    size:()=>Object.freeze({width:WORLD.width,height:WORLD.height}),
    roads,
    hamlets,
    villages,
    structures,
    roadAt:(x,y)=>typeof roadNetworkAtV066==='function' ? roadNetworkAtV066(x,y) : null,
    villageCollision:()=>global.__VILLAGE_COLLISION_V4__ || null,
    villageScale:()=>global.__VILLAGE_SCALE_V7__ || null,
    battlefield:()=>global.__BATTLEFIELD_EXPANSION_V7__ || null,
    snapshot:()=>Object.freeze({
      width:WORLD.width,
      height:WORLD.height,
      roadCount:roads().length,
      hamletCount:hamlets().length,
      villageCount:villages().length,
      structureCount:structures().length,
      structureScale:global.NRTS_CONFIG?.world?.village?.structureScale ?? null
    })
  });

  nrts.services.provide('world','src/systems/world/api.js',api,{generation,legacyBridge:false});
  nrts.subsystems.register('world',api,{
    phase:'architecture-v2.1',
    owner:'src/systems/world/api.js',
    legacyBridge:false,
    responsibility:'stable access to battlefield dimensions, roads, settlements and collision data'
  });
  nrts.events.emit('world:ready',api.snapshot());
})(window);
