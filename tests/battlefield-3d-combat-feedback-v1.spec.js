const { test, expect } = require('@playwright/test');

test('3D combat feedback loads with hard pooled caps and distance LOD', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_V1__);
  await page.evaluate(() => window.__BATTLEFIELD_3D_V1__.setEnabled(true));
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_COMBAT_FEEDBACK_V1__ && window.__NRTS_THREE_SCENE_HOOK_V1__?.scene?.());
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_COMBAT_FEEDBACK_V1__.diagnostics().updates > 0);

  const state = await page.evaluate(() => {
    const api = window.__BATTLEFIELD_3D_COMBAT_FEEDBACK_V1__;
    const group = window.__NRTS_THREE_SCENE_HOOK_V1__.scene().getObjectByName('napoleonic-combat-feedback-v1');
    return {
      version: api.version,
      maxSmoke: api.maxSmoke,
      maxFlash: api.maxFlash,
      farLodCameraY: api.farLodCameraY,
      ultraFarLodCameraY: api.ultraFarLodCameraY,
      nearEffectRadius: api.nearEffectRadius,
      farEffectRadius: api.farEffectRadius,
      effects: api.effects,
      performanceModel: api.performanceModel,
      attached: Boolean(group),
      childCount: group?.children?.length || 0,
      diagnostics: api.diagnostics()
    };
  });

  expect(state.version).toBe('battlefield-3d-combat-feedback-v1');
  expect(state.maxSmoke).toBeLessThanOrEqual(96);
  expect(state.maxFlash).toBeLessThanOrEqual(48);
  expect(state.ultraFarLodCameraY).toBeGreaterThan(state.farLodCameraY);
  expect(state.nearEffectRadius).toBeGreaterThan(0);
  expect(state.farEffectRadius).toBeGreaterThan(state.nearEffectRadius);
  expect(state.effects).toEqual(expect.arrayContaining([
    'directional-musket-muzzle-flash',
    'musket-smoke',
    'directional-artillery-muzzle-flash',
    'layered-artillery-smoke'
  ]));
  expect(state.performanceModel).toBe('fixed-pool-instanced-effects-with-distance-culling-and-lod');
  expect(state.attached).toBe(true);
  expect(state.childCount).toBe(2);
  expect(state.diagnostics.active).toBe(true);
});

test('3D combat feedback reacts to live fire markers without changing simulation authority', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_V1__);
  await page.evaluate(() => window.__BATTLEFIELD_3D_V1__.setEnabled(true));
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_COMBAT_FEEDBACK_V1__?.diagnostics().updates > 0);

  const before = await page.evaluate(() => window.__BATTLEFIELD_3D_COMBAT_FEEDBACK_V1__.diagnostics());
  const marked = await page.evaluate(() => {
    const snapshot = window.NRTS_3D_SOURCE.snapshot();
    const unit = snapshot.units.find(item => item.type === 'infantry' && !item.dead);
    if (!unit) return false;
    unit.combatVisualV1 = { kind: 'musket-fire', started: snapshot.elapsed, duration: 1.0 };
    return true;
  });
  expect(marked).toBe(true);

  await page.waitForFunction(previous => {
    const d = window.__BATTLEFIELD_3D_COMBAT_FEEDBACK_V1__.diagnostics();
    return d.emittedMusket > previous;
  }, before.emittedMusket);

  const after = await page.evaluate(() => window.__BATTLEFIELD_3D_COMBAT_FEEDBACK_V1__.diagnostics());
  expect(after.emittedMusket).toBeGreaterThan(before.emittedMusket);
  expect(after.smokeVisible).toBeGreaterThan(0);
});

test('3D combat feedback distance-culls fire markers outside the visual budget', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_V1__);
  await page.evaluate(() => window.__BATTLEFIELD_3D_V1__.setEnabled(true));
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_COMBAT_FEEDBACK_V1__?.diagnostics().updates > 0);

  const before = await page.evaluate(() => window.__BATTLEFIELD_3D_COMBAT_FEEDBACK_V1__.diagnostics());
  const marked = await page.evaluate(() => {
    const snapshot = window.NRTS_3D_SOURCE.snapshot();
    const unit = snapshot.units.find(item => item.type === 'infantry' && !item.dead);
    const camera = window.__NRTS_THREE_SCENE_HOOK_V1__?.camera?.();
    if (!unit || !camera) return false;
    unit.x = camera.position.x + 5000;
    unit.y = camera.position.z + 5000;
    unit.combatVisualV1 = { kind: 'musket-fire', started: snapshot.elapsed + 0.001, duration: 1.0 };
    return true;
  });
  expect(marked).toBe(true);

  await page.waitForFunction(previous => {
    return window.__BATTLEFIELD_3D_COMBAT_FEEDBACK_V1__.diagnostics().culledByDistance > previous;
  }, before.culledByDistance);

  const after = await page.evaluate(() => window.__BATTLEFIELD_3D_COMBAT_FEEDBACK_V1__.diagnostics());
  expect(after.culledByDistance).toBeGreaterThan(before.culledByDistance);
});

test('3D combat feedback stops work in 2D mode and resumes in 3D', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_V1__);
  await page.evaluate(() => window.__BATTLEFIELD_3D_V1__.setEnabled(true));
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_COMBAT_FEEDBACK_V1__?.diagnostics().updates > 0);

  await page.evaluate(() => window.__BATTLEFIELD_3D_V1__.setEnabled(false));
  await page.waitForTimeout(180);
  const paused = await page.evaluate(() => window.__BATTLEFIELD_3D_COMBAT_FEEDBACK_V1__.diagnostics());
  await page.waitForTimeout(180);
  const settled = await page.evaluate(() => window.__BATTLEFIELD_3D_COMBAT_FEEDBACK_V1__.diagnostics());

  expect(settled.updates).toBe(paused.updates);
  expect(settled.skippedInactive).toBeGreaterThan(paused.skippedInactive);
  expect(settled.smokeVisible).toBe(0);
  expect(settled.flashVisible).toBe(0);

  await page.evaluate(() => window.__BATTLEFIELD_3D_V1__.setEnabled(true));
  await page.waitForFunction(previous => window.__BATTLEFIELD_3D_COMBAT_FEEDBACK_V1__.diagnostics().updates > previous, settled.updates);
  const resumed = await page.evaluate(() => window.__BATTLEFIELD_3D_COMBAT_FEEDBACK_V1__.diagnostics());
  expect(resumed.updates).toBeGreaterThan(settled.updates);
});
