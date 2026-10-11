const { test, expect } = require('@playwright/test');

test('browser: four-file road marching survives turns and transient off-road samples', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?test=road-column-acceptance', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.RTS_SIM && window.__RTS_DEBUG__?.setPeaceMode));
  const result = await page.evaluate(() => {
    window.__RTS_DEBUG__.setPeaceMode(true);
    const road = ROAD_NETWORK_V066.find(r => r.id === 'grande-chaussee');
    if (!road || road.points.length < 4) return { error: 'Missing expected road geometry' };
    const a = road.points[1], b = road.points[road.points.length - 2];
    const id = window.__RTS_DEBUG__.createFreshInfantryRegiment('france', a.x, a.y);
    const reg = getRegiment(id);
    const members = regimentMembers(reg).filter(u => u.type === 'infantry' && !u.dead);
    orderGroupPathV06(reg, b.x, b.y, 'line', null);
    const march = reg.marchV063;
    const expected = marchColumnOffsetsV063(reg);
    const ranks = new Map();
    for (const u of members) {
      const offset = expected.get(u.id);
      if (!offset) return { error: 'Missing infantry offset' };
      const rank = Math.round(-offset.ox / 20);
      ranks.set(rank, [...(ranks.get(rank) || []), offset.oy]);
    }
    const fourFiles = [...ranks.values()].filter(row => row.length === 4)
      .every(row => new Set(row).size === 4);
    let roadSamples = 0, interruptions = 0, roadModeSamples = 0, bridgeSamples = 0;
    let unsafe = 0;
    for (let i = 0; i < 600; i++) {
      window.RTS_SIM.step(.05);
      const m = reg.marchV063;
      if (!m || m.phase === 'deploying' || m.phase === 'arrived') break;
      const onRoad = roadAtV064(m.anchorX, m.anchorY);
      if (onRoad) {
        roadSamples++;
        if (m.locomotionV064 === 'road-march') roadModeSamples++;
        else interruptions++;
      }
      if (reg.crossingTrafficV068?.forcedColumn) bridgeSamples++;
      unsafe += members.filter(u => waterAtV067(u.x, u.y)).length;
    }
    return { infantry: members.length, ranks: ranks.size, fourFiles, roadSamples,
      roadModeSamples, interruptions, bridgeSamples, unsafe, phase: march.phase };
  });
  expect(result.error).toBeUndefined();
  expect(result.infantry).toBeGreaterThanOrEqual(12);
  expect(result.fourFiles).toBe(true);
  expect(result.roadSamples).toBeGreaterThan(0);
  expect(result.interruptions).toBe(0);
  expect(result.unsafe).toBe(0);
  expect(errors).toEqual([]);
});
