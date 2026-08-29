const { test, expect } = require('@playwright/test');

async function openFoundation(page) {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/?test=v071', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(
    window.NRTS?.foundationVersion === '1.0.0' &&
    window.NRTS_CONFIG?.simulation?.fixedHz === 60 &&
    window.NRTS_CONTRACTS?.BattalionState &&
    window.NRTS_LEGACY_MANIFEST?.baseline === '0.7.1' &&
    window.RTS_SIM?.version === '0.7.1'
  ));
  return pageErrors;
}

test('foundation loads before and alongside the unchanged v0.7.1 runtime', async ({ page }) => {
  const errors = await openFoundation(page);
  const snapshot = await page.evaluate(() => window.NRTS.diagnostics.snapshot());
  expect(snapshot.gameVersion).toBe('0.7.1');
  expect(snapshot.foundationVersion).toBe('1.0.0');
  expect(snapshot.subsystems.map(item => item.name)).toEqual(expect.arrayContaining([
    'config', 'contracts', 'legacy-manifest'
  ]));
  expect(errors).toEqual([]);
});

test('battalion state contract rejects impossible direct transitions', async ({ page }) => {
  await openFoundation(page);
  const result = await page.evaluate(() => ({
    roadToDeploy: window.NRTS.states.canTransition('battalion', 'ROAD_MARCH', 'DEPLOYING'),
    roadToIdle: window.NRTS.states.canTransition('battalion', 'ROAD_MARCH', 'IDLE'),
    routeToEngage: window.NRTS.states.canTransition('battalion', 'MOVING', 'ENGAGING')
  }));
  expect(result.roadToDeploy).toBe(true);
  expect(result.roadToIdle).toBe(false);
  expect(result.routeToEngage).toBe(true);
});

test('legacy stack is inventoried so patches can be retired subsystem by subsystem', async ({ page }) => {
  await openFoundation(page);
  const manifest = await page.evaluate(() => window.NRTS_LEGACY_MANIFEST);
  expect(manifest.baseline).toBe('0.7.1');
  expect(manifest.core).toContain('src/navigation.js');
  expect(manifest.legacyPatches).toContain('src/v071-motion.js');
  expect(manifest.simulationAdapters).toContain('src/v071-sim.js');
  expect(manifest.debugAdapters).toContain('src/v071-debug.js');
});
