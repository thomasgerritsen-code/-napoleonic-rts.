const { test, expect } = require('@playwright/test');

async function prepare(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?test=v071', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__TACTICAL_HUD_V148__));
  return errors;
}

test('movement cohesion reports arrivals and stretched groups deterministically', async ({ page }) => {
  const errors = await prepare(page);
  const result = await page.evaluate(() => {
    const api = window.__TACTICAL_HUD_V148__;
    return {
      stretched: api.movementCohesion([
        { moving: true, distance: 420 },
        { moving: true, distance: 250 },
        { moving: false, distance: 0 }
      ], 3),
      steady: api.movementCohesion([
        { moving: true, distance: 310 },
        { moving: true, distance: 245 }
      ], 2)
    };
  });

  expect(result.stretched.moving).toBe(2);
  expect(result.stretched.arrived).toBe(1);
  expect(result.stretched.averageDistance).toBe(335);
  expect(result.stretched.distanceSpread).toBe(170);
  expect(result.stretched.cohesionState).toBe('stretched');
  expect(result.steady.cohesionState).toBe('steady');
  expect(errors).toEqual([]);
});

test('single-regiment v148 summary remains compatible with v147 contract', async ({ page }) => {
  const errors = await prepare(page);
  const result = await page.evaluate(() => {
    gameOver = false;
    window.__RTS_DEBUG__.setPeaceMode(true);
    const reg = getRegiment(window.__RTS_DEBUG__.createFreshInfantryRegiment('france', 900, 900));
    selectWholeRegiment(reg);
    const tactical = window.__TACTICAL_HUD_V148__.selectionTacticalState([reg]);
    return {
      summary: window.__TACTICAL_HUD_V148__.selectionRegimentSummary([reg], tactical),
      snapshots: tactical.snapshots.length,
      orderStates: tactical.orderStates.length
    };
  });

  expect(result.snapshots).toBe(1);
  expect(result.orderStates).toBe(1);
  expect(result.summary).toContain('sterkte');
  expect(result.summary).toContain('morale');
  expect(result.summary).toContain('positie ingenomen');
  expect(errors).toEqual([]);
});
