'use strict';
// ---------- v1.3.6: lightweight renderer-neutral bridge for the 3D battlefield ----------
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

  function cloneVillages() {
    const source = global.VILLAGE_SCENERY_V6 || (typeof VILLAGE_SCENERY_V069 === 'undefined' ? [] : VILLAGE_SCENERY_V069);
    return source.map(village => ({
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
        angle: house.angle || 0
      }))
    }));
  }

  function cloneTerrainRects(source) {
    return (source || []).map(item => ({ ...item }));
  }

  function cloneResources() {
    if (typeof resources === 'undefined') return [];
    return resources.filter(resource => !resource.dead).map(resource => ({
      id: resource.id,
      type: resource.type,
      x: resource.x,
      y: resource.y,
      amount: resource.amount,
      radius: resource.radius
    }));
  }

  function getStaticWorld() {
    return {
      world: { width: WORLD.width, height: WORLD.height },
      roads: cloneRoads(),
      villages: cloneVillages(),
      woods: typeof TERRAIN_WOODS === 'undefined' ? [] : cloneTerrainRects(TERRAIN_WOODS),
      hills: typeof TERRAIN_HILLS === 'undefined' ? [] : cloneTerrainRects(TERRAIN_HILLS)
    };
  }

  // The v1.3.0 bridge used RTS_SIM.snapshot() here. That routine intentionally performs
  // a complete audit and serializes every regiment plus its members, which is useful for
  // diagnostics but far too expensive for a renderer requesting state ~30 times/second.
  // The 3D renderer only needs live units/buildings/selection, so keep this path shallow.
  function getRenderState() {
    const liveUnits = typeof units === 'undefined' ? [] : units.filter(unit => !unit.dead);
    const liveBuildings = typeof buildings === 'undefined' ? [] : buildings.filter(building => !building.dead);
    const selectionIds = typeof selectedUnits === 'undefined'
      ? []
      : [...selectedUnits].filter(unit => !unit.dead).map(unit => unit.id);
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
    version: 'battlefield-3d-bridge-v1.3.6',
    snapshotMode: 'lightweight-live-render-state',
    villageMetadata: 'archetype-zone-cluster-role',
    snapshot: getRenderState,
    staticWorld: getStaticWorld,
    resources: cloneResources,
    camera() {
      return { x: camera.x, y: camera.y, zoom: camera.zoom };
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
    responsibility: 'expose lightweight live simulation state plus archetype-aware village metadata to the WebGL battlefield renderer'
  });

  // Load the non-invasive experience layer only after the renderer has published its API.
  let attempts = 0;
  const experienceTimer = global.setInterval(() => {
    attempts++;
    if (global.__BATTLEFIELD_3D_V1__) {
      global.clearInterval(experienceTimer);
      import('./battlefield-3d-experience-v1.mjs?build=136a').catch(error => console.warn('3D experience layer failed to load', error));
    } else if (attempts > 120) {
      global.clearInterval(experienceTimer);
    }
  }, 50);
})(window);