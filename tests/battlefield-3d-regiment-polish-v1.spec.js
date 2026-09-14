const { test, expect } = require('@playwright/test');

async function enable3d(page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_V1__);
  await page.evaluate(() => window.__BATTLEFIELD_3D_V1__.setEnabled(true));
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_REGIMENT_POLISH_V1__?.diagnostics().updates > 0);
}

test('regiment polish uses fixed instanced budgets and adaptive LOD', async ({ page }) => {
  await enable3d(page);
  const state = await page.evaluate(() => {
    const api = window.__BATTLEFIELD_3D_REGIMENT_POLISH_V1__;
    const group = window.__NRTS_THREE_SCENE_HOOK_V1__.scene().getObjectByName('napoleonic-regiment-polish-v1');
    return {
      version: api.version,
      maxAccents: api.maxAccents,
      maxDust: api.maxDust,
      nearRadius: api.nearRadius,
      farRadius: api.farRadius,
      farLodCameraY: api.farLodCameraY,
      ultraFarLodCameraY: api.ultraFarLodCameraY,
      visualFeatures: api.visualFeatures,
      performanceModel: api.performanceModel,
      attached: Boolean(group),
      childCount: group?.children?.length || 0,
      diagnostics: api.diagnostics()
    };
  });
  expect(state.version).toBe('battlefield-3d-regiment-polish-v1');
  expect(state.maxAccents).toBeLessThanOrEqual(900);
  expect(state.maxDust).toBeLessThanOrEqual(72);
  expect(state.nearRadius).toBeLessThan(state.farRadius);
  expect(state.farLodCameraY).toBeLessThan(state.ultraFarLodCameraY);
  expect(state.visualFeatures).toEqual(expect.arrayContaining([
    'faction-plumes',
    'faction-shoulder-trim',
    'cavalry-saddlecloth',
    'movement-dust'
  ]));
  expect(state.performanceModel).toBe('instanced-near-detail-pooled-motion-dust-distance-culled-lod');
  expect(state.attached).toBe(true);
  expect(state.childCount).toBe(4);
  expect(state.diagnostics.active).toBe(true);
});

test('moving units can emit pooled march dust without exceeding the hard cap', async ({ page }) => {
  await enable3d(page);
  const before = await page.evaluate(() => window.__BATTLEFIELD_3D_REGIMENT_POLISH_V1__.diagnostics());
  const moved = await page.evaluate(() => {
    const snapshot = window.NRTS_3D_SOURCE.snapshot();
    const camera = window.NRTS_3D_SOURCE.camera();
    const units = snapshot.units.filter(item => !item.dead && item.type !== 'worker').slice(0, 12);
    if (!units.length || !Number.isFinite(camera?.x) || !Number.isFinite(camera?.y)) return false;
    units.forEach((unit, index) => {
      unit.x = camera.x + index * 3;
      unit.y = camera.y + index * 2;
    });
    return true;
  });
  expect(moved).toBe(true);
  await page.waitForTimeout(120);
  await page.evaluate(() => {
    const snapshot = window.NRTS_3D_SOURCE.snapshot();
    snapshot.units.filter(item => !item.dead && item.type !== 'worker').slice(0, 12).forEach(unit => {
      unit.x += 5;
      unit.y += 2;
    });
  });
  await page.waitForFunction(previous => window.__BATTLEFIELD_3D_REGIMENT_POLISH_V1__.diagnostics().dustSpawned > previous, before.dustSpawned);
  const after = await page.evaluate(() => window.__BATTLEFIELD_3D_REGIMENT_POLISH_V1__.diagnostics());
  expect(after.dustSpawned).toBeGreaterThan(before.dustSpawned);
  expect(after.dustVisible).toBeLessThanOrEqual(72);
  expect(after.movingUnits).toBeGreaterThan(0);
});

test('regiment polish suspends cleanly in 2D and resumes in 3D', async ({ page }) => {
  await enable3d(page);
  await page.evaluate(() => window.__BATTLEFIELD_3D_V1__.setEnabled(false));
  await page.waitForTimeout(180);
  const paused = await page.evaluate(() => window.__BATTLEFIELD_3D_REGIMENT_POLISH_V1__.diagnostics());
  await page.waitForTimeout(180);
  const settled = await page.evaluate(() => window.__BATTLEFIELD_3D_REGIMENT_POLISH_V1__.diagnostics());
  expect(settled.updates).toBe(paused.updates);
  expect(settled.skippedInactive).toBeGreaterThan(paused.skippedInactive);
  expect(settled.accentsVisible).toBe(0);
  expect(settled.dustVisible).toBe(0);

  await page.evaluate(() => window.__BATTLEFIELD_3D_V1__.setEnabled(true));
  await page.waitForFunction(previous => window.__BATTLEFIELD_3D_REGIMENT_POLISH_V1__.diagnostics().updates > previous, settled.updates);
});
