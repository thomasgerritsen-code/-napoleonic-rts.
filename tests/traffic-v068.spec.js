const { test, expect } = require('@playwright/test');

async function openGame(page) {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    let seed = 246813579;
    Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  });
  await page.goto('/?test=1', { waitUntil:'networkidle' });
  await page.waitForFunction(() => Boolean(window.__RTS_DEBUG__?.trafficSystemV068 && window.__RTS_DEBUG__?.crossingTrafficV068 && window.__RTS_DEBUG__?.bridgeDeckOccupancyV068 && window.RTS_SIM?.version === '0.6.9'));
  return pageErrors;
}

test('v0.6.9 preserves single-lane bridge traffic and wider ford capacity', async ({ page }) => {
  const errors = await openGame(page);
  await expect(page).toHaveTitle(/Napoleonic RTS v0\.6\.9/);
  await expect(page.locator('.version')).toHaveText('v0.6.9');
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

test('two battalions queue at Pont de la Chaussee, never share the deck and reform after crossing', async ({ page }, testInfo) => {
  const errors = await openGame(page);
  await page.evaluate(() => window.__RTS_DEBUG__.setPeaceMode(true));
  const ids = await page.evaluate(() => {
    const first = window.__RTS_DEBUG__.createFreshInfantryRegiment('france',1030,900);
    const second = window.__RTS_DEBUG__.createFreshInfantryRegiment('france',760,900);
    window.__RTS_DEBUG__.selectRegiment(first);
    window.__RTS_DEBUG__.orderSelectedWithFacing(2200,900,0);
    window.__RTS_DEBUG__.selectRegiment(second);
    window.__RTS_DEBUG__.orderSelectedWithFacing(2200,900,0);
    return [first, second];
  });

  let sawQueue = false;
  let sawForcedColumn = false;
  let sawFirstCrossing = false;
  let sawSecondCrossing = false;
  let maxDeckGroups = 0;
  let finalStates = null;

  for (let i=0; i<140; i++) {
    await page.evaluate(() => window.RTS_SIM.step(0.5));
    const sample = await page.evaluate(ids => ({
      traffic:window.__RTS_DEBUG__.crossingTrafficV068('pont-chaussee'),
      deck:window.__RTS_DEBUG__.bridgeDeckOccupancyV068('pont-chaussee'),
      states:ids.map(id => window.__RTS_DEBUG__.formationState(id))
    }), ids);
    maxDeckGroups = Math.max(maxDeckGroups, sample.deck.count);
    sawQueue ||= sample.traffic.waiting > 0 || sample.states.some(s => s?.crossingTraffic?.state === 'waiting');
    sawForcedColumn ||= sample.states.some(s => s?.forcedBridgeColumn && ['bridge-waiting','bridge-forming','bridge-crossing'].includes(s.phase));
    sawFirstCrossing ||= sample.states[0]?.crossingTraffic?.state === 'crossing';
    sawSecondCrossing ||= sample.states[1]?.crossingTraffic?.state === 'crossing';
    finalStates = sample.states;
    if (sample.states.every(s => s?.phase === 'formed' && s.centroid.x > 1800)) break;
  }

  expect(sawQueue).toBe(true);
  expect(sawForcedColumn).toBe(true);
  expect(sawFirstCrossing).toBe(true);
  expect(sawSecondCrossing).toBe(true);
  expect(maxDeckGroups).toBeLessThanOrEqual(1);
  expect(finalStates).toHaveLength(2);
  for (const state of finalStates) {
    expect(state.formation).toBe('line');
    expect(state.phase).toBe('formed');
    expect(state.centroid.x).toBeGreaterThan(1800);
    expect(state.crossingTraffic).toBeNull();
  }
  await testInfo.attach('v069-bridge-queue', { body:await page.screenshot({fullPage:true}), contentType:'image/png' });
  expect(errors).toEqual([]);
});
