const { test, expect } = require('@playwright/test');

test('3D battlefield loads lightweight Napoleonic unit detail silhouettes', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_UNIT_DETAIL_V1__ && window.__NRTS_THREE_SCENE_HOOK_V1__?.scene?.());

  const state = await page.evaluate(() => {
    const api = window.__BATTLEFIELD_3D_UNIT_DETAIL_V1__;
    const scene = window.__NRTS_THREE_SCENE_HOOK_V1__.scene();
    const group = scene.getObjectByName('napoleonic-unit-details-v1');
    return {
      version: api.version,
      updateIntervalMs: api.updateIntervalMs,
      maxInstances: api.maxInstances,
      layerCount: api.layerCount,
      visualRoles: api.visualRoles,
      performanceModel: api.performanceModel,
      attached: Boolean(group),
      childCount: group?.children?.length || 0
    };
  });

  expect(state.version).toBe('battlefield-3d-unit-detail-v1');
  expect(state.updateIntervalMs).toBeGreaterThanOrEqual(40);
  expect(state.maxInstances).toBeGreaterThanOrEqual(1000);
  expect(state.layerCount).toBeGreaterThanOrEqual(12);
  expect(state.visualRoles).toEqual(expect.arrayContaining(['infantry', 'officer', 'cavalry', 'artillery']));
  expect(state.performanceModel).toBe('shared-instanced-low-poly-detail');
  expect(state.attached).toBe(true);
  expect(state.childCount).toBe(state.layerCount);
});
