const { test, expect } = require('@playwright/test');

test('3D village scenery adds render-only archetype silhouettes without changing simulation authority', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.NRTS_3D_SOURCE && window.__BATTLEFIELD_3D_V1__);

  const state = await page.evaluate(() => {
    const world = window.NRTS_3D_SOURCE.staticWorld();
    const villages = world.villages || [];
    const renderOnly = villages.flatMap(village => village.houses || []).filter(house => house.renderOnly);
    const byArchetype = Object.fromEntries(villages.map(village => [village.archetype, (village.houses || []).filter(house => house.renderOnly).map(house => house.kind)]));
    return {
      bridgeVersion: window.NRTS_3D_SOURCE.version,
      sceneryContract: window.NRTS_3D_SOURCE.villageScenery,
      villageCount: villages.length,
      sceneryCount: renderOnly.length,
      renderOnlyZones: [...new Set(renderOnly.map(house => house.zone))],
      renderOnlyRoles: [...new Set(renderOnly.map(house => house.clusterRole))],
      archetypes: Object.keys(byArchetype),
      kinds: [...new Set(Object.values(byArchetype).flat())],
      authority: window.__VILLAGE_AUTHORITY_V6__?.version || null
    };
  });

  expect(state.bridgeVersion).toBe('battlefield-3d-bridge-v1.3.8');
  expect(state.sceneryContract).toBe('archetype-render-only-silhouette-v1');
  expect(state.villageCount).toBeGreaterThan(0);
  expect(state.sceneryCount).toBeGreaterThanOrEqual(state.villageCount * 3);
  expect(state.renderOnlyZones).toEqual(['render-only']);
  expect(state.renderOnlyRoles.length).toBeGreaterThanOrEqual(4);
  expect(state.archetypes.length).toBeGreaterThanOrEqual(4);
  expect(state.kinds).toContain('house');
  if (state.archetypes.some(key => String(key).includes('agrar'))) {
    expect(state.kinds).toEqual(expect.arrayContaining(['barn', 'farmhouse']));
  }
  if (state.archetypes.some(key => String(key).includes('cross'))) {
    expect(state.kinds).toContain('inn');
  }
  expect(state.authority).toContain('village-authority-v6');
});
