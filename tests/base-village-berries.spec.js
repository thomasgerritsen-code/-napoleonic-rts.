const { test, expect } = require('@playwright/test');

async function readBerryAccess(page) {
  return page.evaluate(() => {
    const ecology = window.__BATTLEFIELD_ECOLOGY_V1__;
    const natural = window.__NATURAL_RESOURCES_V1__;
    const local = resources.filter(r => !r.dead && r.type === 'food' && r.localVillageBerry === true);
    const frenchLocal = local.filter(r => r.homeSide === 'france');
    const visibleFrench = frenchLocal.filter(r => {
      const p = worldToScreen(r.x, r.y);
      return p.x >= 0 && p.x <= innerWidth && p.y >= 0 && p.y <= innerHeight;
    });
    return {
      version: ecology?.version || null,
      enabled: ecology?.berryVillageAccess === true,
      exclusion: ecology?.berryVillageExclusion,
      min: ecology?.baseVillageBerryMin || 0,
      villageRadius: ecology?.baseVillageBerryRadius || 0,
      townRadius: ecology?.baseVillageBerryTownRadius || 0,
      startRadius: ecology?.baseVillageBerryStartRadius || 0,
      stats: ecology?.baseVillageBerryStats?.() || [],
      localTaggedCount: local.length,
      visibleFrenchCount: visibleFrench.length,
      render: natural?.diagnostics?.() || null,
      renderVersion: natural?.version || null,
      explicit2DPass: natural?.explicitLocalBerry2DPass === true
    };
  });
}

function expectSafeLocalBerries(state) {
  expect(state.enabled).toBe(true);
  expect(state.exclusion).toBe(true);
  expect(state.stats).toHaveLength(2);
  expect(state.localTaggedCount).toBeGreaterThanOrEqual(state.min * 2);
  for (const base of state.stats) {
    expect(base.count).toBeGreaterThanOrEqual(state.min);
    expect(base.maxTownDistance).not.toBeNull();
    expect(base.maxTownDistance).toBeLessThanOrEqual(state.townRadius + 0.01);
    if (base.maxVillageDistance !== null) {
      expect(base.maxVillageDistance).toBeLessThanOrEqual(state.villageRadius + 0.01);
    }
    expect(base.roadConflicts).toBe(0);
    expect(base.buildingConflicts).toBe(0);
    expect(base.houseConflicts).toBe(0);
  }
  expect(state.visibleFrenchCount).toBeGreaterThanOrEqual(3);
  expect(state.renderVersion).toContain('local-berry-2d-overlay');
  expect(state.explicit2DPass).toBe(true);
  expect(state.render?.localVillageBerryDraws || 0).toBeGreaterThan(0);
  expect(state.render?.localOverlayFrames || 0).toBeGreaterThan(0);
}

test('both starting bases get explicit nearby berry bushes that are visible in the 2D mobile start view', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 840 });
  await page.goto('/?test');
  await page.waitForFunction(() => window.__BATTLEFIELD_ECOLOGY_V1__?.baseVillageBerryStats && window.__NATURAL_RESOURCES_V1__?.diagnostics);
  await page.waitForFunction(() => window.__NATURAL_RESOURCES_V1__.diagnostics().localVillageBerryDraws > 0);

  const initial = await readBerryAccess(page);
  expect(initial.version).toContain('base-berries-near-town');
  expectSafeLocalBerries(initial);

  await page.locator('#resetBtn').click();
  await page.waitForTimeout(120);

  const afterReset = await readBerryAccess(page);
  expectSafeLocalBerries(afterReset);
});
