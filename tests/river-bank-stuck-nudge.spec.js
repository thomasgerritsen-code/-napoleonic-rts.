const { test, expect } = require('@playwright/test');

test('a stalled loose soldier beside the river is nudged along legal ground, never into water', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?test=movement-coverage', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.RTS_SIM && window.__STUCK_RECOVERY_V2__ && window.__RIVER_CROSSING_RECOVERY_V1__));

  const result = await page.evaluate(() => {
    resetGame();
    v05PeaceMode = true;
    gameOver = false;
    for (const unit of units) unit.dead = true;
    for (const regiment of regiments) regiment.destroyed = true;
    const unit = createUnit('france', 'infantry', 250, 250);
    unit.regimentId = null;
    unit.routing = false;
    unit.task = null;

    const nudge = Number(window.NRTS_CONFIG?.movement?.stuckRecovery?.nudgeDistance) || 18;
    const villageData = window.VILLAGE_SCENERY_V4 || window.__VILLAGE_SCENERY_V4_DATA__ || [];
    const obstacles = [
      ...villageData.flatMap(v => v.houses || []),
      ...buildings.filter(b => !b.dead)
    ];
    // Choose a bank position where the old, obstacle-only nudge would send a
    // stalled infantryman directly into deep river water.
    let scenario = null;
    for (let y = 260; y < Math.min(WORLD.height - 200, 1750) && !scenario; y += 25) {
      for (const side of [-1, 1]) {
        const x = riverCenterXAtYV067(y) + side * (RIVER_NAV_HALF_WIDTH_V067 + 3);
        if (waterAtV067(x, y)) continue;
        const nearest = obstacles.map(o => ({ o, d: Math.hypot(x - o.x, y - o.y) })).sort((a, b) => a.d - b.d)[0];
        // Avoid obstacle collision in the reproducer, so only river legality matters.
        if (nearest && nearest.d < 90) continue;
        for (const dir of [-1, 1]) {
          const px = -dir;
          let sign = unit.id % 2 ? 1 : -1;
          if (nearest) {
            const a = { x: x + px * nudge, y };
            const b = { x: x - px * nudge, y };
            sign = Math.hypot(a.x - nearest.o.x, y - nearest.o.y) >= Math.hypot(b.x - nearest.o.x, y - nearest.o.y) ? 1 : -1;
          }
          const oldNudgeX = x + px * nudge * sign;
          if (waterAtV067(oldNudgeX, y)) {
            scenario = { x, y, dir, oldNudgeX };
            break;
          }
        }
        if (scenario) break;
      }
    }
    if (!scenario) return { setup: false, reason: 'no eligible riverbank with unsafe legacy nudge' };

    const before = window.__STUCK_RECOVERY_V2__.stats();
    let afterNudge = null;
    for (let step = 0; step < 140; step++) {
      // Simulate a blocked unit until the production watchdog attempts escape.
      unit.x = scenario.x;
      unit.y = scenario.y;
      unit.targetX = scenario.x;
      unit.targetY = scenario.y + scenario.dir * 160;
      unit.arrivedAtTarget = false;
      window.RTS_SIM.step(0.05);
      const now = window.__STUCK_RECOVERY_V2__.stats();
      if (now.unitNudges > before.unitNudges) {
        afterNudge = {
          x: unit.x, y: unit.y,
          inWater: waterAtV067(unit.x, unit.y),
          crossesBlockedWater: segmentCrossesBlockedWaterV067(scenario.x, scenario.y, unit.x, unit.y),
          alternateUsed: now.alternativeNudges - before.alternativeNudges,
          unsafeRejected: now.unsafeNudgesRejected - before.unsafeNudgesRejected
        };
        break;
      }
    }
    return { setup: true, scenario, afterNudge };
  });

  console.log('RIVER_BANK_SAFE_STUCK_NUDGE', JSON.stringify(result));
  expect(result.setup, result.reason || 'missing setup').toBe(true);
  expect(result.afterNudge).not.toBeNull();
  expect(result.afterNudge.inWater).toBe(false);
  expect(result.afterNudge.crossesBlockedWater).toBe(false);
  expect(result.afterNudge.unsafeRejected).toBeGreaterThan(0);
  expect(result.afterNudge.alternateUsed).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('a loose soldier already trapped in blocked river water is restored to a walkable bank', async ({ page }) => {
  test.setTimeout(45_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?test=movement-coverage', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.RTS_SIM && window.__STUCK_RECOVERY_V2__));
  const result = await page.evaluate(() => {
    resetGame();
    v05PeaceMode = true;
    gameOver = false;
    for (const u of units) u.dead = true;
    for (const r of regiments) r.destroyed = true;
    // Known impassable water away from the authorized bridge/ford geometry.
    const source = { x: 1475, y: 520 };
    if (!waterAtV067(source.x, source.y)) return { setup: false };
    const unit = createUnit('france', 'infantry', source.x, source.y);
    unit.routing = false;
    unit.regimentId = null;
    unit.task = null;
    unit.targetX = 1300;
    unit.targetY = 520;
    unit.arrivedAtTarget = false;
    const before = window.__STUCK_RECOVERY_V2__.stats().waterRescues;
    for (let i = 0; i < 5; i++) window.RTS_SIM.step(0.05);
    const after = window.__STUCK_RECOVERY_V2__.stats().waterRescues;
    return {
      setup: true,
      recoveries: after - before,
      inWater: waterAtV067(unit.x, unit.y),
      rescueDistance: Math.hypot(unit.x - source.x, unit.y - source.y),
      commandStillIntact: unit.targetX === 1300 && unit.targetY === 520
    };
  });
  console.log('RIVER_WATER_STRAGGLER_RESCUE', JSON.stringify(result));
  expect(result.setup).toBe(true);
  expect(result.recoveries).toBeGreaterThan(0);
  expect(result.inWater).toBe(false);
  expect(result.rescueDistance).toBeGreaterThan(0);
  expect(result.rescueDistance).toBeLessThan(180);
  expect(result.commandStillIntact).toBe(true);
  expect(errors).toEqual([]);
});
