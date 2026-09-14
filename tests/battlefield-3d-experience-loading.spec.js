const { test, expect } = require('@playwright/test');

test('cosmetic 3D layers stay deferred in 2D and start when 3D is enabled', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('nrts-render-mode', '2d'));
  await page.goto('/');
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_EXPERIENCE_V1__);
  await page.waitForTimeout(260);

  const before = await page.evaluate(() => {
    const api = window.__BATTLEFIELD_3D_EXPERIENCE_V1__;
    return { mode: api.mode(), staged: api.stagedVisualLoading, adaptive: api.adaptiveFrameBudget, build: api.visualBuild, diagnostics: api.diagnostics() };
  });
  expect(before.mode).toBe('2d');
  expect(before.staged).toBe(true);
  expect(before.adaptive).toBe(true);
  expect(before.build).toBe('graphics16');
  expect(before.diagnostics.visualLayersImportStarted).toBe(false);
  expect(before.diagnostics.visualLayersReady).toBe(0);
  expect(before.diagnostics.deferredWaits).toBeGreaterThan(0);
  expect(before.diagnostics.frameMonitorActive).toBe(false);
  expect(before.diagnostics.framePressure).toBe(false);

  await page.keyboard.press('Alt+3');
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_EXPERIENCE_V1__.diagnostics().visualLayersImportStarted);
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_EXPERIENCE_V1__.diagnostics().visualLayersReady >= 2);

  const after = await page.evaluate(() => window.__BATTLEFIELD_3D_EXPERIENCE_V1__.diagnostics());
  expect(after.visualLayersFailed).toBe(0);
  expect(after.visualLayerCount).toBe(7);
  expect(after.frameMonitorActive).toBe(true);
  expect(after.averageFrameMs).toBeGreaterThan(0);
});

test('cosmetic visual layers are staggered after essential 3D layers', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('nrts-render-mode', '3d'));
  await page.goto('/');
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_EXPERIENCE_V1__?.diagnostics().visualLayersImportStarted);
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_EXPERIENCE_V1__.diagnostics().visualLayersReady === 7, null, { timeout: 12000 });

  const state = await page.evaluate(() => ({
    diagnostics: window.__BATTLEFIELD_3D_EXPERIENCE_V1__.diagnostics(),
    graphicsPressure: document.documentElement.dataset.graphicsPressure
  }));
  expect(state.diagnostics.visualLayersFailed).toBe(0);
  expect(state.diagnostics.visualLayersReady).toBe(7);
  expect(state.diagnostics.deferredBatches).toBeGreaterThanOrEqual(5);
  expect(['normal', 'reduced']).toContain(state.graphicsPressure);
});

test('frame monitor pauses cleanly when switching back to 2D', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('nrts-render-mode', '3d'));
  await page.goto('/');
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_EXPERIENCE_V1__?.diagnostics().frameMonitorActive);

  await page.keyboard.press('Alt+3');
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_EXPERIENCE_V1__?.mode() === '2d');

  const state = await page.evaluate(() => ({
    diagnostics: window.__BATTLEFIELD_3D_EXPERIENCE_V1__.diagnostics(),
    pressure: document.documentElement.dataset.graphicsPressure
  }));
  expect(state.diagnostics.frameMonitorActive).toBe(false);
  expect(state.diagnostics.framePressure).toBe(false);
  expect(state.pressure).toBe('normal');
});
