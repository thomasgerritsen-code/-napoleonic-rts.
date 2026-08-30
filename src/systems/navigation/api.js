'use strict';
// ---------- Architecture v2.1: navigation subsystem API ----------
(function registerNavigationArchitectureV21(global) {
  const nrts=global.NRTS;
  if (!nrts) throw new Error('NRTS foundation runtime must load before navigation.');
  if (nrts.subsystems.has('navigation')) return;

  const api=Object.freeze({
    roadAt:(x,y)=>roadNetworkAtV066(x,y),
    nearestRoadPoint:(point,kind='infantry')=>nearestStrategicRoadPointV066(point,kind),
    roadSpeed:(kind,roadOrClass)=>roadSpeedV066(kind,roadOrClass),
    crossingAt:(x,y)=>crossingAtV067(x,y),
    waterAt:(x,y)=>waterAtV067(x,y),
    orderBattalionPath:(reg,x,y,formation=reg?.formation,finalFacing=null)=>orderGroupPathV06(reg,x,y,formation,finalFacing),
    bridgeCorridor:(crossingId,side=-1)=>global.NRTS_NAVIGATION_V2?.bridgeCorridor(crossingId,side) || null,
    bridgeState:(regimentId)=>global.NRTS_NAVIGATION_V2?.bridgeState(regimentId) || null,
    villageAvoidance:()=>global.__VILLAGE_NAVIGATION_V7__ || null,
    nearestOpenPoint:(point,kind='infantry')=>global.__VILLAGE_NAVIGATION_V7__?.nearestOpenPoint(point,kind) || point,
    isVillagePathClear:(start,path,kind='infantry')=>global.__VILLAGE_NAVIGATION_V7__?.pathClear(start,path,kind) ?? true,
    stats:()=>({
      roadIndex:global.NRTS_ROAD_INDEX_V2,
      roadGraph:global.NRTS_ROAD_GRAPH_V2,
      bridge:global.NRTS_NAVIGATION_V2?.stats?.() || null,
      village:global.__VILLAGE_NAVIGATION_V7__ ? {
        version:global.__VILLAGE_NAVIGATION_V7__.version,
        obstacleCount:global.__VILLAGE_NAVIGATION_V7__.obstacleCount
      } : null
    })
  });

  nrts.subsystems.register('navigation',api,{
    phase:'architecture-v2.1',
    owner:'src/systems/navigation/api.js',
    legacyBridge:false,
    responsibility:'road lookup, route planning, legal water crossings, bridge corridors and village obstacle guidance'
  });
  nrts.services?.provide('navigation','src/systems/navigation/api.js',api,{
    generation:global.NRTS_CONFIG?.architecture?.serviceGeneration ?? 21,
    legacyBridge:false
  });

  nrts.events.emit('navigation:ready',{version:'architecture-v2.1',bridgeCorridors:true,stableService:true});
})(window);
