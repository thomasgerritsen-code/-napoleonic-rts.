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
    window.RTS_VERSION &&
    window.RTS_SIM?.version === window.RTS_VERSION &&
    window.NRTS?.gameVersion === window.RTS_VERSION &&
    window.NRTS?.foundationVersion === window.RTS_VERSION &&
    window.__RTS_DEBUG__?.getState &&
    window.__RTS_DEBUG__?.createFreshInfantryRegiment &&
    window.__RTS_DEBUG__?.formationState
  ));
  return pageErrors;
}

test('game boots with current version and essential UI', async ({ page }) => {
  const errors = await openGame(page);
  const release = await page.evaluate(() => window.RTS_VERSION);
  await expect(page).toHaveTitle(`Napoleonic RTS v${release}`);
  await expect(page.locator('.version')).toHaveText(`v${release}`);
  await expect(page.locator('#game')).toBeVisible();
  await expect(page.locator('#minimap')).toBeVisible();
  await expect(page.locator('.help')).toContainText('Klik groepslid: selecteer hele groep');
  await expect(page.locator('.help')).toContainText('Rechtsklik: lopen of verzamelen');
  await expect(page.locator('.help')).toContainText('Shift+slepen: toevoegen');
  await expect(page.locator('.help')).toContainText('Muiswiel: in-/uitzoomen');
  await expect(page.locator('.help')).toContainText('WASD / pijltjes: camera');

  const barracksAction = page.locator('[data-action="build-barracks"]');
  const houseAction = page.locator('[data-action="build-house"]');
  await expect(barracksAction).toContainText('Kazerne');
  await expect(barracksAction).toContainText('300 🪵');
  await expect(houseAction).toContainText('Woning');
  await expect(houseAction).toContainText('120 🪵');

  const beforeFocus = await barracksAction.boundingBox();
  await barracksAction.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(barracksAction).toBeFocused();
  const focusRing = await barracksAction.evaluate(button => {
    const style = getComputedStyle(button);
    return { style: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor };
  });
  expect(focusRing).toEqual({ style: 'solid', width: '2px', color: 'rgb(244, 216, 109)' });
  expect(await barracksAction.boundingBox()).toEqual(beforeFocus);

  const versions = await page.evaluate(() => ({
    release: window.RTS_VERSION,
    simulation: window.RTS_SIM.version,
    foundation: window.NRTS?.gameVersion,
    foundationRuntime: window.NRTS?.foundationVersion
  }));
  expect(versions.simulation).toBe(versions.release);
  expect(versions.foundation).toBe(versions.release);
  expect(versions.foundationRuntime).toBe(versions.release);
  expect(errors).toEqual([]);
});

test('basic regiment command is accepted by the simulation', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => window.__RTS_DEBUG__.setPeaceMode?.(true));
  const regimentId = await page.evaluate(() => window.__RTS_DEBUG__.createFreshInfantryRegiment('france', 1080, 1180));
  await page.evaluate(id => window.__RTS_DEBUG__.selectRegiment(id), regimentId);
  await page.evaluate(() => window.__RTS_DEBUG__.orderSelectedWithFacing(1280, 1180, 0));

  const ordered = await page.evaluate(id => window.__RTS_DEBUG__.formationState(id), regimentId);
  expect(ordered).toBeTruthy();
  expect(ordered.pathLength).toBeGreaterThan(0);
  expect(Math.abs(ordered.finalFacing)).toBeLessThan(0.1);

  await page.evaluate(() => window.RTS_SIM.step(0.2));
  const afterStep = await page.evaluate(id => window.__RTS_DEBUG__.formationState(id), regimentId);
  expect(afterStep).toBeTruthy();
  expect(errors).toEqual([]);
});
