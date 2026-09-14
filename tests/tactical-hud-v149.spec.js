const { test, expect } = require('@playwright/test');

async function prepare(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?test=v071', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__TACTICAL_HUD_V149__));
  return errors;
}

test('v149 cohesion thresholds distinguish steady, stretched and critical groups', async ({ page }) => {
  const errors = await prepare(page);
  const result = await page.evaluate(() => {
    const api = window.__TACTICAL_HUD_V149__;
    return {
      steady: api.movementCohesion([
        { moving: true, distance: 310 },
        { moving: true, distance: 205 }
      ], 2),
      stretched: api.movementCohesion([
        { moving: true, distance: 420 },
        { moving: true, distance: 250 },
        { moving: false, distance: 0 }
      ], 3),
      critical: api.movementCohesion([
        { moving: true, distance: 610 },
        { moving: true, distance: 300 },
        { moving: false, distance: 0 }
      ], 3)
    };
  });

  expect(result.steady.cohesionState).toBe('steady');
  expect(result.stretched.cohesionState).toBe('stretched');
  expect(result.stretched.arrived).toBe(1);
  expect(result.stretched.arrivalRatio).toBeCloseTo(1 / 3);
  expect(result.critical.cohesionState).toBe('critical');
  expect(result.critical.distanceSpread).toBe(310);
  expect(errors).toEqual([]);
});

test('v149 grouped summary shows partial arrivals and critical regroup advice', async ({ page }) => {
  const errors = await prepare(page);
  const summary = await page.evaluate(() => {
    const api = window.__TACTICAL_HUD_V149__;
    const regs = [
      { formation: 'line' },
      { formation: 'line' },
      { formation: 'line' }
    ];
    return api.selectionRegimentSummary(regs, {
      state: 'moving', strength: 92, morale: 78, routing: 0, reforming: 0,
      moving: 2, arrived: 1, averageDistance: 455, distanceSpread: 310,
      cohesionState: 'critical', pressureReasons: [], officerLosses: 0, drummerLosses: 0
    });
  });

  expect(summary).toContain('2/3 marcheert');
  expect(summary).toContain('1/3 aangekomen');
  expect(summary).toContain('cohesie kritiek (310 m verschil)');
  expect(summary).toContain('hergroeperen aanbevolen');
  expect(errors).toEqual([]);
});

test('v149 keeps single-regiment summary compatibility', async ({ page }) => {
  const errors = await prepare(page);
  const result = await page.evaluate(() => {
    gameOver = false;
    window.__RTS_DEBUG__.setPeaceMode(true);
    const reg = getRegiment(window.__RTS_DEBUG__.createFreshInfantryRegiment('france', 900, 900));
    selectWholeRegiment(reg);
    const tactical = window.__TACTICAL_HUD_V149__.selectionTacticalState([reg]);
    return window.__TACTICAL_HUD_V149__.selectionRegimentSummary([reg], tactical);
  });

  expect(result).toContain('sterkte');
  expect(result).toContain('morale');
  expect(result).toContain('positie ingenomen');
  expect(errors).toEqual([]);
});
