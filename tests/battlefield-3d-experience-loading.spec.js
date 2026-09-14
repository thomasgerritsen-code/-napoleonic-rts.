const { test, expect } = require('@playwright/test');

test('cosmetic 3D layers stay deferred in 2D and start when 3D is enabled', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('nrts-render-mode', '2d'));
  await page.goto('/');
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_EXPERIENCE_V1__);
  await page.waitForTimeout(260);

  const before = await page.evaluate(() => {
    const api = window.__BATTLEFIELD_3D_EXPERIENCE_V1__;
    return { mode: api.mode(), staged: api.stagedVisualLoading, build: api.visualBuild, diagnostics: api.diagnostics() };
  });
  expect(before.mode).toBe('2d');
  expect(before.staged).toBe(true);
  expect(before.build).toBe('graphics15');
  expect(before.diagnostics.visualLayersImportStarted).toBe(false);
  expect(before.diagnostics.visualLayersReady).toBe(0);
  expect(before.diagnostics.deferredWaits).toBeGreaterThan(0);

  await page.keyboard.press('Alt+3');
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_EXPERIENCE_V1__.diagnostics().visualLayersImportStarted);
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_EXPERIENCE_V1__.diagnostics().visualLayersReady >= 2);

  const after = await page.evaluate(() => window.__BATTLEFIELD_3D_EXPERIENCE_V1__.diagnostics());
  expect(after.visualLayersFailed).toBe(0);
  expect(after.visualLayerCount).toBe(7);
});

test('cosmetic visual layers are staggered after essential 3D layers', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('nrts-render-mode', '3d'));
  await page.goto('/');
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_EXPERIENCE_V1__?.diagnostics().visualLayersImportStarted);
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_EXPERIENCE_V1__.diagnostics().visualLayersReady === 7, null, { timeout: 10000 });

  const state = await page.evaluate(() => window.__BATTLEFIELD_3D_EXPERIENCE_V1__.diagnostics());
  expect(state.visualLayersFailed).toBe(0);
  expect(state.visualLayersReady).toBe(7);
  expect(state.deferredBatches).toBeGreaterThanOrEqual(5);
});
