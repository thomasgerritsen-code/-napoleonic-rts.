const fs = require('fs');
const path = require('path');
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
    window.NRTS?.subsystems.has('movement') &&
    window.NRTS?.subsystems.has('ai-production') &&
    window.NRTS?.subsystems.has('ai-tactics') &&
    window.RTS_SIM?.version === '0.7.1'
  ));
  return pageErrors;
}

test('foundation loads around the unchanged latest v0.7.1 runtime', async ({ page }) => {
  const errors = await openFoundation(page);
  const snapshot = await page.evaluate(() => window.NRTS.diagnostics.snapshot());
  expect(snapshot.gameVersion).toBe('0.7.1');
  expect(snapshot.foundationVersion).toBe('1.0.0');
  expect(snapshot.subsystems.map(item => item.name)).toEqual(expect.arrayContaining([
    'config', 'contracts', 'legacy-manifest',
    'movement', 'formation', 'navigation', 'ai-production', 'ai-tactics', 'combat', 'simulation'
  ]));
  expect(errors).toEqual([]);
});

test('stable subsystem facades point at the final v0.7.1 implementations', async ({ page }) => {
  await openFoundation(page);
  const result = await page.evaluate(() => ({
    road: window.NRTS.subsystems.get('navigation').roadAt(1000, 900)?.road?.name || null,
    simVersion: window.RTS_SIM.version,
    hasProductionDevelop: typeof window.NRTS.subsystems.get('ai-production').develop === 'function',
    hasTacticalOrder: typeof window.NRTS.subsystems.get('ai-tactics').issueMilitaryOrder === 'function',
    infantryFieldSpeed: window.NRTS.subsystems.get('movement').terrainSpeed('infantry', 700, 1200)
  }));
  expect(result.simVersion).toBe('0.7.1');
  expect(result.hasProductionDevelop).toBe(true);
  expect(result.hasTacticalOrder).toBe(true);
  expect(result.infantryFieldSpeed).toBeGreaterThan(0);
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
  expect(manifest.baselineCommit).toBe('29b038d3655d05be968bff6a80cb8f3162f1c8e8');
  expect(manifest.core).toContain('src/navigation.js');
  expect(manifest.legacyPatches).toContain('src/v071-motion.js');
  expect(manifest.legacyPatches).toContain('src/v071-speed-hotfix.js');
  expect(manifest.simulationAdapters).toContain('src/v071-sim.js');
  expect(manifest.debugAdapters).toContain('src/v071-debug.js');
});

test('architecture guard blocks new global version patch layers after v0.7.1', async () => {
  const files = fs.readdirSync(path.join(process.cwd(), 'src'));
  const forbidden = files.filter(name => {
    const match = /^v(\d+)/i.exec(name);
    return match && Number(match[1]) > 71;
  });
  expect(forbidden).toEqual([]);
});
