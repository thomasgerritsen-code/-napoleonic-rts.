const { test, expect } = require('@playwright/test');

test('normal play prioritizes viewport-culled 2D rendering with density LOD', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/?test=v071', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(
    window.__LARGE_ARMY_PERFORMANCE_V1__ &&
    window.__MAP_REALISM_V2__ &&
    window.__MAP_AMBIENT_MOTION_V1__ &&
    window.__BATTLEFIELD_3D_V1__
  ));
  await page.waitForTimeout(120);

  const baseline = await page.evaluate(() => {
    window.__LARGE_ARMY_PERFORMANCE_V1__.prepareFrameIndexes();
    const bounds = window.__MAP_REALISM_V2__.visibleBounds(0);
    const perf = window.__LARGE_ARMY_PERFORMANCE_V1__;
    const beforeCache = perf.renderStats();
    draw();
    draw();
    const afterCache = perf.renderStats();
    return {
      twoDDefault: perf.twoDDefault,
      maxCanvasDpr: perf.maxCanvasDpr,
      unitLod: perf.unitLod,
      staticTerrainCache: perf.staticTerrainCache,
      staticTerrainRefreshMs: perf.staticTerrainRefreshMs,
      staticCanvasExists: Boolean(document.getElementById(perf.staticTerrainCanvasId)),
      staticCacheHits: afterCache.staticTerrainHits - beforeCache.staticTerrainHits,
      mapCull: window.__MAP_REALISM_V2__.viewportCulling,
      precomputedGroundMarks: window.__MAP_REALISM_V2__.precomputedGroundMarks,
      precomputedRoadPaths: window.__MAP_REALISM_V2__.precomputedRoadPaths,
      precomputedJunctions: window.__MAP_REALISM_V2__.precomputedJunctions,
      ambientCull: window.__MAP_AMBIENT_MOTION_V1__.viewportCulling,
      ambientOverlaySplit: typeof window.__MAP_AMBIENT_MOTION_V1__.drawOverlay === 'function',
      threeDEnabled: window.__BATTLEFIELD_3D_V1__.enabled(),
      canvasWidth: document.getElementById('game').width,
      cssWidth: innerWidth,
      boundsWidth: bounds.width,
      worldWidth: WORLD.width
    };
  });

  expect(baseline.twoDDefault).toBe(true);
  expect(baseline.maxCanvasDpr).toBe(1.5);
  expect(baseline.unitLod).toBe(true);
  expect(baseline.staticTerrainCache).toBe(true);
  expect(baseline.staticTerrainRefreshMs).toBeGreaterThanOrEqual(200);
  expect(baseline.staticCanvasExists).toBe(true);
  expect(baseline.staticCacheHits).toBeGreaterThan(0);
  expect(baseline.mapCull).toBe(true);
  expect(baseline.precomputedGroundMarks).toBe(true);
  expect(baseline.precomputedRoadPaths).toBe(true);
  expect(baseline.precomputedJunctions).toBe(true);
  expect(baseline.ambientCull).toBe(true);
  expect(baseline.ambientOverlaySplit).toBe(true);
  expect(baseline.threeDEnabled).toBe(false);
  expect(baseline.canvasWidth).toBeLessThanOrEqual(Math.ceil(baseline.cssWidth * 1.5) + 1);
  expect(baseline.boundsWidth).toBeLessThan(baseline.worldWidth);

  const lod = await page.evaluate(() => {
    const cx = camera.x;
    const cy = camera.y;
    let living = units.filter(unit => !unit.dead).length;
    while (living <= 390) {
      const i = living;
      createUnit('france', 'infantry', cx + (i % 24) * 13 - 150, cy + Math.floor((i % 240) / 24) * 13 - 70);
      living++;
    }
    window.__LARGE_ARMY_PERFORMANCE_V1__.prepareFrameIndexes();
    camera.zoom = 0.68;
    const before = window.__LARGE_ARMY_PERFORMANCE_V1__.renderStats();
    draw();
    const after = window.__LARGE_ARMY_PERFORMANCE_V1__.renderStats();
    return {
      living: window.__LARGE_ARMY_PERFORMANCE_V1__.livingUnitCount(),
      lodDraws: after.lodUnits - before.lodUnits,
      fullDraws: after.fullUnits - before.fullUnits,
      culled: after.culledUnits - before.culledUnits,
      terrainInvalidations: after.staticTerrainInvalidations - before.staticTerrainInvalidations
    };
  });

  expect(lod.living).toBeGreaterThan(360);
  expect(lod.lodDraws).toBeGreaterThan(0);
  expect(lod.lodDraws + lod.fullDraws + lod.culled).toBeGreaterThan(300);
  expect(lod.terrainInvalidations).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});
