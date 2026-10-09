const { test, expect } = require('@playwright/test');

async function openCrossingGame(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    let seed = 14062009;
    Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  });
  await page.goto('/?test=movement-coverage', { waitUntil:'networkidle' });
  await page.waitForFunction(() => Boolean(window.RTS_SIM && window.NRTS_NAVIGATION_V2?.active && window.__RIVER_CROSSING_RECOVERY_V1__));
  return errors;
}

test('Pont de la Crête: queued regiment does not rewrite its bridge route while waiting for the holder', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await openCrossingGame(page);
  const result = await page.evaluate(() => {
    resetGame(); v05PeaceMode = true; gameOver = false;
    for (const u of units) u.dead = true;
    for (const r of regiments) r.destroyed = true;
    const c = WATER_CROSSINGS_V067.find(x => x.id === 'pont-crete');
    const state = CROSSING_TRAFFIC_V068.get(c.id);
    const capacity = state.capacity;
    state.capacity = 0; // Simulate a genuinely occupied single-lane bridge.
    const start = queueHoldPointV068(c, -1, 1);
    const makeRegiment=(c, start) => {
    const soldiers = [];
    for (let i = 0; i < 18; i++) {
      soldiers.push(createUnit('france', 'infantry', start.x + (i % 6 - 2.5) * 16,
        start.y + (Math.floor(i / 6) - 1) * 16));
    }
    soldiers.push(createUnit('france', 'officer', start.x - 16, start.y - 36));
    soldiers.push(createUnit('france', 'drummer', start.x + 16, start.y - 36));
    return createRegiment('france', soldiers);
  };
    const reg = makeRegiment(c, start);
    const far = crossingPointV068(c, c.length / 2 + 310, 0);
    orderGroupPathV06(reg, far.x, far.y, 'line', 0);
    // Keep a real, valid queue reservation while deliberately occupying all capacity.
    // Without it the automatic path planner may pick Pont de la Chaussée instead.
    const corridor = window.NRTS_NAVIGATION_V2.bridgeCorridor(c.id, -1);
    reg.path = [corridor.approach, corridor.entry, corridor.exit, corridor.clear, far];
    reg.pathIndex = 0;
    reg.routeCrossingsV067 = [{id:c.id,name:c.name,type:c.type,material:c.material}];
    reg.crossingTrafficV068 = {
      crossingId:c.id,crossingName:c.name,state:'waiting',queuePosition:1,
      initialSide:-1,entered:false,forcedColumn:true
    };
    state.queue.push(reg.id);
    let sawWaiting = false;
    for (let i = 0; i < 170; i++) {
      window.RTS_SIM.step(.05);
      sawWaiting ||= reg.crossingTrafficV068?.state === 'waiting';
    }
    const before = window.__RIVER_CROSSING_RECOVERY_V1__.stats();
    const queuedPath = reg.path?.length || 0;
    const waitingInfo = reg.crossingTrafficV068?.state;
    for (let i = 0; i < 180; i++) window.RTS_SIM.step(.05);
    const after = window.__RIVER_CROSSING_RECOVERY_V1__.stats();
    const blocked = regimentMembers(reg).filter(u => !u.dead && waterAtV067(u.x, u.y)).length;
    const stillWaiting = reg.crossingTrafficV068?.state;
    state.capacity = capacity;
    return {
      bridge:c.id, sawWaiting, waitingInfo, stillWaiting,
      deltaGroupRecoveries:after.groupRecoveries - before.groupRecoveries,
      queuedPath, finalPath:reg.path?.length || 0,
      blocked, state:window.__RTS_DEBUG__.formationState(reg.id)
    };
  });
  console.log('CRETE_QUEUED_RECOVERY', JSON.stringify(result));
  expect(result.sawWaiting).toBe(true);
  expect(result.waitingInfo).toBe('waiting');
  expect(result.stillWaiting).toBe('waiting');
  expect(result.deltaGroupRecoveries).toBe(0);
  expect(result.blocked).toBe(0);
  expect(errors).toEqual([]);
});

