const { test, expect } = require('@playwright/test');

test('3D battlefield loads lightweight Napoleonic unit detail silhouettes', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_UNIT_DETAIL_V1__ && window.__NRTS_THREE_SCENE_HOOK_V1__?.scene?.() && window.__BATTLEFIELD_3D_V1__);

  await page.evaluate(() => window.__BATTLEFIELD_3D_V1__.setEnabled(true));
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_UNIT_DETAIL_V1__.diagnostics().transformBuilds > 0);

  const state = await page.evaluate(() => {
    const api = window.__BATTLEFIELD_3D_UNIT_DETAIL_V1__;
    const scene = window.__NRTS_THREE_SCENE_HOOK_V1__.scene();
    const group = scene.getObjectByName('napoleonic-unit-details-v1');
    return {
      version: api.version,
      updateIntervalMs: api.updateIntervalMs,
      farUpdateIntervalMs: api.farUpdateIntervalMs,
      ultraFarUpdateIntervalMs: api.ultraFarUpdateIntervalMs,
      farLodCameraY: api.farLodCameraY,
      ultraFarLodCameraY: api.ultraFarLodCameraY,
      maxInstances: api.maxInstances,
      layerCount: api.layerCount,
      visualRoles: api.visualRoles,
      silhouetteFeatures: api.silhouetteFeatures,
      performanceModel: api.performanceModel,
      transformReuse: api.transformReuse,
      scheduler: api.scheduler,
      diagnostics: api.diagnostics(),
      attached: Boolean(group),
      childCount: group?.children?.length || 0
    };
  });

  expect(state.version).toBe('battlefield-3d-unit-detail-v1');
  expect(state.updateIntervalMs).toBeGreaterThanOrEqual(40);
  expect(state.farUpdateIntervalMs).toBeGreaterThan(state.updateIntervalMs);
  expect(state.ultraFarUpdateIntervalMs).toBeGreaterThan(state.farUpdateIntervalMs);
  expect(state.farLodCameraY).toBeGreaterThan(700);
  expect(state.ultraFarLodCameraY).toBeGreaterThan(state.farLodCameraY);
  expect(state.ultraFarLodCameraY).toBeLessThanOrEqual(1230);
  expect(state.maxInstances).toBeGreaterThanOrEqual(1000);
  expect(state.layerCount).toBeGreaterThanOrEqual(20);
  expect(state.visualRoles).toEqual(expect.arrayContaining(['infantry', 'officer', 'cavalry', 'artillery']));
  expect(state.silhouetteFeatures).toEqual(expect.arrayContaining([
    'infantry-pack',
    'horse-body-head-tail',
    'gun-carriage-trail',
    'artillery-crew'
  ]));
  expect(state.performanceModel).toBe('shared-instanced-low-poly-detail');
  expect(state.transformReuse).toBe('one-world-matrix-per-unit-update');
  expect(state.scheduler).toBe('adaptive-active-3d-tiered-lod');
  expect(['near', 'far', 'ultra-far']).toContain(state.diagnostics.lodMode);
  expect(state.diagnostics.transformBuilds).toBeGreaterThan(0);
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

  await page.waitForTimeout(120);
  const settledPause = await page.evaluate(() => window.__BATTLEFIELD_3D_UNIT_DETAIL_V1__.diagnostics());
  await page.waitForTimeout(160);
  const paused = await page.evaluate(() => window.__BATTLEFIELD_3D_UNIT_DETAIL_V1__.diagnostics());

  expect(paused.active).toBe(false);
  expect(paused.updates).toBe(settledPause.updates);
  expect(paused.transformBuilds).toBe(settledPause.transformBuilds);
  expect(paused.skippedInactive).toBeGreaterThan(settledPause.skippedInactive);

  await page.evaluate(() => window.__BATTLEFIELD_3D_V1__.setEnabled(true));
  await page.waitForFunction(previous => window.__BATTLEFIELD_3D_UNIT_DETAIL_V1__.diagnostics().updates > previous, settledPause.updates);
  const resumed = await page.evaluate(() => window.__BATTLEFIELD_3D_UNIT_DETAIL_V1__.diagnostics());
  expect(resumed.active).toBe(true);
  expect(resumed.updates).toBeGreaterThan(settledPause.updates);
  expect(resumed.transformBuilds).toBeGreaterThan(settledPause.transformBuilds);
});

test('ultra-far tactical zoom suspends the optional 3D detail layer', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_UNIT_DETAIL_V1__ && window.__BATTLEFIELD_3D_V1__ && window.__NRTS_THREE_SCENE_HOOK_V1__?.scene?.());
  await page.evaluate(() => window.__BATTLEFIELD_3D_V1__.setEnabled(true));
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_UNIT_DETAIL_V1__.diagnostics().transformBuilds > 0);

  const canvas = page.locator('#battlefield3d');
  for (let i = 0; i < 8; i++) await canvas.dispatchEvent('wheel', { deltaY: 120 });

  await page.waitForFunction(() => {
    const api = window.__BATTLEFIELD_3D_UNIT_DETAIL_V1__;
    const diagnostics = api.diagnostics();
    return diagnostics.cameraY >= api.ultraFarLodCameraY && diagnostics.lodMode === 'ultra-far' && diagnostics.skippedUltraFar > 0;
  });

  await page.waitForTimeout(240);
  const settled = await page.evaluate(() => {
    const api = window.__BATTLEFIELD_3D_UNIT_DETAIL_V1__;
    const group = window.__NRTS_THREE_SCENE_HOOK_V1__.scene().getObjectByName('napoleonic-unit-details-v1');
    return { diagnostics: api.diagnostics(), visible: group.visible };
  });
  await page.waitForTimeout(260);
  const suspended = await page.evaluate(() => {
    const api = window.__BATTLEFIELD_3D_UNIT_DETAIL_V1__;
    const group = window.__NRTS_THREE_SCENE_HOOK_V1__.scene().getObjectByName('napoleonic-unit-details-v1');
    return { diagnostics: api.diagnostics(), visible: group.visible };
  });

  expect(suspended.visible).toBe(false);
  expect(suspended.diagnostics.lodMode).toBe('ultra-far');
  expect(suspended.diagnostics.updates).toBe(settled.diagnostics.updates);
  expect(suspended.diagnostics.transformBuilds).toBe(settled.diagnostics.transformBuilds);
  expect(suspended.diagnostics.skippedUltraFar).toBeGreaterThan(settled.diagnostics.skippedUltraFar);

  for (let i = 0; i < 8; i++) await canvas.dispatchEvent('wheel', { deltaY: -120 });
  await page.waitForFunction(previous => {
    const diagnostics = window.__BATTLEFIELD_3D_UNIT_DETAIL_V1__.diagnostics();
    return diagnostics.lodMode === 'near' && diagnostics.transformBuilds > previous;
  }, suspended.diagnostics.transformBuilds);

  const resumed = await page.evaluate(() => {
    const group = window.__NRTS_THREE_SCENE_HOOK_V1__.scene().getObjectByName('napoleonic-unit-details-v1');
    return { diagnostics: window.__BATTLEFIELD_3D_UNIT_DETAIL_V1__.diagnostics(), visible: group.visible };
  });
  expect(resumed.visible).toBe(true);
  expect(resumed.diagnostics.lodMode).toBe('near');
  expect(resumed.diagnostics.transformBuilds).toBeGreaterThan(suspended.diagnostics.transformBuilds);
});
