const { test, expect } = require('@playwright/test');

test('GRAPHICS-V2 look foundation attaches without changing the 3D authority contract', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('nrts-render-mode', '3d'));
  await page.goto('/');

  await page.waitForFunction(() => window.__BATTLEFIELD_3D_V1__ && window.__BATTLEFIELD_3D_LOOK_V2__);
  await page.waitForFunction(() => {
    const d = window.__BATTLEFIELD_3D_LOOK_V2__?.diagnostics?.();
    return d?.attached && d?.terrainStylized && d?.roadsStylized && d?.atmosphereStylized && d?.updates > 0;
  }, null, { timeout: 12000 });

  const state = await page.evaluate(() => ({
    look: window.__BATTLEFIELD_3D_LOOK_V2__.diagnostics(),
    renderer: window.__BATTLEFIELD_3D_V1__.diagnostics(),
    palette: window.__BATTLEFIELD_3D_LOOK_V2__.palette,
    experience: window.__BATTLEFIELD_3D_EXPERIENCE_V1__?.diagnostics?.() || null
  }));

  expect(pageErrors).toEqual([]);
  expect(state.palette).toBe('warm-muted-1815');
  expect(state.look.shadows).toBeGreaterThan(0);
  expect(state.renderer.renderer).toBeUndefined();
  expect(state.renderer.unitMeshes).toBeGreaterThan(0);
  expect(state.experience).not.toBeNull();
});
