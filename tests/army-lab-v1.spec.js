const { test, expect } = require('@playwright/test');

test('start menu opens the test field, which sets up armies of any size', async ({ page }) => {
  test.setTimeout(120000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/', { waitUntil: 'load' });
  const href = await page.locator('#startLab').getAttribute('href');
  expect(new URL(href, 'http://x/').searchParams.get('lab')).toBe('1');
  await page.click('#startLab');
  await page.waitForFunction(() => window.__ARMY_LAB_V1__, null, { timeout: 60000 });
  const first = await page.evaluate(() => ({ men: units.filter(u => !u.dead).length,
    workers: units.filter(u => !u.dead && u.type === 'worker').length, peace: v05PeaceMode,
    seen: units.filter(u => !u.dead && u.side === 'britain').every(u => isVisibleToFrance(u)) }));
  expect(first.men).toBeGreaterThan(300);
  expect(first.workers).toBe(0);
  expect(first.peace).toBe(true);
  expect(first.seen).toBe(true);

  await page.click('[data-preset=enorm]');
  await page.click('[data-action=setup]');
  const big = await page.evaluate(() => ({ france: units.filter(u => !u.dead && u.side === 'france').length,
    britain: units.filter(u => !u.dead && u.side === 'britain').length,
    inWater: units.filter(u => !u.dead && waterAtV067(u.x, u.y)).length }));
  expect(big.france).toBeGreaterThan(550);
  expect(big.britain).toBe(big.france);
  expect(big.inWater).toBe(0);

  // The armies fight, and the field never ends in a victory or defeat.
  await page.click('[data-action=charge]');
  const after = await page.evaluate(() => {
    window.RTS_SIM.step(2);
    for (const u of units) if (u.side === 'britain') u.dead = true;
    for (const b of buildings) if (b.side === 'britain') b.dead = true;
    window.RTS_SIM.step(2);
    return { over: gameOver };
  });
  expect(after.over).toBe(false);

  await page.click('[data-action=clear]');
  expect(await page.evaluate(() => units.filter(u => !u.dead).length)).toBe(0);
  await page.click('[data-ai]');
  expect(await page.evaluate(() => v05PeaceMode)).toBe(false);
  expect(errors).toEqual([]);
});

test('a normal battle has no test field', async ({ page }) => {
  await page.goto('/play.html?view=iso&mode=singleplayer', { waitUntil: 'load' });
  await page.waitForFunction(() => window.RTS_SIM && typeof update === 'function');
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => Boolean(window.__ARMY_LAB_V1__) || Boolean(document.getElementById('armyLab')))).toBe(false);
});
