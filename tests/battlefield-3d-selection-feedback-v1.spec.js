const { test, expect } = require('@playwright/test');

test('3D selection feedback loads as a lightweight pooled visual layer', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_V1__);
  await page.evaluate(() => window.__BATTLEFIELD_3D_V1__.setEnabled(true));
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_SELECTION_FEEDBACK_V1__ && window.__NRTS_THREE_SCENE_HOOK_V1__?.scene?.());
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_SELECTION_FEEDBACK_V1__.diagnostics().updates > 0);

  const state = await page.evaluate(() => {
    const api = window.__BATTLEFIELD_3D_SELECTION_FEEDBACK_V1__;
    const group = window.__NRTS_THREE_SCENE_HOOK_V1__.scene().getObjectByName('napoleonic-selection-feedback-v1');
    return {
      version: api.version,
      maxSelected: api.maxSelected,
      updateIntervalMs: api.updateIntervalMs,
      farUpdateIntervalMs: api.farUpdateIntervalMs,
      ultraFarUpdateIntervalMs: api.ultraFarUpdateIntervalMs,
      farLodCameraY: api.farLodCameraY,
      ultraFarLodCameraY: api.ultraFarLodCameraY,
      feedback: api.feedback,
      performanceModel: api.performanceModel,
      diagnostics: api.diagnostics(),
      attached: Boolean(group),
      childCount: group?.children?.length || 0
    };
  });

  expect(state.version).toBe('battlefield-3d-selection-feedback-v1');
  expect(state.maxSelected).toBeLessThanOrEqual(64);
  expect(state.updateIntervalMs).toBeGreaterThanOrEqual(50);
  expect(state.farUpdateIntervalMs).toBeGreaterThan(state.updateIntervalMs);
  expect(state.ultraFarUpdateIntervalMs).toBeGreaterThan(state.farUpdateIntervalMs);
  expect(state.ultraFarLodCameraY).toBeGreaterThan(state.farLodCameraY);
  expect(state.feedback).toEqual(expect.arrayContaining([
    'faction-colored-selection-ring',
    'near-lod-facing-arrow',
    'far-lod-ring-scaling'
  ]));
  expect(state.performanceModel).toBe('pooled-instanced-selection-feedback');
  expect(state.diagnostics.active).toBe(true);
  expect(state.attached).toBe(true);
  expect(state.childCount).toBe(2);
});

test('3D selection feedback pauses in 2D mode and resumes in 3D', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_V1__);
  await page.evaluate(() => window.__BATTLEFIELD_3D_V1__.setEnabled(true));
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_SELECTION_FEEDBACK_V1__?.diagnostics().updates > 0);

  await page.evaluate(() => window.__BATTLEFIELD_3D_V1__.setEnabled(false));
  await page.waitForTimeout(180);
  const paused = await page.evaluate(() => window.__BATTLEFIELD_3D_SELECTION_FEEDBACK_V1__.diagnostics());
  await page.waitForTimeout(180);
  const settled = await page.evaluate(() => window.__BATTLEFIELD_3D_SELECTION_FEEDBACK_V1__.diagnostics());

  expect(settled.updates).toBe(paused.updates);
  expect(settled.skippedInactive).toBeGreaterThan(paused.skippedInactive);

  await page.evaluate(() => window.__BATTLEFIELD_3D_V1__.setEnabled(true));
  await page.waitForFunction(previous => window.__BATTLEFIELD_3D_SELECTION_FEEDBACK_V1__.diagnostics().updates > previous, settled.updates);
  const resumed = await page.evaluate(() => window.__BATTLEFIELD_3D_SELECTION_FEEDBACK_V1__.diagnostics());
  expect(resumed.updates).toBeGreaterThan(settled.updates);
});
