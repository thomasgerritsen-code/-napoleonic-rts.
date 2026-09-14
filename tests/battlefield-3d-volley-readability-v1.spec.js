const { test, expect } = require('@playwright/test');

async function enable3d(page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_V1__);
  await page.evaluate(() => window.__BATTLEFIELD_3D_V1__.setEnabled(true));
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_VOLLEY_READABILITY_V1__?.diagnostics().updates > 0);
}

test('3D volley readability uses fixed pools, distance culling and adaptive LOD', async ({ page }) => {
  await enable3d(page);
  const state = await page.evaluate(() => {
    const api = window.__BATTLEFIELD_3D_VOLLEY_READABILITY_V1__;
    const group = window.__NRTS_THREE_SCENE_HOOK_V1__.scene().getObjectByName('napoleonic-volley-readability-v1');
    return {
      version: api.version,
      maxVolleyRibbons: api.maxVolleyRibbons,
      maxCannonStreaks: api.maxCannonStreaks,
      midCameraY: api.midCameraY,
      farCameraY: api.farCameraY,
      effectRadius: api.effectRadius,
      effects: api.effects,
      performanceModel: api.performanceModel,
      attached: Boolean(group),
      childCount: group?.children?.length || 0,
      diagnostics: api.diagnostics()
    };
  });
  expect(state.version).toBe('battlefield-3d-volley-readability-v1');
  expect(state.maxVolleyRibbons).toBeLessThanOrEqual(32);
  expect(state.maxCannonStreaks).toBeLessThanOrEqual(12);
  expect(state.midCameraY).toBeGreaterThan(0);
  expect(state.farCameraY).toBeGreaterThan(state.midCameraY);
  expect(state.effectRadius).toBeLessThanOrEqual(900);
  expect(state.effects).toEqual(expect.arrayContaining([
    'regiment-volley-ribbon',
    'directional-cannon-streak',
    'adaptive-mid-lod'
  ]));
  expect(state.performanceModel).toBe('fixed-pool-distance-culled-adaptive-lod-readability');
  expect(state.attached).toBe(true);
  expect(state.childCount).toBe(2);
  expect(state.diagnostics.active).toBe(true);
});

test('musket fire emits one regiment-width readability ribbon', async ({ page }) => {
  await enable3d(page);
  const before = await page.evaluate(() => window.__BATTLEFIELD_3D_VOLLEY_READABILITY_V1__.diagnostics());
  const marked = await page.evaluate(() => {
    const snapshot = window.NRTS_3D_SOURCE.snapshot();
    const camera = window.NRTS_3D_SOURCE.camera();
    const unit = snapshot.units.find(item => item.type === 'infantry' && !item.dead);
    if (!unit || !Number.isFinite(camera?.x) || !Number.isFinite(camera?.y)) return false;
    unit.x = camera.x;
    unit.y = camera.y;
    unit.combatVisualV1 = { kind: 'musket-fire', started: snapshot.elapsed + 0.004, duration: 1.0 };
    return true;
  });
  expect(marked).toBe(true);
  await page.waitForFunction(previous => {
    return window.__BATTLEFIELD_3D_VOLLEY_READABILITY_V1__.diagnostics().emittedVolleyRibbons > previous;
  }, before.emittedVolleyRibbons);
  const after = await page.evaluate(() => window.__BATTLEFIELD_3D_VOLLEY_READABILITY_V1__.diagnostics());
  expect(after.emittedVolleyRibbons).toBeGreaterThan(before.emittedVolleyRibbons);
  expect(after.ribbonsVisible).toBeLessThanOrEqual(32);
});

test('artillery fire emits a directional streak within the fixed pool', async ({ page }) => {
  await enable3d(page);
  const before = await page.evaluate(() => window.__BATTLEFIELD_3D_VOLLEY_READABILITY_V1__.diagnostics());
  const marked = await page.evaluate(() => {
    const snapshot = window.NRTS_3D_SOURCE.snapshot();
    const camera = window.NRTS_3D_SOURCE.camera();
    const unit = snapshot.units.find(item => item.type === 'artillery' && !item.dead);
    if (!unit || !Number.isFinite(camera?.x) || !Number.isFinite(camera?.y)) return false;
    unit.x = camera.x;
    unit.y = camera.y;
    unit.combatVisualV1 = { kind: 'artillery-fire', started: snapshot.elapsed + 0.005, duration: 1.0 };
    return true;
  });
  expect(marked).toBe(true);
  await page.waitForFunction(previous => {
    return window.__BATTLEFIELD_3D_VOLLEY_READABILITY_V1__.diagnostics().emittedCannonStreaks > previous;
  }, before.emittedCannonStreaks);
  const after = await page.evaluate(() => window.__BATTLEFIELD_3D_VOLLEY_READABILITY_V1__.diagnostics());
  expect(after.emittedCannonStreaks).toBeGreaterThan(before.emittedCannonStreaks);
  expect(after.streaksVisible).toBeLessThanOrEqual(12);
});

test('volley readability suspends in 2D and resumes without stale visuals', async ({ page }) => {
  await enable3d(page);
  await page.evaluate(() => window.__BATTLEFIELD_3D_V1__.setEnabled(false));
  await page.waitForTimeout(180);
  const paused = await page.evaluate(() => window.__BATTLEFIELD_3D_VOLLEY_READABILITY_V1__.diagnostics());
  await page.waitForTimeout(180);
  const settled = await page.evaluate(() => window.__BATTLEFIELD_3D_VOLLEY_READABILITY_V1__.diagnostics());
  expect(settled.updates).toBe(paused.updates);
  expect(settled.skippedInactive).toBeGreaterThan(paused.skippedInactive);
  expect(settled.ribbonsVisible).toBe(0);
  expect(settled.streaksVisible).toBe(0);

  await page.evaluate(() => window.__BATTLEFIELD_3D_V1__.setEnabled(true));
  await page.waitForFunction(previous => window.__BATTLEFIELD_3D_VOLLEY_READABILITY_V1__.diagnostics().updates > previous, settled.updates);
});
