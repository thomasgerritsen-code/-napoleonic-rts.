const { test, expect } = require('@playwright/test');

async function readBerryAccess(page) {
  return page.evaluate(() => {
    const ecology = window.__BATTLEFIELD_ECOLOGY_V1__;
    return {
      version: ecology?.version || null,
      enabled: ecology?.berryVillageAccess === true,
      exclusion: ecology?.berryVillageExclusion,
      min: ecology?.baseVillageBerryMin || 0,
      radius: ecology?.baseVillageBerryRadius || 0,
      townRadius: ecology?.baseVillageBerryTownRadius || 0,
      stats: ecology?.baseVillageBerryStats?.() || []
    };
  });
}

function expectSafeLocalBerries(state) {
  expect(state.enabled).toBe(true);
  expect(state.exclusion).toBe(false);
  expect(state.stats).toHaveLength(2);
  for (const base of state.stats) {
    expect(base.count).toBeGreaterThanOrEqual(state.min);
    expect(base.maxVillageDistance).not.toBeNull();
    expect(base.maxTownDistance).not.toBeNull();
    expect(base.maxVillageDistance).toBeLessThanOrEqual(state.radius + 0.01);
    expect(base.maxTownDistance).toBeLessThanOrEqual(state.townRadius + 0.01);
  }
}

test('both starting bases keep safe berry bushes close to their linked village', async ({ page }) => {
  await page.goto('/?test');
  await page.waitForFunction(() => window.__BATTLEFIELD_ECOLOGY_V1__?.baseVillageBerryStats);

  const initial = await readBerryAccess(page);
  expect(initial.version).toContain('base-village-berries');
  expectSafeLocalBerries(initial);

  await page.locator('#resetBtn').click();
  await page.waitForTimeout(50);

  const afterReset = await readBerryAccess(page);
  expectSafeLocalBerries(afterReset);
});
