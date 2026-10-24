const { test, expect } = require('@playwright/test');

async function openGame(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    let seed = 123456789;
    Math.random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  });
  await page.goto('/?test=iso-reset&view=iso', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__RTS_DEBUG__ && window.__AI_PRESSURE_V1__ && window.__MEDICS_V1__);
  return errors;
}

test('Nieuwe slag starts the British commander and attack clock afresh, then sends a new first wave', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await openGame(page);
  const initialCommander = await page.evaluate(() => ({ ...AI_COMMANDER_V1 }));
  const played = await page.evaluate(() => {
    while (elapsed < 190) window.__RTS_DEBUG__.tick(10);
    window.__resetTargetSearch = nearestEnemyEntity;
    window.__resetOrder = orderGroupPathV06;
    window.__resetCommander = AI_COMMANDER_V1;
    return window.__AI_PRESSURE_V1__.stats();
  });
  expect(played.waves).toBeGreaterThan(0);
  expect(played.rebalanced).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Nieuwe slag', exact: true }).click();
  const fresh = await page.evaluate(() => ({
    elapsed, pressure: window.__AI_PRESSURE_V1__.stats(), commander: { ...AI_COMMANDER_V1 },
    sameCommander: AI_COMMANDER_V1 === window.__resetCommander
  }));
  expect(fresh.elapsed).toBe(0);
  expect(fresh.sameCommander).toBe(true);
  expect(fresh.commander).toEqual(initialCommander);
  expect(fresh.pressure).toMatchObject({
    waves: 0, nextWaveAt: 150, state: 'DEFEND', rebalanced: 0, trained: 0,
    farmers: 0, sentHome: 0, heldOrders: 0, keptLines: 0, rallied: 0, log: []
  });

  const beforeFirstWave = await page.evaluate(() => {
    window.__RTS_DEBUG__.tick(140);
    return window.__AI_PRESSURE_V1__.stats();
  });
  expect(beforeFirstWave.waves).toBe(0);
  expect(beforeFirstWave.state).toBe('DEFEND');
  expect(beforeFirstWave.rebalanced).toBeGreaterThan(0);
  const nextBattle = await page.evaluate(() => {
    window.__RTS_DEBUG__.tick(50);
    return {
      pressure: window.__AI_PRESSURE_V1__.stats(),
      sameTargetSearch: nearestEnemyEntity === window.__resetTargetSearch,
      sameOrder: orderGroupPathV06 === window.__resetOrder
    };
  });
  expect(nextBattle.pressure.waves).toBeGreaterThan(0);
  expect(nextBattle.sameTargetSearch).toBe(true);
  expect(nextBattle.sameOrder).toBe(true);
  expect(errors).toEqual([]);
});

test('Nieuwe slag clears trenches and wounded installed after the reset button was bound', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await openGame(page);
  const played = await page.evaluate(() => {
    const id = window.__RTS_DEBUG__.createRegimentDirect('france');
    const reg = getRegiment(id);
    const c = centroid(regimentMembers(reg));
    arrangeFacingRegimentV146(reg, c.x, c.y, 'line', Math.PI / 2);
    selectWholeRegiment(reg);
    window.__REGIMENT_ORDERS_V1__.toggleDefend();
    window.__RTS_DEBUG__.tick(45);
    const victim = regimentMembers(reg).find(u => u.type === 'infantry' && !u.dead);
    window.__MEDICS_V1__.wound(victim);
    victim.dead = true;
    victim.hp = 0;
    return {
      trenches: window.__REGIMENT_ORDERS_V1__.trenches().length,
      wounded: window.__MEDICS_V1__.wounded().length,
      victimId: victim.id
    };
  });
  expect(played.trenches).toBeGreaterThan(0);
  expect(played.wounded).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Nieuwe slag', exact: true }).click();
  const fresh = await page.evaluate(id => ({
    trenches: window.__REGIMENT_ORDERS_V1__.trenches().length,
    wounded: window.__MEDICS_V1__.wounded().length,
    oldWound: window.__MEDICS_V1__.isWounded(id),
    elapsed
  }), played.victimId);
  expect(fresh).toEqual({ trenches: 0, wounded: 0, oldWound: false, elapsed: 0 });
  expect(errors).toEqual([]);
});

test('Nieuwe slag removes fallen soldiers from the isometric battlefield', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = await openGame(page);
  await page.waitForFunction(() => window.__ISO_VIEW_V1__?.stats().sprites > 10);
  await page.evaluate(() => {
    const u = units.find(u => !u.dead && u.side === 'france' && u.type === 'infantry');
    u.hp = 0; u.dead = true;
  });
  await page.waitForFunction(() => window.__ISO_VIEW_V1__.stats().corpses > 0);
  await page.getByRole('button', { name: 'Nieuwe slag', exact: true }).click();
  await page.waitForFunction(() => window.__ISO_VIEW_V1__.stats().sprites > 10 && window.__ISO_VIEW_V1__.stats().corpses === 0);
  expect(await page.evaluate(() => units.every(u => !u.dead))).toBe(true);
  expect(errors).toEqual([]);
});
