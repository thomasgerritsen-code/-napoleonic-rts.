'use strict';
// ---------- Architecture v2: navigation subsystem API ----------
(function registerNavigationArchitectureV2(global) {
  const nrts=global.NRTS;
  if (!nrts) throw new Error('NRTS foundation runtime must load before navigation.');
  if (nrts.subsystems.has('navigation')) return;

  nrts.subsystems.register('navigation',Object.freeze({
    roadAt:(x,y)=>roadNetworkAtV066(x,y),
    nearestRoadPoint:(point,kind='infantry')=>nearestStrategicRoadPointV066(point,kind),
    roadSpeed:(kind,roadOrClass)=>roadSpeedV066(kind,roadOrClass),
    crossingAt:(x,y)=>crossingAtV067(x,y),
    waterAt:(x,y)=>waterAtV067(x,y),
    orderBattalionPath:(reg,x,y,formation=reg?.formation,finalFacing=null)=>orderGroupPathV06(reg,x,y,formation,finalFacing),
    bridgeCorridor:(crossingId,side=-1)=>global.NRTS_NAVIGATION_V2?.bridgeCorridor(crossingId,side) || null,
    bridgeState:(regimentId)=>global.NRTS_NAVIGATION_V2?.bridgeState(regimentId) || null,
    stats:()=>({
      roadIndex:global.NRTS_ROAD_INDEX_V2,
      roadGraph:global.NRTS_ROAD_GRAPH_V2,
      bridge:global.NRTS_NAVIGATION_V2?.stats?.() || null
    })
  }),{
    phase:'architecture-v2',
    owner:'navigation',
    legacyBridge:false,
    responsibility:'road lookup, route planning, legal water crossings, bridge corridors and crossing traffic guidance'
  });

  nrts.events.emit('navigation:ready',{version:'architecture-v2',bridgeCorridors:true});
})(window);
