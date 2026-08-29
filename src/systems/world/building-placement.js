'use strict';
// ---------- Architecture v2: building placement ----------
(function installBuildingPlacement(global) {
  const nrts = global.NRTS;
  if (!nrts) throw new Error('NRTS foundation runtime must load before building placement.');

  function footprintRadius(type) {
    const def = BUILDINGS[type];
    return Math.hypot(def.w, def.h) * 0.5;
  }

  function roadClearanceForBuilding(type, x, y) {
    const radius = footprintRadius(type);
    let nearest = Infinity;
    for (const road of ROAD_NETWORK_V066) {
      for (let i = 1; i < road.points.length; i++) {
        const hit = closestPointOnSegmentV066(x, y, road.points[i - 1], road.points[i]);
        nearest = Math.min(nearest, hit.distance - road.width * 0.5 - radius);
      }
    }
    return nearest;
  }

  function clearOfRoad(type, x, y, margin = 10) {
    return roadClearanceForBuilding(type, x, y) >= margin;
  }

  const previousValidBuildingSpot = validBuildingSpot;
  validBuildingSpot = function validBuildingSpotV2(type, x, y) {
    return previousValidBuildingSpot(type, x, y) && clearOfRoad(type, x, y, 10);
  };

  const previousFindBuildLocation = findBuildLocation;
  findBuildLocation = function findBuildLocationV2(side, type, index = 0) {
    const tc = livingBuildings(side).find(b => b.type === 'towncenter');
    if (!tc) return null;
    const preferred = previousFindBuildLocation(side, type, index);
    if (preferred && validBuildingSpot(type, preferred.x, preferred.y)) return preferred;

    const dir = sideDir(side);
    for (let ring = 0; ring < 8; ring++) {
      const radius = 150 + ring * 55;
      for (let step = 0; step < 16; step++) {
        const angle = (step / 16) * Math.PI * 2 + (dir < 0 ? Math.PI : 0);
        const x = tc.x + Math.cos(angle) * radius;
        const y = tc.y + Math.sin(angle) * radius;
        if (validBuildingSpot(type, x, y)) return { x, y };
      }
    }
    return null;
  };

  nrts.subsystems.register('building-placement', Object.freeze({
    validSpot: (...args) => validBuildingSpot(...args),
    roadClearance: roadClearanceForBuilding,
    clearOfRoad
  }), {
    phase: 'architecture-v2',
    legacyBridge: false,
    responsibility: 'building footprint placement and road exclusion'
  });
})(window);
