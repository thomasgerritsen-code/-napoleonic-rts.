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
      scheduler: api.scheduler,
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
  expect(state.scheduler).toBe('fixed-interval-active-3d-only');
  expect(state.attached).toBe(true);
  expect(state.childCount).toBe(state.layerCount);
});

test('3D unit detail work pauses in 2D mode and resumes in 3D', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_UNIT_DETAIL_V1__ && window.__BATTLEFIELD_3D_V1__);

  await page.evaluate(() => window.__BATTLEFIELD_3D_V1__.setEnabled(true));
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_UNIT_DETAIL_V1__.diagnostics().updates > 0);

  await page.evaluate(() => window.__BATTLEFIELD_3D_V1__.setEnabled(false));
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_UNIT_DETAIL_V1__.diagnostics().active === false);

  // Allow any scheduler tick that was already in flight at the mode switch to finish,
  // then verify the expensive update counter remains frozen while 2D stays active.
  await page.waitForTimeout(120);
  const settledPause = await page.evaluate(() => window.__BATTLEFIELD_3D_UNIT_DETAIL_V1__.diagnostics());
  await page.waitForTimeout(160);
  const paused = await page.evaluate(() => window.__BATTLEFIELD_3D_UNIT_DETAIL_V1__.diagnostics());

  expect(paused.active).toBe(false);
  expect(paused.updates).toBe(settledPause.updates);
  expect(paused.skippedInactive).toBeGreaterThan(settledPause.skippedInactive);

  await page.evaluate(() => window.__BATTLEFIELD_3D_V1__.setEnabled(true));
  await page.waitForFunction(previous => window.__BATTLEFIELD_3D_UNIT_DETAIL_V1__.diagnostics().updates > previous, settledPause.updates);
  const resumed = await page.evaluate(() => window.__BATTLEFIELD_3D_UNIT_DETAIL_V1__.diagnostics());
  expect(resumed.active).toBe(true);
  expect(resumed.updates).toBeGreaterThan(settledPause.updates);
});
