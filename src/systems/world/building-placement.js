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

  function nearestRoadSafePosition(type, x, y) {
    if (clearOfRoad(type, x, y, 10)) return { x, y };
    for (let ring = 1; ring <= 12; ring++) {
      const radius = ring * 24;
      for (let step = 0; step < 24; step++) {
        const angle = step / 24 * Math.PI * 2;
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        if (px < 100 || py < 100 || px > WORLD.width - 100 || py > WORLD.height - 100) continue;
        if (clearOfRoad(type, px, py, 10)) return { x:px, y:py };
      }
    }
    return null;
  }

  const previousValidBuildingSpot = validBuildingSpot;
  validBuildingSpot = function validBuildingSpotV2(type, x, y) {
    return previousValidBuildingSpot(type, x, y) && clearOfRoad(type, x, y, 10);
  };

  const previousCreateBuilding = createBuilding;
  createBuilding = function createBuildingRoadSafe(side, type, x, y, complete = true) {
    const safe = nearestRoadSafePosition(type, x, y);
    if (!safe) return null;
    return previousCreateBuilding(side, type, safe.x, safe.y, complete);
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
        const px = tc.x + Math.cos(angle) * radius;
        const py = tc.y + Math.sin(angle) * radius;
        if (validBuildingSpot(type, px, py)) return { x:px, y:py };
      }
    }
    return null;
  };

  // Initial scenario buildings are created before this Architecture v2 subsystem loads.
  // Normalize those existing footprints once so the same road-exclusion invariant applies
  // to startup state, scenario-created buildings and later player/AI construction.
  for (const b of buildings) {
    if (b.dead || clearOfRoad(b.type, b.x, b.y, 10)) continue;
    const safe = nearestRoadSafePosition(b.type, b.x, b.y);
    if (safe) { b.x = safe.x; b.y = safe.y; }
  }

  nrts.subsystems.register('building-placement', Object.freeze({
    validSpot: (...args) => validBuildingSpot(...args),
    roadClearance: roadClearanceForBuilding,
    clearOfRoad,
    nearestSafe: nearestRoadSafePosition
  }), {
    phase: 'architecture-v2',
    legacyBridge: false,
    responsibility: 'building footprint placement and road exclusion'
  });
})(window);
