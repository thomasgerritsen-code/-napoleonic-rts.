const { test, expect } = require('@playwright/test');

async function openGame(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?test=v071', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__RTS_DEBUG__?.createFreshInfantryRegiment && window.__AI_FRONT_RESERVE_V143__));
  await page.evaluate(() => window.__RTS_DEBUG__.setPeaceMode(true));
  return errors;
}

test('front reserve layer selects the freshest available regiment', async ({ page }) => {
  const errors = await openGame(page);
  const result = await page.evaluate(() => {
    const ids = [
      window.__RTS_DEBUG__.createFreshInfantryRegiment('britain', 2300, 720),
      window.__RTS_DEBUG__.createFreshInfantryRegiment('britain', 2300, 900),
      window.__RTS_DEBUG__.createFreshInfantryRegiment('britain', 2300, 1080)
    ];
    const regs = ids.map(id => getRegiment(id));
    regimentMembers(regs[0]).forEach(u => { u.hp = u.maxHp * .72; u.morale = 70; });
    regimentMembers(regs[1]).forEach(u => { u.hp = u.maxHp * .55; u.morale = 58; });
    regimentMembers(regs[2]).forEach(u => { u.hp = u.maxHp; u.morale = 100; });
    const reserve = window.__AI_FRONT_RESERVE_V143__.chooseFreshReserve(regs);
    return { reserveId: reserve?.id, expectedId: regs[2].id, stats: window.__AI_FRONT_RESERVE_V143__.stats() };
  });

  expect(result.reserveId).toBe(result.expectedId);
  expect(result.stats.reserveSelections).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('front slot ordering follows current lateral deployment instead of regiment array order', async ({ page }) => {
  const errors = await openGame(page);
  const result = await page.evaluate(() => {
    const ids = [
      window.__RTS_DEBUG__.createFreshInfantryRegiment('britain', 2250, 1080),
      window.__RTS_DEBUG__.createFreshInfantryRegiment('britain', 2250, 720),
      window.__RTS_DEBUG__.createFreshInfantryRegiment('britain', 2250, 900)
    ];
    const regs = ids.map(id => getRegiment(id));
    const ordered = window.__AI_FRONT_RESERVE_V143__.stableFrontOrder(regs, { x: 1600, y: 900 }, { x: -1, y: 0, angle: Math.PI });
    return {
      orderedY: ordered.map(reg => aiRegCenter(reg).y),
      stats: window.__AI_FRONT_RESERVE_V143__.stats()
    };
  });

  expect(result.orderedY.length).toBe(3);
  expect(result.orderedY[0]).toBeGreaterThan(result.orderedY[1]);
  expect(result.orderedY[1]).toBeGreaterThan(result.orderedY[2]);
  expect(result.stats.orderedFronts).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('attack reserve shadows the weakest front sector and closes distance under pressure', async ({ page }) => {
  const errors = await openGame(page);
  const result = await page.evaluate(() => {
    gameOver = false;
    const ids = [
      window.__RTS_DEBUG__.createFreshInfantryRegiment('britain', 2320, 740),
      window.__RTS_DEBUG__.createFreshInfantryRegiment('britain', 2320, 900),
      window.__RTS_DEBUG__.createFreshInfantryRegiment('britain', 2320, 1060)
    ];
    const regs = ids.map(id => getRegiment(id));
    regimentMembers(regs[0]).forEach(u => { u.hp = u.maxHp * .38; u.morale = 35; });
    regimentMembers(regs[1]).forEach(u => { u.hp = u.maxHp * .78; u.morale = 80; });
    regimentMembers(regs[2]).forEach(u => { u.hp = u.maxHp; u.morale = 100; });
    const tc = livingBuildings('britain').find(b => b.type === 'towncenter' && b.complete);
    const target = { x: 1500, y: 900 };
    aiAttack(regs, tc, target);
    const stats = window.__AI_FRONT_RESERVE_V143__.stats();
    const diag = window.NRTS.diagnostics.snapshot().subsystems.find(s => s.name === 'ai-front-reserve-v143');
    return {
      stats,
      weakestId: regs[0].id,
      reserveId: regs[2].id,
      diag,
      config: window.__AI_FRONT_RESERVE_V143__.config
    };
  });

  expect(result.stats.lastReserveId).toBe(result.reserveId);
  expect(result.stats.lastWeakFrontId).toBe(result.weakestId);
  expect(result.stats.lastWeakFrontCondition).toBeLessThan(result.config.weakFrontThreshold);
  expect(result.stats.reserveSupports).toBeGreaterThanOrEqual(1);
  expect(result.stats.pressuredSupports).toBeGreaterThanOrEqual(1);
  expect(result.diag?.meta?.phase).toBe('gameplay-v143');
  expect(errors).toEqual([]);
});
