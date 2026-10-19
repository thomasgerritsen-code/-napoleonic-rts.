'use strict';
// ---------- v1.3.22: lightweight renderer-neutral bridge for the 3D battlefield ----------
(function installBattlefield3DBridge(global) {
  const nrts = global.NRTS;
  if (!nrts) throw new Error('NRTS runtime must load before the 3D renderer bridge.');

  function cloneRoads() {
    const roads = global.NRTS_ROAD_NETWORK_V7 || [];
    return roads.map(road => ({
      id: road.id,
      name: road.name,
      roadClass: road.roadClass,
      width: road.width,
      points: road.points.map(point => ({ x: point.x, y: point.y }))
    }));
  }

  function normalizeArchetype(value) {
    const key = String(value || 'crossroads').toLowerCase();
    if (key.includes('parish')) return 'parish';
    if (key.includes('ribbon')) return 'ribbon';
    if (key.includes('agrar')) return 'agrarian';
    if (key.includes('wood')) return 'woodland';
    return 'crossroads';
  }

  function visualHouse(village, suffix, kind, dx, dy, w, h, angle, role) {
    return {
      id: `3d-${String(village.name || 'village').replace(/\s+/g, '-').toLowerCase()}-${suffix}`,
      kind,
      zone: 'render-only',
      clusterRole: role,
      archetype: village.archetype || 'crossroads',
      x: village.x + dx,
      y: village.y + dy,
      w,
      h,
      angle,
      renderOnly: true
    };
  }

  function archetypeScenery(village) {
    const archetype = normalizeArchetype(village.archetype);
    const baseAngle = village.houses?.[0]?.angle || 0;
    if (archetype === 'parish') {
      return [
        visualHouse(village, 'parish-cottage-a', 'house', -54, -42, 30, 22, baseAngle, 'green-edge'),
        visualHouse(village, 'parish-cottage-b', 'house', 52, -38, 32, 23, baseAngle + 0.08, 'green-edge'),
        visualHouse(village, 'parish-cottage-c', 'house', 48, 44, 29, 22, baseAngle - 0.05, 'green-edge')
      ];
    }
    if (archetype === 'ribbon') {
      return [
        visualHouse(village, 'ribbon-a', 'house', -88, -24, 36, 19, baseAngle, 'road-frontage'),
        visualHouse(village, 'ribbon-b', 'house', 0, 27, 38, 19, baseAngle, 'road-frontage'),
        visualHouse(village, 'ribbon-c', 'house', 88, -22, 34, 18, baseAngle, 'road-frontage')
      ];
    }
    if (archetype === 'agrarian') {
      return [
        visualHouse(village, 'farm-barn-a', 'barn', -68, 42, 44, 25, baseAngle + 0.08, 'farmyard'),
        visualHouse(village, 'farmhouse-a', 'farmhouse', 46, 38, 34, 25, baseAngle - 0.06, 'farmyard'),
        visualHouse(village, 'farm-barn-b', 'barn', 72, -44, 40, 23, baseAngle + 0.03, 'farmyard')
      ];
    }
    if (archetype === 'woodland') {
      return [
        visualHouse(village, 'wood-cottage-a', 'house', -44, 50, 28, 21, baseAngle + 0.15, 'woodland-edge'),
        visualHouse(village, 'wood-cottage-b', 'house', 18, 58, 28, 20, baseAngle - 0.12, 'woodland-edge'),
        visualHouse(village, 'wood-cottage-c', 'house', 58, 22, 27, 20, baseAngle + 0.04, 'woodland-edge')
      ];
    }
    return [
      visualHouse(village, 'crossroads-inn', 'inn', 48, -46, 40, 28, baseAngle, 'junction-anchor'),
      visualHouse(village, 'crossroads-house-a', 'house', -52, -45, 31, 22, baseAngle + Math.PI / 2, 'junction-arm'),
      visualHouse(village, 'crossroads-house-b', 'house', -48, 48, 31, 22, baseAngle, 'junction-arm')
    ];
  }

  function riverSafe3DHouse(house){
    if(typeof riverHitV067!=='function'||typeof RIVER_NAV_HALF_WIDTH_V067!=='number')
      return true;
    const hit=riverHitV067(house.x,house.y);
    return !hit||hit.distance>=RIVER_NAV_HALF_WIDTH_V067+
      (house.plotRadius||Math.hypot(house.w,house.h)*.5+10)+16;
  }
  function normalize3DScenery(house, canonical){
    // Extra 3D silhouettes are render-only; they must never bypass the
    // canonical village river/bridge clearance.
    if(riverSafe3DHouse(house))return house;
    for(let ring=1;ring<=20;ring++){
      const radius=ring*18;
      for(let k=0;k<24;k++){
        const angle=k*Math.PI/12, x=house.x+Math.cos(angle)*radius;
        const y=house.y+Math.sin(angle)*radius;
        const moved={...house,x,y};
        if(x<75||y<75||x>WORLD.width-75||y>WORLD.height-75 ||
          !riverSafe3DHouse(moved))continue;
        if(canonical.some(h=>Math.hypot(h.x-x,h.y-y)<
          (h.plotRadius||Math.hypot(h.w,h.h)*.5+10)+house.plotRadius+6))continue;
        return moved;
      }
    }
    return null;
  }

  function cloneVillages() {
    // Canonical V4 has the FINAL post-scale, collision- and water-safe
    // coordinates. V6 has the un-normalized source and must not be rendered.
    const source = global.VILLAGE_SCENERY_V4 || global.__VILLAGE_SCENERY_V4_DATA__ ||
      global.VILLAGE_SCENERY_V6 || (typeof VILLAGE_SCENERY_V069 === 'undefined' ? [] : VILLAGE_SCENERY_V069);
    return source.map(village => {
      const cloned = {
        name: village.name,
        x: village.x,
        y: village.y,
        archetype: village.archetype || 'crossroads',
        junctionRoadCount: village.junctionRoadCount || 0,
        houses: village.houses.map(house => ({
          id: house.id,
          kind: house.kind,
          zone: house.zone || 'residential',
          clusterRole: house.clusterRole || 'standalone',
          archetype: house.archetype || village.archetype || 'crossroads',
          x: house.x,
          y: house.y,
          w: house.w,
          h: house.h,
          angle: house.angle || 0,
          plotRadius: house.plotRadius || Math.hypot(house.w,house.h)*.5+10,
          renderOnly: false
        }))
      };
      const silhouettes=archetypeScenery({ ...village, archetype: cloned.archetype });
      for(const silhouette of silhouettes){
        silhouette.plotRadius=Math.hypot(silhouette.w,silhouette.h)*.5+10;
        const safe=normalize3DScenery(silhouette,cloned.houses);
        if(safe)cloned.houses.push(safe);
      }
      cloned.renderOnlySceneryCount = cloned.houses.filter(house => house.renderOnly).length;
      return cloned;
    });
  }

  function cloneTerrainRects(source) {
    return (source || []).map(item => ({ ...item }));
  }

  function cloneResources() {
    if (typeof resources === 'undefined') return [];
    const liveResources = [];
    for (const resource of resources) {
      if (resource.dead) continue;
      liveResources.push({
        id: resource.id,
        type: resource.type,
        x: resource.x,
        y: resource.y,
        amount: resource.amount,
        radius: resource.radius
      });
    }
    return liveResources;
  }

  function getStaticWorld() {
    return {
      world: { width: WORLD.width, height: WORLD.height },
      // Renderer receives the exact sampled simulation curve, never a
      // separate aesthetically interpolated channel.
      river: typeof RIVER_SMOOTH_POINTS_V296==='undefined' ? null : {
        points:RIVER_SMOOTH_POINTS_V296.map(p=>({x:p.x,y:p.y})),
        navigationHalfWidth:RIVER_NAV_HALF_WIDTH_V067,
        crossings:WATER_CROSSINGS_V067.map(c=>({id:c.id,x:c.x,y:c.y}))
      },
      roads: cloneRoads(),
      villages: cloneVillages(),
      woods: typeof TERRAIN_WOODS === 'undefined' ? [] : cloneTerrainRects(TERRAIN_WOODS),
      hills: typeof TERRAIN_HILLS === 'undefined' ? [] : cloneTerrainRects(TERRAIN_HILLS)
    };
  }

  function getRenderState() {
    const liveUnits = [];
    const liveBuildings = [];
    const selectionIds = [];

    if (typeof units !== 'undefined') {
      for (const unit of units) {
        if (!unit.dead) liveUnits.push(unit);
      }
    }
    if (typeof buildings !== 'undefined') {
      for (const building of buildings) {
        if (!building.dead) liveBuildings.push(building);
      }
    }
    if (typeof selectedUnits !== 'undefined') {
      for (const unit of selectedUnits) {
        if (!unit.dead) selectionIds.push(unit.id);
      }
    }

    return {
      elapsed: typeof elapsed === 'number' ? elapsed : 0,
      units: liveUnits,
      buildings: liveBuildings,
      selection: {
        unitIds: selectionIds,
        buildingId: typeof selectedBuilding !== 'undefined' && selectedBuilding ? selectedBuilding.id : null
      }
    };
  }

  const api = Object.freeze({
    version: 'battlefield-3d-bridge-v1.3.45',
    snapshotMode: 'lightweight-live-render-state',
    snapshotAllocationMode: 'single-pass-live-collections',
    villageMetadata: 'archetype-zone-cluster-role-render-only',
    villageIdentityCompanion: true,
    villageScenery: 'archetype-render-only-silhouette-v1',
    snapshot: getRenderState,
    staticWorld: getStaticWorld,
    resources: cloneResources,
    camera() {
      return { x: camera.x, y: camera.y, zoom: camera.zoom };
    },
    panCamera(dx, dy) {
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
      camera.x += dx;
      camera.y += dy;
      clampCamera();
    },
    dispatch(command) {
      return Boolean(global.RTS_SIM?.dispatch?.(command));
    },
    setStatus(text) {
      if (statusEl && typeof text === 'string') statusEl.textContent = text;
    }
  });

  global.NRTS_3D_SOURCE = api;
  global.__BATTLEFIELD_3D_BRIDGE_V1__ = api;
  nrts.subsystems.register('battlefield-3d-bridge-v1', api, {
    phase: 'rendering-v3',
    legacyBridge: false,
    responsibility: 'expose allocation-conscious lightweight live simulation state plus archetype-aware village metadata and render-only scenery to the WebGL battlefield renderer'
  });

  let attempts = 0;
  const experienceTimer = global.setInterval(() => {
    attempts++;
    if (global.__BATTLEFIELD_3D_V1__) {
      global.clearInterval(experienceTimer);
      import('./battlefield-3d-experience-v1.mjs?build=136a').catch(error => console.warn('3D experience layer failed to load', error));
      import('./battlefield-3d-village-identity-v1.mjs?build=138a').catch(error => console.warn('3D village identity layer failed to load', error));
    } else if (attempts > 120) {
      global.clearInterval(experienceTimer);
    }
  }, 50);
})(window);
