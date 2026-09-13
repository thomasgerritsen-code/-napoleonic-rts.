const { test, expect } = require('@playwright/test');

test('v1.3.9 renders archetype village landscape as a render-only Three.js companion', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_V1__ && window.__BATTLEFIELD_3D_LANDSCAPE_V1__);

  const state = await page.evaluate(() => {
    const layer = window.__BATTLEFIELD_3D_LANDSCAPE_V1__;
    const world = window.NRTS_3D_SOURCE.staticWorld();
    const authority = window.__VILLAGE_AUTHORITY_V6__?.version || null;
    return {
      runtimeVersion: window.RTS_VERSION,
      bridgeVersion: window.NRTS_3D_SOURCE.version,
      hookVersion: window.__NRTS_THREE_SCENE_HOOK_V1__?.version || null,
      capturedScene: Boolean(window.__NRTS_THREE_SCENE__),
      layerVersion: layer.version,
      contract: layer.contract,
      renderOnly: layer.renderOnly,
      counts: layer.counts,
      features: layer.features,
      objectCount: layer.objectCount,
      villageCount: world.villages.length,
      authority
    };
  });

  expect(state.runtimeVersion).toBe('1.3.9');
  expect(state.bridgeVersion).toBe('battlefield-3d-bridge-v1.3.8');
  expect(state.hookVersion).toBe('battlefield-3d-scene-hook-v1');
  expect(state.capturedScene).toBe(true);
  expect(state.layerVersion).toBe('battlefield-3d-village-landscape-v1.3.9');
  expect(state.contract).toBe('render-only-archetype-landscape-v1');
  expect(state.renderOnly).toBe(true);
  expect(Object.values(state.counts).reduce((sum, value) => sum + value, 0)).toBe(state.villageCount);
  expect(Object.values(state.counts).filter(value => value > 0).length).toBeGreaterThanOrEqual(4);
  expect(Object.values(state.features).reduce((sum, value) => sum + value, 0)).toBe(state.villageCount);
  expect(state.objectCount).toBeGreaterThan(state.villageCount);
  if (state.counts.parish) expect(state.features.villageGreen).toBeGreaterThan(0);
  if (state.counts.ribbon) expect(state.features.ribbonVerges).toBeGreaterThan(0);
  if (state.counts.agrarian) expect(state.features.paddocks).toBeGreaterThan(0);
  if (state.counts.woodland) expect(state.features.woodlandGroves).toBeGreaterThan(0);
  if (state.counts.crossroads) expect(state.features.crossroadsMarkers).toBeGreaterThan(0);
  expect(state.authority).toContain('village-authority-v6');
});
