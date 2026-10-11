const { test, expect } = require('@playwright/test');

test('road columns stay within four files, compress for a bridge, and reform without water or stalls', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    let seed = 22051996;
    Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  });
  await page.goto('/?test=movement-coverage', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(
    window.RTS_SIM && window.__BRIDGE_FORMATION_FLOW_V1__ && window.NRTS_NAVIGATION_V2?.active
  ));

  const result = await page.evaluate(() => {
    resetGame();
    v05PeaceMode = true;
    gameOver = false;
    for (const unit of units) unit.dead = true;
    for (const regiment of regiments) regiment.destroyed = true;

    const widthCases = [];
    for (const count of [12, 20, 36]) {
      const created = [];
      for (let i = 0; i < count; i++) {
        created.push(createUnit('france', 'infantry', 300 + (i % 4) * 18, 300 + Math.floor(i / 4) * 20));
      }
      const officer = createUnit('france', 'officer', 300, 270);
      const drummer = createUnit('france', 'drummer', 320, 270);
      const regiment = createRegiment('france', [...created, officer, drummer]);
      if (!regiment) throw new Error(`Could not create ${count}-infantry regiment`);
      const offsets = marchColumnOffsetsV063(regiment);
      const slots = created.map(unit => offsets.get(unit.id));
      if (slots.some(slot => !slot)) throw new Error(`Missing road slot for ${count}-infantry regiment`);
      widthCases.push({
        count,
        files: new Set(slots.map(slot => Math.round(slot.oy * 1000) / 1000)).size
      });
      for (const unit of [...created, officer, drummer]) unit.dead = true;
      regiment.destroyed = true;
    }

    const crossing = WATER_CROSSINGS_V067.find(item => item.id === 'pont-crete');
    const side = -1;
    const heading = crossingHeadingV068(crossing, side);
    const start = crossingPointV068(crossing, side * (crossing.length / 2 + 260), 110);
    const goal = crossingPointV068(crossing, crossing.length / 2 + 360, -25);
    const members = [];
    for (let i = 0; i < 24; i++) {
      members.push(createUnit('france', 'infantry', start.x + (i % 4) * 18, start.y + Math.floor(i / 4) * 20));
    }
    members.push(createUnit('france', 'officer', start.x + 35, start.y - 22));
    members.push(createUnit('france', 'drummer', start.x + 55, start.y - 22));
    const regiment = createRegiment('france', members);
    if (!regiment) throw new Error('Could not create bridge regression regiment');

    const roadOffsets = marchColumnOffsetsV063(regiment);
    const roadInfantry = regimentMembers(regiment).filter(unit => unit.type === 'infantry');
    const roadFiles = new Set(roadInfantry.map(unit => roadOffsets.get(unit.id).oy)).size;
    orderGroupPathV06(regiment, goal.x, goal.y, 'line', heading);

    let bridge = null;
    let cleared = false;
    let reformed = false;
    let waterEntries = 0;
    let steps = 0;
    for (; steps < 6000; steps++) {
      window.RTS_SIM.step(0.05);
      if (steps % 10) continue;
      const live = regimentMembers(regiment).filter(unit => !unit.dead);
      waterEntries = Math.max(waterEntries, live.filter(unit => waterAtV067(unit.x, unit.y)).length);
      const onDeck = live.filter(unit =>
        unit.type === 'infantry' &&
        Math.abs(crossingLocalV068(crossing, unit.x, unit.y).along) < crossing.length / 2 - 10
      );
      const info = regiment.crossingTrafficV068;
      if (info?.state === 'crossing' && onDeck.length >= 8) {
        const offsets = regiment.marchV063?.slotOffsetsV064 || new Map();
        const sideways = [...offsets.values()].map(offset => offset.oy);
        const along = [...offsets.values()].map(offset => offset.ox);
        const sample = {
          inDeck: onDeck.length,
          targetSpan: sideways.length ? Math.max(...sideways) - Math.min(...sideways) : Infinity,
          depth: along.length ? Math.max(...along) - Math.min(...along) : 0
        };
        if (!bridge || sample.inDeck > bridge.inDeck) bridge = sample;
      }
      if (live.length && live.every(unit =>
        crossingLocalV068(crossing, unit.x, unit.y).along > crossing.length / 2 + 25
      )) cleared = true;
      if (cleared && regiment.movementPhaseV063 === 'formed') {
        reformed = true;
        break;
      }
    }

    const restored = finalFormationOffsetsV063(regiment, 'line');
    const restoredSideways = roadInfantry.map(unit => restored.get(unit.id).oy);
    return {
      widthCases,
      roadFiles,
      chosen: (regiment.routeCrossingsV067 || []).map(item => item.id),
      bridge,
      cleared,
      reformed,
      waterEntries,
      steps,
      finalPhase: regiment.movementPhaseV063,
      finalFormation: regiment.formation,
      restoredSpan: Math.max(...restoredSideways) - Math.min(...restoredSideways)
    };
  });

  expect(result.widthCases).toEqual([
    { count: 12, files: 3 },
    { count: 20, files: 4 },
    { count: 36, files: 4 }
  ]);
  expect(result.roadFiles).toBe(4);
  expect(result.chosen).toEqual(['pont-crete']);
  expect(result.bridge).not.toBeNull();
  expect(result.bridge.inDeck).toBeGreaterThanOrEqual(8);
  expect(result.bridge.targetSpan).toBeLessThanOrEqual(20);
  expect(result.bridge.depth).toBeGreaterThan(125);
  expect(result.waterEntries).toBe(0);
  expect(result.cleared).toBe(true);
  expect(result.reformed).toBe(true);
  expect(result.finalPhase).toBe('formed');
  expect(result.finalFormation).toBe('line');
  expect(result.restoredSpan).toBeGreaterThan(150);
  expect(result.steps).toBeLessThan(6000);
  expect(errors).toEqual([]);
});
