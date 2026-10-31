const { test, expect } = require('@playwright/test');

// The 3D scenery test that stood here went with the legacy 3D battlefield (v1.3.50).
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
  // The map renderer has since been renamed (v2.5 painterly); its road-clearance pass is the flag.
  expect(result.mapVersion).toMatch(/^map-realism-v2/);
});