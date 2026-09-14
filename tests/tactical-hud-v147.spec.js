const { test, expect } = require('@playwright/test');

async function prepare(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?test=v071', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__RTS_DEBUG__?.createFreshInfantryRegiment));
  await page.waitForFunction(() => Boolean(window.__TACTICAL_HUD_V147__));
  await page.evaluate(() => window.__RTS_DEBUG__.setPeaceMode(true));
  return errors;
}

test('multi-regiment HUD reports march count and average distance', async ({ page }) => {
  const errors = await prepare(page);
  const result = await page.evaluate(() => {
    gameOver = false;
    const a = getRegiment(window.__RTS_DEBUG__.createFreshInfantryRegiment('france', 700, 700));
    const b = getRegiment(window.__RTS_DEBUG__.createFreshInfantryRegiment('france', 700, 1050));
    selectedUnits.clear();
    [...regimentMembers(a), ...regimentMembers(b)].forEach(u => selectedUnits.add(u));
    const center = centroid([...regimentMembers(a), ...regimentMembers(b)]);
    issueMove(center.x + 650, center.y);
    const tactical = window.__TACTICAL_HUD_V147__.selectionTacticalState([a, b]);
    const summary = window.__TACTICAL_HUD_V147__.selectionRegimentSummary([a, b], tactical);
    return {
      moving: tactical.moving,
      averageDistance: tactical.averageDistance,
      orderStates: tactical.orderStates.length,
      summary
    };
  });

  expect(result.moving).toBe(2);
  expect(result.orderStates).toBe(2);
  expect(result.averageDistance).toBeGreaterThan(500);
  expect(result.summary).toContain('2/2 marcheert');
  expect(result.summary).toContain('gem.');
  expect(result.summary).toContain('m te gaan');
  expect(errors).toEqual([]);
});

test('HUD surfaces lost command staff in selected regiment group', async ({ page }) => {
  const errors = await prepare(page);
  const result = await page.evaluate(() => {
    gameOver = false;
    const a = getRegiment(window.__RTS_DEBUG__.createFreshInfantryRegiment('france', 850, 800));
    const b = getRegiment(window.__RTS_DEBUG__.createFreshInfantryRegiment('france', 850, 1150));
    const lostOfficer = regimentMembers(b).find(u => u.id === b.officerId);
    lostOfficer.dead = true;
    const tactical = window.__TACTICAL_HUD_V147__.selectionTacticalState([a, b]);
    const summary = window.__TACTICAL_HUD_V147__.selectionRegimentSummary([a, b], tactical);
    return {
      officerLosses: tactical.officerLosses,
      pressureReasons: tactical.pressureReasons,
      summary
    };
  });

  expect(result.officerLosses).toBe(1);
  expect(result.pressureReasons).toContain('1 officier verloren');
  expect(result.summary).toContain('1 zonder officier');
  expect(errors).toEqual([]);
});

test('single-regiment summary reuses the tactical order snapshot', async ({ page }) => {
  const errors = await prepare(page);
  const result = await page.evaluate(() => {
    gameOver = false;
    const reg = getRegiment(window.__RTS_DEBUG__.createFreshInfantryRegiment('france', 950, 900));
    selectWholeRegiment(reg);
    const center = centroid(regimentMembers(reg));
    issueMove(center.x + 420, center.y + 120);
    const tactical = window.__TACTICAL_HUD_V147__.selectionTacticalState([reg]);
    const summary = window.__TACTICAL_HUD_V147__.selectionRegimentSummary([reg], tactical);
    return {
      orderStates: tactical.orderStates.length,
      moving: tactical.moving,
      distance: tactical.orderStates[0]?.distance || 0,
      summary
    };
  });

  expect(result.orderStates).toBe(1);
  expect(result.moving).toBe(1);
  expect(result.distance).toBeGreaterThan(300);
  expect(result.summary).toContain('marcheert');
  expect(result.summary).toContain('m te gaan');
  expect(errors).toEqual([]);
});
