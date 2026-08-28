'use strict';
// ---------- v0.6.6 road network debug hooks ----------
if (window.__RTS_DEBUG__?.formationState) {
  const formationStateV065ForV066 = window.__RTS_DEBUG__.formationState;
  window.__RTS_DEBUG__.formationState = function formationStateV066(id) {
    const base = formationStateV065ForV066(id);
    if (!base) return null;
    const reg = getRegiment(id) || regiments.find(r => r.id === id);
    const march = reg?.marchV063;
    const anchor = march ? { x:march.anchorX, y:march.anchorY } : base.centroid;
    const roadHit = roadNetworkAtV066(anchor.x, anchor.y);
    return {
      ...base,
      anchorRoad: roadHit?.road?.name || null,
      anchorRoadClass: roadHit?.road?.roadClass || null,
      routeRoads: (reg?.routeRoadsV066 || []).map(r => ({...r})),
      roadSpeedHere: roadHit ? roadSpeedV066(groupKindV06(reg), roadHit.road) : null
    };
  };

  window.__RTS_DEBUG__.roadNetworkV066 = function roadNetworkDebugV066() {
    return {
      roads: ROAD_NETWORK_V066.map(r => ({ id:r.id, name:r.name, roadClass:r.roadClass, width:r.width, points:r.points.map(p=>({x:p.x,y:p.y})) })),
      hamlets: ROAD_HAMLETS_V066.map(h => ({...h})),
      classes: {
        chaussee: {...ROAD_CLASS_SPEEDS_V066.chaussee},
        secondary: {...ROAD_CLASS_SPEEDS_V066.secondary},
        track: {...ROAD_CLASS_SPEEDS_V066.track}
      }
    };
  };

  window.__RTS_DEBUG__.roadInfoV066 = function roadInfoDebugV066(x,y) {
    const hit = roadNetworkAtV066(x,y);
    if (!hit) return null;
    return { id:hit.road.id, name:hit.road.name, roadClass:hit.road.roadClass, distance:hit.distance, segmentIndex:hit.segmentIndex };
  };

  window.__RTS_DEBUG__.roadSpeedV066 = function roadSpeedDebugV066(kind='infantry', roadClass='chaussee') {
    return roadSpeedV066(kind, roadClass);
  };
}
