const { test, expect } = require('@playwright/test');

async function enable3d(page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_V1__);
  await page.evaluate(() => window.__BATTLEFIELD_3D_V1__.setEnabled(true));
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_REGIMENTAL_IDENTITY_V1__?.diagnostics().updates > 0);
}

test('regimental identity uses fixed budgets and adaptive LOD', async ({ page }) => {
  await enable3d(page);
  const state = await page.evaluate(() => {
    const api = window.__BATTLEFIELD_3D_REGIMENTAL_IDENTITY_V1__;
    const group = window.__NRTS_THREE_SCENE_HOOK_V1__.scene().getObjectByName('napoleonic-regimental-identity-v1');
    return {
      version: api.version,
      maxUnitDetails: api.maxUnitDetails,
      maxStandards: api.maxStandards,
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

  expect(state.version).toBe('battlefield-3d-regimental-identity-v1');
  expect(state.maxUnitDetails).toBeLessThanOrEqual(900);
  expect(state.maxStandards).toBeLessThanOrEqual(64);
  expect(state.nearRadius).toBeLessThan(state.farRadius);
  expect(state.farLodCameraY).toBeLessThan(state.ultraFarLodCameraY);
  expect(state.visualFeatures).toEqual(expect.arrayContaining([
    'infantry-crossbelts',
    'cavalry-sabres',
    'french-tricolour-standards',
    'british-cross-standards'
  ]));
  expect(state.performanceModel).toBe('instanced-fixed-budget-distance-culled-two-tier-identity-lod');
  expect(state.attached).toBe(true);
  expect(state.childCount).toBe(8);
  expect(state.diagnostics.active).toBe(true);
});

test('a nearby deterministic infantry standard is rendered without exceeding caps', async ({ page }) => {
  await enable3d(page);
  const prepared = await page.evaluate(() => {
    const snapshot = window.NRTS_3D_SOURCE.snapshot();
    const camera = window.NRTS_3D_SOURCE.camera();
    const infantry = snapshot.units.find(unit => !unit.dead && unit.type !== 'worker' && unit.type !== 'cavalry' && unit.type !== 'artillery');
    if (!infantry || !Number.isFinite(camera?.x) || !Number.isFinite(camera?.y)) return false;
    infantry.id = 'test12';
    infantry.x = camera.x + 12;
    infantry.y = camera.y + 8;
    return true;
  });
  expect(prepared).toBe(true);
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_REGIMENTAL_IDENTITY_V1__.diagnostics().standardsVisible > 0);
  const diagnostics = await page.evaluate(() => window.__BATTLEFIELD_3D_REGIMENTAL_IDENTITY_V1__.diagnostics());
  expect(diagnostics.standardsVisible).toBeGreaterThan(0);
  expect(diagnostics.standardsVisible).toBeLessThanOrEqual(64);
  expect(diagnostics.unitDetailsVisible).toBeLessThanOrEqual(900);
});

test('regimental identity suspends in 2D and resumes in 3D', async ({ page }) => {
  await enable3d(page);
  await page.evaluate(() => window.__BATTLEFIELD_3D_V1__.setEnabled(false));
  await page.waitForTimeout(210);
  const paused = await page.evaluate(() => window.__BATTLEFIELD_3D_REGIMENTAL_IDENTITY_V1__.diagnostics());
  await page.waitForTimeout(210);
  const settled = await page.evaluate(() => window.__BATTLEFIELD_3D_REGIMENTAL_IDENTITY_V1__.diagnostics());
  expect(settled.updates).toBe(paused.updates);
  expect(settled.skippedInactive).toBeGreaterThan(paused.skippedInactive);
  expect(settled.unitDetailsVisible).toBe(0);
  expect(settled.standardsVisible).toBe(0);

  await page.evaluate(() => window.__BATTLEFIELD_3D_V1__.setEnabled(true));
  await page.waitForFunction(previous => window.__BATTLEFIELD_3D_REGIMENTAL_IDENTITY_V1__.diagnostics().updates > previous, settled.updates);
});
