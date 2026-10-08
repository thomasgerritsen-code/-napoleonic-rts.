const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/?test=v071', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__OBJECTIVES_SCENARIOS_V1__ && window.__RTS_DEBUG__));
  await page.evaluate(() => window.__RTS_DEBUG__.setPeaceMode(true));
});

test('objective scenarios remain available, but points are not the win condition', async ({ page }) => {
  const result = await page.evaluate(() => ({
    registered: NRTS.subsystems.has('objectives-scenarios'),
    presets: [...__OBJECTIVES_SCENARIOS_V1__.presets],
    points: __OBJECTIVES_SCENARIOS_V1__.state().points.length
  }));
  expect(result.registered).toBe(true);
  expect(result.presets).toEqual(expect.arrayContaining(['crossroads', 'bridge', 'threePoints']));
  expect(result.points).toBeGreaterThan(0);
});

test('destroying the enemy headquarters alone does not end the battle', async ({ page }) => {
  const result = await page.evaluate(() => {
    const headquarters = buildings.find(b => b.side === 'britain' && b.type === 'towncenter');
    headquarters.dead = true;
    headquarters.hp = 0;
    __RTS_DEBUG__.tick(0.05);
    return { over: gameOver, enemyTroops: livingUnits('britain').filter(u => u.type !== 'worker').length };
  });
  expect(result.enemyTroops).toBeGreaterThan(0);
  expect(result.over).toBe(false);
});

test('eliminating the enemy army alone does not end the battle', async ({ page }) => {
  const result = await page.evaluate(() => {
    units.filter(u => u.side === 'britain' && u.type !== 'worker').forEach(u => { u.dead = true; });
    __RTS_DEBUG__.tick(0.05);
    return {
      over: gameOver,
      enemyHeadquartersAlive: livingBuildings('britain').some(b => b.type === 'towncenter'),
      enemyTroops: livingUnits('britain').filter(u => u.type !== 'worker').length
    };
  });
  expect(result.enemyTroops).toBe(0);
  expect(result.enemyHeadquartersAlive).toBe(true);
  expect(result.over).toBe(false);
});

test('France wins only when British headquarters and all fighting troops are gone', async ({ page }) => {
  const result = await page.evaluate(() => {
    const headquarters = buildings.find(b => b.side === 'britain' && b.type === 'towncenter');
    headquarters.dead = true;
    headquarters.hp = 0;
    units.filter(u => u.side === 'britain' && u.type !== 'worker').forEach(u => { u.dead = true; });
    const workersAlive = livingUnits('britain').filter(u => u.type === 'worker').length;
    __RTS_DEBUG__.tick(0.05);
    return { over: gameOver, message: messageEl.textContent, workersAlive };
  });
  expect(result.workersAlive).toBeGreaterThan(0);
  expect(result.over).toBe(true);
  expect(result.message).toContain('FRANSE OVERWINNING');
});

test('Britain can also win, and new battle resets the victory state', async ({ page }) => {
  const result = await page.evaluate(() => {
    const headquarters = buildings.find(b => b.side === 'france' && b.type === 'towncenter');
    headquarters.dead = true;
    headquarters.hp = 0;
    units.filter(u => u.side === 'france' && u.type !== 'worker').forEach(u => { u.dead = true; });
    __RTS_DEBUG__.tick(0.05);
    const victory = { over: gameOver, message: messageEl.textContent };
    resetGame();
    return {
      victory,
      afterReset: {
        over: gameOver,
        bannerHidden: messageEl.classList.contains('hidden'),
        headquarters: livingBuildings('france').filter(b => b.type === 'towncenter').length,
        troops: livingUnits('france').filter(u => u.type !== 'worker').length
      }
    };
  });
  expect(result.victory.over).toBe(true);
  expect(result.victory.message).toContain('BRITSE OVERWINNING');
  expect(result.afterReset.over).toBe(false);
  expect(result.afterReset.bannerHidden).toBe(true);
  expect(result.afterReset.headquarters).toBe(1);
  expect(result.afterReset.troops).toBeGreaterThan(0);
});

test('capture points passing the old score threshold cannot end the battle', async ({ page }) => {
  test.setTimeout(60_000);
  const result = await page.evaluate(() => {
    const center = __OBJECTIVES_SCENARIOS_V1__.state().points[0];
    // The British army is gone, but the British headquarters remains standing.
    units.filter(u => u.side === 'britain' && u.type !== 'worker').forEach(u => { u.dead = true; });
    for (const u of livingUnits('france').filter(u => u.type !== 'worker')) {
      u.x = center.x; u.y = center.y;
      u.targetX = center.x; u.targetY = center.y;
    }
    __RTS_DEBUG__.tick(125);
    return {
      score: __OBJECTIVES_SCENARIOS_V1__.state().france,
      oldTarget: __OBJECTIVES_SCENARIOS_V1__.state().target,
      enemyHeadquartersAlive: livingBuildings('britain').some(b => b.type === 'towncenter'),
      gameOver
    };
  });
  expect(result.score).toBeGreaterThanOrEqual(result.oldTarget);
  expect(result.enemyHeadquartersAlive).toBe(true);
  expect(result.gameOver).toBe(false);
});
