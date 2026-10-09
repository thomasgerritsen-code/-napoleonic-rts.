const { test, expect } = require('@playwright/test');

test('four infantry regiments sharing one bridge from both banks eventually cross without gridlock or water loss', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    let seed = 381793;
    Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  });
  await page.goto('/?test=movement-coverage', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.RTS_SIM && window.NRTS_NAVIGATION_V2?.active && window.__RIVER_CROSSING_RECOVERY_V1__);
  const result = await page.evaluate(() => {
    resetGame();
    v05PeaceMode = true;
    gameOver = false;
    for (const u of units) u.dead = true;
    for (const r of regiments) r.destroyed = true;

    const bridge = WATER_CROSSINGS_V067.find(c => c.id === 'pont-chaussee');
    const groups = [];
    const entries = [
      { side:-1, distance:bridge.length / 2 + 180 },
      { side: 1, distance:bridge.length / 2 + 180 },
      { side:-1, distance:bridge.length / 2 + 385 },
      { side: 1, distance:bridge.length / 2 + 385 }
    ];
    for (const entry of entries) {
      const spawn = crossingPointV068(bridge, entry.side * entry.distance, 0);
      const made = [];
      for (let i = 0; i < 12; i++) {
        const p = crossingPointV068(bridge,
          entry.side * entry.distance + (i % 4 - 1.5) * 13,
          (Math.floor(i / 4) - 1) * 13);
        made.push(createUnit('france', 'infantry', p.x, p.y));
      }
      made.push(createUnit('france', 'officer', spawn.x, spawn.y - 25));
      made.push(createUnit('france', 'drummer', spawn.x + 20, spawn.y - 25));
      const reg = createRegiment('france', made);
      const destination = crossingPointV068(bridge, -entry.side * (bridge.length / 2 + 320), 0);
      orderGroupPathV06(reg, destination.x, destination.y, 'column',
        crossingHeadingV068(bridge, entry.side));
      groups.push({ id:reg.id, side:entry.side, destination, crossed:false, lastProgress:0, lastProgressAt:elapsed, maxHolderStall:0 });
    }

    let maxHolders = 0, queueObserved = false, allCrossedAt = null;
    let maxWater = 0, holderStalls = [];
    for (let i = 0; i < 5800; i++) {
      window.RTS_SIM.step(0.05);
      if (i % 8) continue;
      const traffic = CROSSING_TRAFFIC_V068.get(bridge.id);
      maxHolders = Math.max(maxHolders, traffic.holderIds.length);
      queueObserved ||= traffic.queue.length > 0;
      let allCrossed = true;
      for (const item of groups) {
        const reg = getRegiment(item.id);
        const members = regimentMembers(reg).filter(u => !u.dead);
        const waterNow = members.filter(u => waterAtV067(u.x,u.y)).length;
        maxWater = Math.max(maxWater, waterNow);
        const cleared = members.length > 0 && members.every(u => {
          const local = crossingLocalV068(bridge,u.x,u.y);
          return local.along * -item.side > bridge.length / 2 + 28 && !waterAtV067(u.x,u.y);
        });
        if (cleared) item.crossed = true;
        if (!item.crossed) allCrossed = false;
        const info = reg.crossingTrafficV068;
        // Track only the active holder; waiting in an orderly queue is not a stall.
        if (info?.state === 'crossing' && traffic.holderIds.includes(item.id)) {
          const along = crossingLocalV068(bridge,reg.marchV063.anchorX,reg.marchV063.anchorY).along * -item.side;
          if (along > item.lastProgress + 2.5) { item.lastProgress = along; item.lastProgressAt = elapsed; }
          item.maxHolderStall = Math.max(item.maxHolderStall, elapsed - item.lastProgressAt);
        } else {
          item.lastProgressAt = elapsed;
        }
      }
      if (allCrossed) { allCrossedAt = elapsed; break; }
    }
    for (const item of groups) {
      const reg = getRegiment(item.id);
      const members = regimentMembers(reg).filter(u => !u.dead);
      item.finalWater = members.filter(u => waterAtV067(u.x,u.y)).length;
      item.finalBlocked = members.filter(u => Number.isFinite(u.targetX) && Number.isFinite(u.targetY) && segmentCrossesBlockedWaterV067(u.x,u.y,u.targetX,u.targetY)).length;
      item.finalCenter = centroid(members);
      item.traffic = reg.crossingTrafficV068?.state || null;
      if (item.maxHolderStall > 18) holderStalls.push({ id:item.id, seconds:item.maxHolderStall });
    }
    return {
      bridge:bridge.id,
      groups,
      queueObserved,
      maxHolders,
      maxWater,
      allCrossedAt,
      holderStalls,
      recovery:window.__RIVER_CROSSING_RECOVERY_V1__.stats(),
      traffic:window.__RTS_DEBUG__.crossingTrafficV068(bridge.id)
    };
  });
  console.log('MULTI_REGIMENT_BRIDGE_GRIDLOCK', JSON.stringify(result));
  expect(result.groups).toHaveLength(4);
  expect(result.maxHolders).toBeLessThanOrEqual(1);
  expect(result.queueObserved).toBe(true);
  expect(result.groups.filter(g => !g.crossed)).toEqual([]);
  expect(result.groups.filter(g => g.finalWater || g.finalBlocked)).toEqual([]);
  expect(result.holderStalls).toEqual([]);
  expect(result.maxWater).toBe(0);
  expect(result.allCrossedAt).not.toBeNull();
  expect(errors).toEqual([]);
});
