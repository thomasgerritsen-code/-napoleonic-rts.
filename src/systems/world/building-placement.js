'use strict';
// ---------- Architecture v2: building placement ----------
(function installBuildingPlacement(global) {
  const nrts = global.NRTS;
  if (!nrts) throw new Error('NRTS foundation runtime must load before building placement.');
  const activeRoadNetwork = global.NRTS_ROAD_NETWORK_V7 || ROAD_NETWORK_V066;

  function footprintRadius(type) {
    const def = BUILDINGS[type];
    return Math.hypot(def.w, def.h) * 0.5;
  }

  function villageStructures() {
    const villages = global.VILLAGE_SCENERY_V4 || global.__VILLAGE_SCENERY_V4_DATA__ || [];
    const result = [];
    for (const village of villages) {
      for (const house of village.houses || []) result.push(house);
    }
    return result;
  }

  function villageStructureRadius(house) {
    if (Number.isFinite(house?.plotRadius)) return house.plotRadius;
    return Math.hypot(house?.w || 0, house?.h || 0) * .75 + 8;
  }

  function roadClearanceForBuilding(type, x, y) {
    const radius = footprintRadius(type);
    let nearest = Infinity;
    for (const road of activeRoadNetwork) {
      for (let i = 1; i < road.points.length; i++) {
        const hit = closestPointOnSegmentV066(x, y, road.points[i - 1], road.points[i]);
        nearest = Math.min(nearest, hit.distance - road.width * 0.5 - radius);
      }
    }
    return nearest;
  }

  function villageClearanceForBuilding(type, x, y) {
    const radius = footprintRadius(type);
    let nearest = Infinity;
    for (const house of villageStructures()) {
      const clearance = Math.hypot(x-house.x,y-house.y) - radius - villageStructureRadius(house);
      nearest = Math.min(nearest,clearance);
    }
    return nearest;
  }

  function clearOfRoad(type, x, y, margin = 10) {
    return roadClearanceForBuilding(type, x, y) >= margin;
  }

  function clearOfVillage(type, x, y, margin = 14) {
    return villageClearanceForBuilding(type, x, y) >= margin;
  }

  function clearPlacement(type,x,y) {
    return clearOfRoad(type,x,y,10) && clearOfVillage(type,x,y,14);
  }

  function nearestPlacementSafePosition(type, x, y) {
    if (clearPlacement(type,x,y)) return { x, y };
    for (let ring = 1; ring <= 18; ring++) {
      const radius = ring * 24;
      for (let step = 0; step < 32; step++) {
        const angle = step / 32 * Math.PI * 2;
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        if (px < 100 || py < 100 || px > WORLD.width - 100 || py > WORLD.height - 100) continue;
        if (clearPlacement(type,px,py)) return { x:px, y:py };
      }
    }
    return null;
  }

  const previousValidBuildingSpot = validBuildingSpot;
  validBuildingSpot = function validBuildingSpotV2(type, x, y) {
    return previousValidBuildingSpot(type, x, y) && clearPlacement(type,x,y);
  };

  const previousCreateBuilding = createBuilding;
  createBuilding = function createBuildingPlacementSafe(side, type, x, y, complete = true) {
    const safe = nearestPlacementSafePosition(type, x, y);
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
    for (let ring = 0; ring < 10; ring++) {
      const radius = 150 + ring * 55;
      for (let step = 0; step < 24; step++) {
        const angle = (step / 24) * Math.PI * 2 + (dir < 0 ? Math.PI : 0);
        const px = tc.x + Math.cos(angle) * radius;
        const py = tc.y + Math.sin(angle) * radius;
        if (validBuildingSpot(type, px, py)) return { x:px, y:py };
      }
    }
    return null;
  };

  // Initial scenario buildings are created before this subsystem loads. Normalize them once
  // so startup buildings obey the same road + village exclusion invariant as later construction.
  for (const b of buildings) {
    if (b.dead || clearPlacement(b.type,b.x,b.y)) continue;
    const safe = nearestPlacementSafePosition(b.type,b.x,b.y);
    if (safe) { b.x = safe.x; b.y = safe.y; }
  }

  nrts.subsystems.register('building-placement', Object.freeze({
    validSpot: (...args) => validBuildingSpot(...args),
    roadClearance: roadClearanceForBuilding,
    villageClearance: villageClearanceForBuilding,
    clearOfRoad,
    clearOfVillage,
    nearestSafe: nearestPlacementSafePosition,
    villageObstacleCount: villageStructures().length,
    roadCount: activeRoadNetwork.length,
    battlefieldV7: Boolean(global.NRTS_ROAD_NETWORK_V7)
  }), {
    phase: 'architecture-v2',
    legacyBridge: false,
    responsibility: 'building footprint placement with active-road and village scenery exclusion'
  });
})(window);