test('Pont de la Crête: off-center western approach forms a column and clears all infantry', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = await openCrossingGame(page);
  const result = await page.evaluate(() => {
    resetGame(); v05PeaceMode = true; gameOver = false;
    for (const u of units) u.dead = true;
    for (const r of regiments) r.destroyed = true;
    const c = WATER_CROSSINGS_V067.find(x => x.id === 'pont-crete');
    const start = crossingPointV068(c, -(c.length / 2 + 260), 110);
    const makeRegiment=(c, start) => {
    const soldiers = [];
    for (let i = 0; i < 18; i++) {
      soldiers.push(createUnit('france', 'infantry', start.x + (i % 6 - 2.5) * 16,
        start.y + (Math.floor(i / 6) - 1) * 16));
    }
    soldiers.push(createUnit('france', 'officer', start.x - 16, start.y - 36));
    soldiers.push(createUnit('france', 'drummer', start.x + 16, start.y - 36));
    return createRegiment('france', soldiers);
  };
    const reg = makeRegiment(c, start);
    const goal = crossingPointV068(c, c.length / 2 + 360, -25);
    orderGroupPathV06(reg, goal.x, goal.y, 'line', 0);
    const initialPath = reg.path?.map(p => ({x:p.x,y:p.y})) || [];
    const approach = window.NRTS_NAVIGATION_V2.bridgeCorridor(c.id,-1).approach;
    const directApproach = Boolean(initialPath.length && Math.hypot(initialPath[0].x-approach.x,initialPath[0].y-approach.y)<3);
    const initialRouteCrossings = (reg.routeCrossingsV067 || []).map(item => item.id);
    const declaredBridgeCorridors = (reg.navigationV2?.bridgeCorridors || []).map(item => item.id);
    let formed = false, forcedColumn = false, crossing = false, cleared = false, maxWater = 0;
    let farBankAt = null;
    for (let i = 0; i < 3600; i++) {
      window.RTS_SIM.step(.05);
      if (i % 8) continue;
      const info = reg.crossingTrafficV068;
      formed ||= reg.movementPhaseV063 === 'bridge-forming';
      forcedColumn ||= Boolean(info?.forcedColumn && ['approach','crossing'].includes(info.state));
      crossing ||= info?.state === 'crossing';
      const alive = regimentMembers(reg).filter(u => !u.dead);
      maxWater = Math.max(maxWater, alive.filter(u => waterAtV067(u.x,u.y)).length);
      const farBank = alive.length > 0 && alive.every(u =>
        crossingLocalV068(c,u.x,u.y).along > c.length / 2 + 25 && !waterAtV067(u.x,u.y));
      if (farBank) { cleared = true; farBankAt = elapsed; break; }
    }
    const alive = regimentMembers(reg).filter(u => !u.dead);
    return {
      bridge:c.id, start, goal, initialPath, directApproach, initialRouteCrossings, declaredBridgeCorridors, formed, forcedColumn, crossing, cleared, farBankAt, maxWater,
      finalBlocked:alive.filter(u => segmentCrossesBlockedWaterV067(u.x,u.y,u.targetX,u.targetY)).length,
      finalWater:alive.filter(u => waterAtV067(u.x,u.y)).length,
      finalCenter:centroid(alive),
      traffic:reg.crossingTrafficV068?.state || null,
      recoveries:window.__RIVER_CROSSING_RECOVERY_V1__.stats()
    };
  });
  console.log('CRETE_OFF_AXIS_APPROACH', JSON.stringify(result));
  expect(result.initialRouteCrossings).toEqual(['pont-crete']);
  expect(result.declaredBridgeCorridors).toEqual(['pont-crete']);
  expect(result.directApproach).toBe(true);
  expect(result.forcedColumn).toBe(true);
  expect(result.crossing).toBe(true);
  expect(result.cleared).toBe(true);
  expect(result.maxWater).toBe(0);
  expect(result.finalWater).toBe(0);
  expect(result.finalBlocked).toBe(0);
  expect(errors).toEqual([]);
});
