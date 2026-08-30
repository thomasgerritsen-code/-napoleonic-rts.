const { test, expect } = require('@playwright/test');

test('Architecture V2.1 centralizes world tuning and exposes stable services', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/?test=architecture-v21', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(
    window.NRTS_CONFIG?.architecture?.version === '2.1' &&
    window.NRTS?.services?.has('world') &&
    window.NRTS?.services?.has('navigation') &&
    window.NRTS?.services?.has('movement') &&
    window.NRTS?.services?.has('formation') &&
    window.__VILLAGE_NAVIGATION_V7__
  ));

  const result = await page.evaluate(() => {
    const world = window.NRTS.services.require('world');
    const navigation = window.NRTS.services.require('navigation');
    const movement = window.NRTS.services.require('movement');
    const formation = window.NRTS.services.require('formation');
    const config = window.NRTS_CONFIG;
    const worldSnapshot = world.snapshot();
    const diagnostic = window.NRTS.diagnostics.snapshot();
    let rejectedLegacyTakeover = false;
    try {
      window.NRTS.services.provide('world', 'legacy-test-owner', Object.freeze({}), { generation: 1 });
    } catch (_) {
      rejectedLegacyTakeover = true;
    }
    return {
      architectureVersion: config.architecture.version,
      serviceGeneration: config.architecture.serviceGeneration,
      configuredWorld: config.world.battlefield,
      configuredScale: config.world.village.structureScale,
      actualWorld: world.size(),
      worldSnapshot,
      worldOwner: window.NRTS.services.owner('world'),
      worldGeneration: window.NRTS.services.generation('world'),
      navigationOwner: window.NRTS.services.owner('navigation'),
      movementOwner: window.NRTS.services.owner('movement'),
      formationOwner: window.NRTS.services.owner('formation'),
      navigationHasVillageAvoidance: navigation.villageAvoidance()?.version === 'village-navigation-v7',
      navigationHasRoadLookup: typeof navigation.roadAt === 'function' && typeof navigation.nearestRoadPoint === 'function',
      navigationHasWaterLookup: typeof navigation.waterAt === 'function' && typeof navigation.crossingAt === 'function',
      movementCanOrder: typeof movement.orderBattalion === 'function',
      movementFieldSpeed: movement.terrainSpeed('infantry', 700, 1200),
      formationCanArrange: typeof formation.arrangeBattalion === 'function' && typeof formation.members === 'function',
      rejectedLegacyTakeover,
      worldOwnerAfterRejectedTakeover: window.NRTS.services.owner('world'),
      diagnosticServiceNames: diagnostic.services.map(item => item.name),
      pageSubsystemWorld: window.NRTS.subsystems.has('world')
    };
  });

  expect(result.architectureVersion).toBe('2.1');
  expect(result.serviceGeneration).toBe(21);
  expect(result.actualWorld).toEqual(result.configuredWorld);
  expect(result.worldSnapshot.width).toBe(result.configuredWorld.width);
  expect(result.worldSnapshot.height).toBe(result.configuredWorld.height);
  expect(result.worldSnapshot.structureScale).toBe(result.configuredScale);
  expect(result.worldOwner).toBe('src/systems/world/api.js');
  expect(result.worldGeneration).toBe(21);
  expect(result.navigationOwner).toBe('src/systems/navigation/api.js');
  expect(result.movementOwner).toBe('src/systems/movement/api.js');
  expect(result.formationOwner).toBe('src/systems/formation');
  expect(result.navigationHasVillageAvoidance).toBe(true);
  expect(result.navigationHasRoadLookup).toBe(true);
  expect(result.navigationHasWaterLookup).toBe(true);
  expect(result.movementCanOrder).toBe(true);
  expect(result.movementFieldSpeed).toBeGreaterThan(0);
  expect(result.formationCanArrange).toBe(true);
  expect(result.rejectedLegacyTakeover).toBe(true);
  expect(result.worldOwnerAfterRejectedTakeover).toBe('src/systems/world/api.js');
  expect(result.diagnosticServiceNames).toEqual(expect.arrayContaining(['world','navigation','movement','formation']));
  expect(result.pageSubsystemWorld).toBe(true);
  expect(pageErrors).toEqual([]);
});
