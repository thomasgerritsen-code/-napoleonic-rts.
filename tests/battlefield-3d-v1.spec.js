const { test, expect } = require('@playwright/test');

test('3D battlefield renderer consumes live simulation without replacing gameplay', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/?test=3d', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.NRTS_3D_SOURCE && !!window.__BATTLEFIELD_3D_BRIDGE_V1__);
  await page.waitForFunction(() => !!window.__BATTLEFIELD_3D_V1__, null, { timeout: 20000 });
  await page.waitForTimeout(250);

  const state = await page.evaluate(() => {
    const world = window.NRTS_3D_SOURCE.staticWorld();
    const snapshot = window.NRTS_3D_SOURCE.snapshot();
    const diagnostics = window.__BATTLEFIELD_3D_V1__.diagnostics();
    const audit = window.RTS_SIM.audit();
    const button = document.getElementById('renderModeBtn');
    const canvas = document.getElementById('battlefield3d');
    return {
      bridgeRegistered: window.NRTS.subsystems.has('battlefield-3d-bridge-v1'),
      world,
      snapshotUnits: snapshot.units.length,
      snapshotBuildings: snapshot.buildings.length,
      diagnostics,
      auditOk: audit.ok,
      buttonText: button?.textContent || '',
      canvasExists: !!canvas,
      canvasWidth: canvas?.width || 0,
      canvasHeight: canvas?.height || 0
    };
  });

  expect(state.bridgeRegistered).toBe(true);
  expect(state.world.world.width).toBeGreaterThan(3200);
  expect(state.world.world.height).toBeGreaterThan(1850);
  expect(state.world.roads.length).toBeGreaterThan(2);
  expect(state.snapshotUnits).toBeGreaterThan(20);
  expect(state.snapshotBuildings).toBeGreaterThanOrEqual(2);
  expect(state.diagnostics.renderer).toBeUndefined();
  expect(state.diagnostics.roads).toBe(state.world.roads.length);
  expect(state.diagnostics.unitMeshes).toBeGreaterThan(0);
  expect(state.auditOk).toBe(true);
  expect(state.canvasExists).toBe(true);
  expect(state.canvasWidth).toBeGreaterThan(0);
  expect(state.canvasHeight).toBeGreaterThan(0);
  expect(state.buttonText).toContain('3D');

  const toggle = await page.evaluate(() => {
    window.__BATTLEFIELD_3D_V1__.setEnabled(false);
    const hidden = document.getElementById('battlefield3d').classList.contains('hidden');
    window.__BATTLEFIELD_3D_V1__.setEnabled(true);
    return {
      hidden,
      enabledAgain: window.__BATTLEFIELD_3D_V1__.enabled(),
      visibleAgain: !document.getElementById('battlefield3d').classList.contains('hidden')
    };
  });

  expect(toggle.hidden).toBe(true);
  expect(toggle.enabledAgain).toBe(true);
  expect(toggle.visibleAgain).toBe(true);
  expect(pageErrors).toEqual([]);
});
