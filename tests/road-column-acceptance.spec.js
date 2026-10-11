const { test, expect } = require('@playwright/test');

test('browser: fastest-road route keeps four files on road and compact bridge', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    let seed = 22051996;
    Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  });
  await page.goto('/?test=road-column-acceptance', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(
    window.RTS_SIM && window.__RTS_DEBUG__?.setPeaceMode && window.__BRIDGE_FORMATION_FLOW_V1__
  ));
  const result = await page.evaluate(() => {
    window.__RTS_DEBUG__.setPeaceMode(true);
    gameOver = false;
    for (const unit of units) unit.dead = true;
    for (const regiment of regiments) regiment.destroyed = true;
    const road = ROAD_NETWORK_V066.find(r => r.id === 'grande-chaussee');
    if (!road || road.points.length < 4) return { error: 'Missing expected road geometry' };
    const a = road.points[1], b = road.points[road.points.length - 2];
    const id = window.__RTS_DEBUG__.createFreshInfantryRegiment('france', a.x, a.y);
    const reg = getRegiment(id);
    const members = regimentMembers(reg).filter(u => u.type === 'infantry' && !u.dead);
    orderGroupPathV06(reg, b.x, b.y, 'line', null);
    const march = reg.marchV063;
    const routePlan = reg.routePlanV065 || march?.routePlanV065 || null;
    const expected = marchColumnOffsetsV063(reg);
    const ranks = new Map();
    for (const u of members) {
      const offset = expected.get(u.id);
      if (!offset) return { error: 'Missing infantry offset' };
      const rank = Math.round(-offset.ox / 20);
      ranks.set(rank, [...(ranks.get(rank) || []), offset.oy]);
    }
    const completeRanks = [...ranks.values()].filter(row => row.length === 4);
    const fourFiles = completeRanks.length > 0 && completeRanks.every(row => new Set(row).size === 4);
    const roadSpan = Math.max(...members.map(u => expected.get(u.id).oy)) -
      Math.min(...members.map(u => expected.get(u.id).oy));

    let roadSamples = 0, roadModeSamples = 0, interruptions = 0;
    let bridgeSamples = 0, bridgeFourFileSamples = 0, bridgeCompactSamples = 0;
    let postBridgeRoadSamples = 0, unsafe = 0, seenBridge = false;
    let bridgeMinSpan = Infinity, bridgeMaxSpan = 0;
    const transitions = [];

    for (let i = 0; i < 2400; i++) {
      window.RTS_SIM.step(.05);
      const m = reg.marchV063;
      if (!m || m.phase === 'deploying' || m.phase === 'arrived') break;
      const forcedBridge = Boolean(reg.crossingTrafficV068?.forcedColumn);
      if (forcedBridge) {
        seenBridge = true;
        bridgeSamples++;
        const offsets = m.slotOffsetsV064 || new Map();
        const slots = members.map(u => offsets.get(u.id)).filter(Boolean);
        const files = new Set(slots.map(slot => Math.round(slot.oy * 1000) / 1000)).size;
        const span = slots.length ? Math.max(...slots.map(slot => slot.oy)) - Math.min(...slots.map(slot => slot.oy)) : Infinity;
        if (files === 4) bridgeFourFileSamples++;
        if (span < roadSpan - 1) bridgeCompactSamples++;
        bridgeMinSpan = Math.min(bridgeMinSpan, span);
        bridgeMaxSpan = Math.max(bridgeMaxSpan, span);
      }

      const onRoad = roadAtV064(m.anchorX, m.anchorY);
      if (onRoad) {
        roadSamples++;
        if (m.locomotionV064 === 'road-march') {
          roadModeSamples++;
          if (seenBridge && !forcedBridge) postBridgeRoadSamples++;
        } else if (!(forcedBridge && m.locomotionV064 === 'bridge-column')) {
          interruptions++;
          if (transitions.length < 8) transitions.push({
            step: i, phase: m.phase, locomotion: m.locomotionV064,
            anchorX: m.anchorX, anchorY: m.anchorY,
            lastRoad: m.roadLastSeenAtV064, elapsed
          });
        }
      }
      unsafe += members.filter(u => waterAtV067(u.x, u.y)).length;
    }

    return {
      infantry: members.length, ranks: ranks.size, fourFiles, roadSpan, routePlan,
      roadSamples, roadModeSamples, interruptions, bridgeSamples,
      bridgeFourFileSamples, bridgeCompactSamples, bridgeMinSpan, bridgeMaxSpan,
      postBridgeRoadSamples, unsafe, phase: march?.phase, transitions
    };
  });

  expect(result.error).toBeUndefined();
  expect(result.infantry).toBeGreaterThanOrEqual(12);
  expect(result.fourFiles).toBe(true);
  expect(result.routePlan?.choice).toBe('road');
  expect(result.routePlan?.chosenTime).toBeLessThanOrEqual(result.routePlan?.directTime * 1.03);
  expect(result.roadSamples).toBeGreaterThan(0);
  expect(result.roadModeSamples).toBeGreaterThan(0);
  expect(result.interruptions, JSON.stringify(result, null, 2)).toBe(0);
  expect(result.bridgeSamples).toBeGreaterThan(0);
  expect(result.bridgeFourFileSamples).toBe(result.bridgeSamples);
  expect(result.bridgeCompactSamples).toBeGreaterThan(0);
  expect(result.bridgeMinSpan).toBeGreaterThanOrEqual(42);
  expect(result.bridgeMinSpan).toBeLessThan(result.roadSpan);
  expect(result.postBridgeRoadSamples).toBeGreaterThan(0);
  expect(result.unsafe).toBe(0);
  expect(errors).toEqual([]);
});
