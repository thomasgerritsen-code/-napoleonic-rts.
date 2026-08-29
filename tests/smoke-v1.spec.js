const { test, expect } = require('@playwright/test');

async function openGame(page) {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    let seed = 123456789;
    Math.random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  });
  await page.goto('/?test=smoke', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(
    window.RTS_VERSION === '1.0.0' &&
    window.RTS_SIM?.version === window.RTS_VERSION &&
    window.__RTS_DEBUG__?.getState &&
    window.__RTS_DEBUG__?.createFreshInfantryRegiment &&
    window.__RTS_DEBUG__?.formationState
  ));
  return pageErrors;
}

test('game boots with current version and essential UI', async ({ page }) => {
  const errors = await openGame(page);
  await expect(page).toHaveTitle('Napoleonic RTS v1.0.0');
  await expect(page.locator('.version')).toHaveText('v1.0.0');
  await expect(page.locator('#game')).toBeVisible();
  await expect(page.locator('#minimap')).toBeVisible();

  const versions = await page.evaluate(() => ({
    release: window.RTS_VERSION,
    simulation: window.RTS_SIM.version,
    foundation: window.NRTS?.gameVersion
  }));
  expect(versions).toEqual({ release: '1.0.0', simulation: '1.0.0', foundation: '1.0.0' });
  expect(errors).toEqual([]);
});

test('basic regiment command advances through the simulation', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => window.__RTS_DEBUG__.setPeaceMode?.(true));
  const regimentId = await page.evaluate(() => window.__RTS_DEBUG__.createFreshInfantryRegiment('france', 1080, 1180));
  await page.evaluate(id => window.__RTS_DEBUG__.selectRegiment(id), regimentId);

  const before = await page.evaluate(id => window.__RTS_DEBUG__.formationState(id), regimentId);
  await page.evaluate(() => window.__RTS_DEBUG__.orderSelectedWithFacing(1280, 1180, 0));
  await page.evaluate(() => window.RTS_SIM.step(0.8));
  const after = await page.evaluate(id => window.__RTS_DEBUG__.formationState(id), regimentId);

  expect(after.anchor.x).toBeGreaterThan(before.anchor.x);
  expect(after.pathLength).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
