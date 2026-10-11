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
      // Tactical combat deliberately suspends marching formation even while the
      // anchor is geometrically above a road. It is not a road-mode drop; this
      // acceptance only measures uninterrupted travel while the route owns motion.
      const tacticalOverride = m.phase === 'combat-halt' || m.locomotionV064 === 'combat-formation';
      if (onRoad && !tacticalOverride) {
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


test('browser: a halt/resume order and a sustained road exit preserve correct formations', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    let seed = 22051996;
    Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  });
  await page.goto('/?test=road-halt-exit-acceptance', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(
    window.RTS_SIM && window.__RTS_DEBUG__?.setPeaceMode && window.__BRIDGE_FORMATION_FLOW_V1__
  ));

  const result = await page.evaluate(() => {
    window.__RTS_DEBUG__.setPeaceMode(true);
    gameOver = false;
    for (const unit of units) unit.dead = true;
    for (const regiment of regiments) regiment.destroyed = true;
    const road = ROAD_NETWORK_V066.find(item => item.id === 'grande-chaussee');
    if (!road || road.points.length < 4) return { error: 'Missing road geometry' };
    const start = road.points[1], destination = road.points[road.points.length - 2];
    const id = window.__RTS_DEBUG__.createFreshInfantryRegiment('france', start.x, start.y);
    const reg = getRegiment(id);
    if (!reg) return { error: 'Could not create infantry regiment' };
    const infantry = regimentMembers(reg).filter(unit => unit.type === 'infantry' && !unit.dead);
    orderGroupPathV06(reg, destination.x, destination.y, 'line', null);
    let roadBeforeHalt = 0;
    for (let i = 0; i < 100; i++) {
      window.RTS_SIM.step(.05);
      const march = reg.marchV063;
      if (march?.locomotionV064 === 'road-march' && roadAtV064(march.anchorX, march.anchorY)) roadBeforeHalt++;
    }

    selectWholeRegiment(reg);
    const halted = haltSelectedRegiments();
    const stoppedPositions = infantry.map(unit => ({ x: unit.x, y: unit.y }));
    let maxHaltDrift = 0;
    for (let i = 0; i < 40; i++) {
      window.RTS_SIM.step(.05);
      infantry.forEach((unit, index) => {
        maxHaltDrift = Math.max(maxHaltDrift, Math.hypot(
          unit.x - stoppedPositions[index].x, unit.y - stoppedPositions[index].y
        ));
      });
    }
    const remainedHalted = reg.marchV063 === null && reg.path === null &&
      reg.movementPhaseV063 === 'halted';

    orderGroupPathV06(reg, destination.x, destination.y, 'line', null);
    let roadAfterResume = 0, resumeFourFiles = 0;
    for (let i = 0; i < 80; i++) {
      window.RTS_SIM.step(.05);
      const march = reg.marchV063;
      if (!march) break;
      if (roadAtV064(march.anchorX, march.anchorY) && march.locomotionV064 === 'road-march') {
        roadAfterResume++;
        const offsets = march.slotOffsetsV064 || new Map();
        const slots = infantry.map(unit => offsets.get(unit.id)).filter(Boolean);
        if (slots.length === infantry.length && new Set(
          slots.map(slot => Math.round(slot.oy * 1000) / 1000)
        ).size === 4) resumeFourFiles++;
      }
    }

    const march = reg.marchV063;
    if (!march) return { error: 'March ended before field exit', halted, roadBeforeHalt, roadAfterResume };
    const fieldStart = { x: march.anchorX, y: march.anchorY };
    let fieldTarget = null;
    // Choose a genuinely dry, off-road destination and approach, rather than
    // hard-coding map coordinates that may change with future battlefield art.
    for (const radius of [280, 320, 360]) {
      for (let i = 0; i < 24 && !fieldTarget; i++) {
        const angle = i * Math.PI / 12;
        const x = fieldStart.x + Math.cos(angle) * radius;
        const y = fieldStart.y + Math.sin(angle) * radius;
        if (x < 90 || y < 90 || x > WORLD.width - 90 || y > WORLD.height - 90) continue;
        const samples = Array.from({ length: 12 }, (_, n) => {
          const fraction = (n + 1) / 12;
          return {
            x: fieldStart.x + (x - fieldStart.x) * fraction,
            y: fieldStart.y + (y - fieldStart.y) * fraction,
            fraction
          };
        });
        if (samples.some(p => waterAtV067(p.x, p.y))) continue;
        if (samples.filter(p => p.fraction >= .5).some(p => roadAtV064(p.x, p.y))) continue;
        fieldTarget = { x, y };
        break;
      }
      if (fieldTarget) break;
    }
    if (!fieldTarget) return { error: 'No safe extended off-road route', halted, roadBeforeHalt, roadAfterResume };

    orderGroupPathV06(reg, fieldTarget.x, fieldTarget.y, 'line', null);
    let sustainedExit = false, widenedToLine = false, fieldTravel = 0, unsafe = 0;
    let fieldModeSamples = 0;
    for (let i = 0; i < 900; i++) {
      window.RTS_SIM.step(.05);
      const moving = reg.marchV063;
      unsafe += infantry.filter(unit => waterAtV067(unit.x, unit.y)).length;
      if (!moving) break;
      fieldTravel = Math.max(fieldTravel, Math.hypot(
        moving.anchorX - fieldStart.x, moving.anchorY - fieldStart.y
      ));
      if (roadAtV064(moving.anchorX, moving.anchorY)) continue;
      if (moving.locomotionV064 === 'field-formation') fieldModeSamples++;
      if (Number.isFinite(moving.roadLastSeenAtV064) &&
          elapsed - moving.roadLastSeenAtV064 >= 1.6 &&
          moving.locomotionV064 === 'field-formation') {
        sustainedExit = true;
        const offsets = moving.slotOffsetsV064 || new Map();
        const slots = infantry.map(unit => offsets.get(unit.id)).filter(Boolean);
        if (slots.length === infantry.length) {
          const sideways = slots.map(slot => slot.oy);
          widenedToLine ||= Math.max(...sideways) - Math.min(...sideways) > 70;
        }
      }
      if (sustainedExit && widenedToLine && fieldModeSamples >= 20) break;
    }
    return { halted, remainedHalted, maxHaltDrift, roadBeforeHalt, roadAfterResume,
      resumeFourFiles, infantry: infantry.length, fieldTarget, fieldTravel,
      fieldModeSamples, sustainedExit, widenedToLine, unsafe };
  });

  console.log('ROAD_HALT_EXIT_ACCEPTANCE', JSON.stringify(result));
  expect(result.error).toBeUndefined();
  expect(result.halted).toBe(1);
  expect(result.remainedHalted).toBe(true);
  expect(result.maxHaltDrift).toBeLessThanOrEqual(8);
  expect(result.roadBeforeHalt).toBeGreaterThan(5);
  expect(result.roadAfterResume).toBeGreaterThan(5);
  expect(result.resumeFourFiles).toBeGreaterThan(5);
  expect(result.sustainedExit).toBe(true);
  expect(result.fieldModeSamples).toBeGreaterThan(20);
  expect(result.widenedToLine).toBe(true);
  expect(result.fieldTravel).toBeGreaterThan(90);
  expect(result.unsafe).toBe(0);
  expect(errors).toEqual([]);
});
