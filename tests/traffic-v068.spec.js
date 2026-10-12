const { test, expect } = require('@playwright/test');

async function openGame(page) {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    let seed = 246813579;
    Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  });
  await page.goto('/?test=1', { waitUntil:'networkidle' });
  await page.waitForFunction(() => Boolean(window.__RTS_DEBUG__?.trafficSystemV068 && window.__RTS_DEBUG__?.crossingTrafficV068 && window.__RTS_DEBUG__?.bridgeDeckOccupancyV068 && window.RTS_SIM?.version));
  return pageErrors;
}

test('current runtime preserves single-lane bridge traffic and wider ford capacity', async ({ page }) => {
  const errors = await openGame(page);
  const runtimeVersion = await page.evaluate(() => window.RTS_SIM.version);
  await expect(page).toHaveTitle(new RegExp(`Napoleonic RTS v${runtimeVersion.replace(/\./g,'\\.')}`));
  await expect(page.locator('.version')).toHaveText(`v${runtimeVersion}`);
  const traffic = await page.evaluate(() => window.__RTS_DEBUG__.trafficSystemV068());
  const chauss = traffic.crossings.find(c => c.id === 'pont-chaussee');
  const crete = traffic.crossings.find(c => c.id === 'pont-crete');
  const ford = traffic.crossings.find(c => c.id === 'gue-colline');
  expect(chauss.capacity).toBe(1);
  expect(crete.capacity).toBe(1);
  expect(ford.capacity).toBe(2);
  expect(traffic.holdDistance).toBeGreaterThan(150);
  expect(traffic.queueGap).toBeGreaterThan(100);
  expect(errors).toEqual([]);
});

test('two battalions integrate with the production bridge queue and reform after crossing', async ({ page }, testInfo) => {
  const errors = await openGame(page);
  const result = await page.evaluate(() => {
    window.__RTS_DEBUG__.setPeaceMode(true);
    const first = window.__RTS_DEBUG__.createFreshInfantryRegiment('france',1030,900);
    const second = window.__RTS_DEBUG__.createFreshInfantryRegiment('france',760,900);
    window.__RTS_DEBUG__.selectRegiment(first);
    window.__RTS_DEBUG__.orderSelectedWithFacing(2200,900,0);
    window.__RTS_DEBUG__.selectRegiment(second);
    window.__RTS_DEBUG__.orderSelectedWithFacing(2200,900,0);
    const ids=[first,second];

    let sawQueue=false;
    let sawForcedColumn=false;
    let sawFirstCrossing=false;
    let sawSecondCrossing=false;
    let maxDeckGroups=0;
    let finalStates=null;

    for(let i=0;i<140;i++){
      window.RTS_SIM.step(.5);
      const traffic=window.__RTS_DEBUG__.crossingTrafficV068('pont-chaussee');
      const deck=window.__RTS_DEBUG__.bridgeDeckOccupancyV068('pont-chaussee');
      const states=ids.map(id=>window.__RTS_DEBUG__.formationState(id));
      maxDeckGroups=Math.max(maxDeckGroups,deck.count);
      sawQueue ||= traffic.waiting>0 || states.some(s=>s?.crossingTraffic?.state==='waiting');
      sawForcedColumn ||= states.some(s=>s?.forcedBridgeColumn && ['bridge-waiting','bridge-forming','bridge-crossing'].includes(s.phase));
      sawFirstCrossing ||= states[0]?.crossingTraffic?.state==='crossing';
      sawSecondCrossing ||= states[1]?.crossingTraffic?.state==='crossing';
      finalStates=states;
      if(states.every(s=>s?.phase==='formed' && s.centroid.x>1800)) break;
    }

    return {sawQueue,sawForcedColumn,sawFirstCrossing,sawSecondCrossing,maxDeckGroups,finalStates};
  });

  expect(result.sawQueue).toBe(true);
  expect(result.sawForcedColumn).toBe(true);
  expect(result.sawFirstCrossing).toBe(true);
  expect(result.sawSecondCrossing).toBe(true);
  expect(result.maxDeckGroups).toBeLessThanOrEqual(1);
  expect(result.finalStates).toHaveLength(2);
  for (const state of result.finalStates) {
    expect(state.formation).toBe('line');
    expect(state.phase).toBe('formed');
    expect(state.centroid.x).toBeGreaterThan(1800);
    expect(state.crossingTraffic).toBeNull();
  }
  await testInfo.attach('bridge-queue', { body:await page.screenshot({fullPage:true}), contentType:'image/png' });
  expect(errors).toEqual([]);
});


test('reissuing a bridge holder order retains physical deck exclusion until soldiers clear', async ({ page }) => {
  const errors = await openGame(page);
  const result = await page.evaluate(() => {
    resetGame();
    v05PeaceMode = true;
    gameOver = false;
    for (const unit of units) unit.dead = true;
    for (const reg of regiments) reg.destroyed = true;

    const c = WATER_CROSSINGS_V067.find(crossing => crossing.id === 'pont-chaussee');
    const state = CROSSING_TRAFFIC_V068.get(c.id);
    const west = crossingPointV068(c, -(c.length / 2 + 370), 0);
    const east = crossingPointV068(c, c.length / 2 + 370, 0);
    const holderId = window.__RTS_DEBUG__.createFreshInfantryRegiment('france', west.x, west.y);
    const queuedId = window.__RTS_DEBUG__.createFreshInfantryRegiment('france', east.x, east.y);
    const holder = getRegiment(holderId);
    const queued = getRegiment(queuedId);
    const scout = regimentMembers(holder).find(unit => unit.type === 'infantry');
    const deck = crossingPointV068(c, 0, 0);
    scout.x = deck.x;
    scout.y = deck.y;

    // Stage a current holder and an opposite-bank waiting regiment. The
    // reissued order then exercises the production cancellation hook.
    state.holderIds = [holderId];
    state.queue = [queuedId];
    holder.crossingTrafficV068 = {
      crossingId: c.id, crossingName: c.name, state: 'crossing',
      queuePosition: 0, initialSide: -1, entered: true, forcedColumn: true
    };
    queued.crossingTrafficV068 = {
      crossingId: c.id, crossingName: c.name, state: 'waiting',
      queuePosition: 1, initialSide: 1, entered: false, forcedColumn: true
    };
    orderGroupPathV06(holder, east.x, east.y, 'line', null);
    const releasedHolder = !state.holderIds.includes(holderId);
    promoteTrafficQueuesV068();
    const blocked = state.queue.includes(queuedId) && !state.holderIds.includes(queuedId);
    const occupied = groupTouchesCrossingV068(holder, c);

    scout.x = west.x;
    scout.y = west.y;
    promoteTrafficQueuesV068();
    return { releasedHolder, blocked, occupied,
      promotedAfterExit: state.holderIds.includes(queuedId),
      waitingState: queued.crossingTrafficV068?.state || null };
  });
  expect(result.releasedHolder).toBe(true);
  expect(result.occupied).toBe(true);
  expect(result.blocked).toBe(true);
  expect(result.promotedAfterExit).toBe(true);
  expect(result.waitingState).toBe('approach');
  expect(errors).toEqual([]);
});
