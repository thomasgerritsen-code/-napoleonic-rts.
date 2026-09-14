const { test, expect } = require('@playwright/test');

async function enable3d(page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_V1__);
  await page.evaluate(() => window.__BATTLEFIELD_3D_V1__.setEnabled(true));
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_SALVO_POLISH_V1__?.diagnostics().updates > 0);
}

test('3D salvo polish is pooled, near-LOD only and attached to the scene', async ({ page }) => {
  await enable3d(page);
  const state = await page.evaluate(() => {
    const api = window.__BATTLEFIELD_3D_SALVO_POLISH_V1__;
    const group = window.__NRTS_THREE_SCENE_HOOK_V1__.scene().getObjectByName('napoleonic-salvo-polish-v1');
    return {
      version: api.version,
      maxHaze: api.maxHaze,
      maxShock: api.maxShock,
      farCameraY: api.farCameraY,
      effectRadius: api.effectRadius,
      effects: api.effects,
      performanceModel: api.performanceModel,
      attached: Boolean(group),
      childCount: group?.children?.length || 0,
      diagnostics: api.diagnostics()
    };
  });
  expect(state.version).toBe('battlefield-3d-salvo-polish-v1');
  expect(state.maxHaze).toBeLessThanOrEqual(48);
  expect(state.maxShock).toBeLessThanOrEqual(16);
  expect(state.farCameraY).toBeGreaterThan(0);
  expect(state.effectRadius).toBeLessThanOrEqual(1000);
  expect(state.effects).toEqual(expect.arrayContaining([
    'lateral-volley-haze',
    'artillery-ground-dust',
    'artillery-shock-ring'
  ]));
  expect(state.performanceModel).toBe('fixed-pool-near-lod-instanced-salvo-accents');
  expect(state.attached).toBe(true);
  expect(state.childCount).toBe(2);
  expect(state.diagnostics.active).toBe(true);
});

test('musket fire builds a lateral near-field haze without changing simulation authority', async ({ page }) => {
  await enable3d(page);
  const before = await page.evaluate(() => window.__BATTLEFIELD_3D_SALVO_POLISH_V1__.diagnostics());
  const marked = await page.evaluate(() => {
    const snapshot = window.NRTS_3D_SOURCE.snapshot();
    const camera = window.NRTS_3D_SOURCE.camera();
    const unit = snapshot.units.find(item => item.type === 'infantry' && !item.dead);
    if (!unit || !Number.isFinite(camera?.x) || !Number.isFinite(camera?.y)) return false;
    unit.x = camera.x;
    unit.y = camera.y;
    unit.combatVisualV1 = { kind: 'musket-fire', started: snapshot.elapsed + 0.002, duration: 1.0 };
    return true;
  });
  expect(marked).toBe(true);
  await page.waitForFunction(previous => {
    const d = window.__BATTLEFIELD_3D_SALVO_POLISH_V1__.diagnostics();
    return d.emittedVolleyHaze >= previous + 3;
  }, before.emittedVolleyHaze);
  const after = await page.evaluate(() => window.__BATTLEFIELD_3D_SALVO_POLISH_V1__.diagnostics());
  expect(after.emittedVolleyHaze).toBeGreaterThanOrEqual(before.emittedVolleyHaze + 3);
  expect(after.hazeVisible).toBeGreaterThan(0);
});

test('artillery fire adds ground dust and a short shock ring within fixed caps', async ({ page }) => {
  await enable3d(page);
  const before = await page.evaluate(() => window.__BATTLEFIELD_3D_SALVO_POLISH_V1__.diagnostics());
  const marked = await page.evaluate(() => {
    const snapshot = window.NRTS_3D_SOURCE.snapshot();
    const camera = window.NRTS_3D_SOURCE.camera();
    const unit = snapshot.units.find(item => item.type === 'artillery' && !item.dead);
    if (!unit || !Number.isFinite(camera?.x) || !Number.isFinite(camera?.y)) return false;
    unit.x = camera.x;
    unit.y = camera.y;
    unit.combatVisualV1 = { kind: 'artillery-fire', started: snapshot.elapsed + 0.003, duration: 1.0 };
    return true;
  });
  expect(marked).toBe(true);
  await page.waitForFunction(previous => {
    const d = window.__BATTLEFIELD_3D_SALVO_POLISH_V1__.diagnostics();
    return d.emittedArtilleryDust >= previous.dust + 2 && d.emittedShockRings > previous.shock;
  }, { dust: before.emittedArtilleryDust, shock: before.emittedShockRings });
  const after = await page.evaluate(() => window.__BATTLEFIELD_3D_SALVO_POLISH_V1__.diagnostics());
  expect(after.emittedArtilleryDust).toBeGreaterThanOrEqual(before.emittedArtilleryDust + 2);
  expect(after.emittedShockRings).toBeGreaterThan(before.emittedShockRings);
  expect(after.hazeVisible).toBeLessThanOrEqual(48);
  expect(after.shockVisible).toBeLessThanOrEqual(16);
});

test('salvo polish suspends in 2D and resumes cleanly', async ({ page }) => {
  await enable3d(page);
  await page.evaluate(() => window.__BATTLEFIELD_3D_V1__.setEnabled(false));
  await page.waitForTimeout(180);
  const paused = await page.evaluate(() => window.__BATTLEFIELD_3D_SALVO_POLISH_V1__.diagnostics());
  await page.waitForTimeout(180);
  const settled = await page.evaluate(() => window.__BATTLEFIELD_3D_SALVO_POLISH_V1__.diagnostics());
  expect(settled.updates).toBe(paused.updates);
  expect(settled.skippedInactive).toBeGreaterThan(paused.skippedInactive);
  expect(settled.hazeVisible).toBe(0);
  expect(settled.shockVisible).toBe(0);

  await page.evaluate(() => window.__BATTLEFIELD_3D_V1__.setEnabled(true));
  await page.waitForFunction(previous => window.__BATTLEFIELD_3D_SALVO_POLISH_V1__.diagnostics().updates > previous, settled.updates);
});
