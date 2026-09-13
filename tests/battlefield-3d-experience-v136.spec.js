const { test, expect } = require('@playwright/test');

test('3D bridge exposes archetype metadata and resilient experience controls', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_V1__ && window.__BATTLEFIELD_3D_EXPERIENCE_V1__);

  const state = await page.evaluate(() => {
    const world = window.NRTS_3D_SOURCE.staticWorld();
    const exp = window.__BATTLEFIELD_3D_EXPERIENCE_V1__;
    return {
      bridgeVersion: window.__BATTLEFIELD_3D_BRIDGE_V1__.version,
      villageMetadata: window.__BATTLEFIELD_3D_BRIDGE_V1__.villageMetadata,
      villageIdentityCompanion: window.__BATTLEFIELD_3D_BRIDGE_V1__.villageIdentityCompanion,
      villageScenery: window.__BATTLEFIELD_3D_BRIDGE_V1__.villageScenery,
      archetypes: [...new Set(world.villages.map(v => v.archetype))],
      houseMetadata: world.villages.flatMap(v => v.houses).every(h => typeof h.archetype === 'string' && typeof h.zone === 'string' && typeof h.clusterRole === 'string'),
      experienceVersion: exp.version,
      shortcut: exp.shortcut,
      persistentMode: exp.persistentMode,
      webglFallback: exp.webglFallback,
      hiddenTabSuspension: exp.hiddenTabSuspension,
      mode: exp.mode()
    };
  });

  expect(state.bridgeVersion).toBe('battlefield-3d-bridge-v1.3.8');
  expect(state.villageMetadata).toBe('archetype-zone-cluster-role-render-only');
  expect(state.villageIdentityCompanion).toBe(true);
  expect(state.villageScenery).toBe('archetype-render-only-silhouette-v1');
  expect(state.archetypes.length).toBeGreaterThanOrEqual(4);
  expect(state.houseMetadata).toBe(true);
  expect(state.experienceVersion).toBe('battlefield-3d-experience-v1');
  expect(state.shortcut).toBe('Alt+3');
  expect(state.persistentMode).toBe(true);
  expect(state.webglFallback).toBe(true);
  expect(state.hiddenTabSuspension).toBe(true);
  expect(['2d', '3d']).toContain(state.mode);
});
