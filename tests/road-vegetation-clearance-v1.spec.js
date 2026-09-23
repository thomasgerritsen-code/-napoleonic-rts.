const { test, expect } = require('@playwright/test');

test('trees, food plants and 3D crop scenery stay clear of road corridors', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?test=3d');
  await page.waitForFunction(() => Boolean(
    window.NRTS_3D_SOURCE &&
    window.__BATTLEFIELD_ECOLOGY_V1__?.resourceRoadExclusion &&
    window.__BATTLEFIELD_3D_LANDSCAPE_V1__?.roadClearance &&
    window.__NRTS_THREE_SCENE__
  ), null, { timeout: 20000 });

  const result = await page.evaluate(() => {
    const ecology = window.__BATTLEFIELD_ECOLOGY_V1__;
    const source = window.NRTS_3D_SOURCE;
    const scene = window.__NRTS_THREE_SCENE__;

    const resourceConflicts = source.resources()
      .filter(resource => !resource.dead)
      .filter(resource => ecology.roadConflict(resource.type, resource.x, resource.y))
      .map(resource => ({ id: resource.id, type: resource.type, x: resource.x, y: resource.y }));

    const taggedConflicts = [];
    scene.traverse(object => {
      const radius = object.userData?.vegetationClearanceRadius;
      if (!Number.isFinite(radius) || object.isInstancedMesh) return;
      const position = object.position;
      if (ecology.roadConflictAt(position.x, position.z, radius, 0)) {
        taggedConflicts.push({ name: object.name || object.type, kind: object.userData.vegetationKind, x: position.x, z: position.z, radius });
      }
    });

    const terrain = scene.getObjectByName('terrain-patches-road-cleared-v1');
    const terrainConflicts = [];
    if (terrain?.isInstancedMesh) {
      const data = terrain.instanceMatrix.array;
      for (let i = 0; i < terrain.count; i++) {
        const offset = i * 16;
        const x = data[offset + 12];
        const z = data[offset + 14];
        const sx = Math.hypot(data[offset], data[offset + 1], data[offset + 2]);
        const sz = Math.hypot(data[offset + 8], data[offset + 9], data[offset + 10]);
        const radius = Math.hypot(sx, sz) * 0.5;
        if (ecology.roadConflictAt(x, z, radius, 0)) terrainConflicts.push({ i, x, z, radius });
      }
    }

    return {
      resourceConflicts,
      taggedConflicts,
      terrainConflicts,
      ecology: {
        roadPadding: ecology.roadPadding,
        relocatedFromRoad: ecology.relocatedFromRoad,
        resourceRoadExclusion: ecology.resourceRoadExclusion
      },
      landscape: window.__BATTLEFIELD_3D_LANDSCAPE_V1__
    };
  });

  expect(result.ecology.resourceRoadExclusion).toBe(true);
  expect(result.ecology.roadPadding).toBeGreaterThan(0);
  expect(result.landscape.roadClearance).toBe(true);
  expect(result.resourceConflicts).toEqual([]);
  expect(result.taggedConflicts).toEqual([]);
  expect(result.terrainConflicts).toEqual([]);
});

test('mobile 2D renderer refuses to paint trees and crops across a road', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?test');
  await page.waitForFunction(() => Boolean(
    window.__BATTLEFIELD_ECOLOGY_V1__?.resourceRoadExclusion &&
    window.__NATURAL_RESOURCES_V1__?.roadRenderGuard &&
    window.__MAP_REALISM_V2__?.roadClearance2D &&
    window.__VILLAGE_LANDSCAPE_V6__?.roadVegetationClearance &&
    window.__VILLAGE_LANDSCAPE_V7__?.roadVegetationClearance
  ), null, { timeout: 20000 });

  const result = await page.evaluate(() => {
    const roads = window.NRTS_ROAD_NETWORK_V7 || window.ROAD_NETWORK_V066 || [];
    const road = roads.find(item => Array.isArray(item.points) && item.points.length >= 2);
    if (!road) return { hasRoad: false };
    const a = road.points[0], b = road.points[1];
    const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
    const fakeTree = { id: 999999, type: 'wood', x, y, amount: 100, maxAmount: 100 };
    const fakeFood = { id: 999998, type: 'food', x, y, amount: 100, maxAmount: 100 };
    return {
      hasRoad: true,
      treeBlocked: window.__NATURAL_RESOURCES_V1__.overlapsRoad(fakeTree, 1),
      foodBlocked: window.__NATURAL_RESOURCES_V1__.overlapsRoad(fakeFood, 1),
      mapBlocked: window.__MAP_REALISM_V2__.roadConflictAt(x, y, 6, 8),
      naturalVersion: window.__NATURAL_RESOURCES_V1__.version,
      mapVersion: window.__MAP_REALISM_V2__.version,
      village6: window.__VILLAGE_LANDSCAPE_V6__.roadVegetationClearance,
      village7: window.__VILLAGE_LANDSCAPE_V7__.roadVegetationClearance
    };
  });

  expect(result.hasRoad).toBe(true);
  expect(result.treeBlocked).toBe(true);
  expect(result.foodBlocked).toBe(true);
  expect(result.mapBlocked).toBe(true);
  expect(result.village6).toBe(true);
  expect(result.village7).toBe(true);
  expect(result.naturalVersion).toContain('road-guard');
  expect(result.mapVersion).toContain('road-clearance');
});