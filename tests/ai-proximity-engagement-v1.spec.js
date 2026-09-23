const { test, expect } = require('@playwright/test');

async function openGame(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?test=v071', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(
    window.__AI_PROXIMITY_ENGAGEMENT_V1__ &&
    window.__AI_COMMANDER_V1__ &&
    window.NRTS?.subsystems.has('ai-proximity-engagement')
  ));
  return errors;
}

test('British regiments react to nearby French troops with stable contact hysteresis', async ({ page }) => {
  const errors = await openGame(page);
  const result = await page.evaluate(() => {
    // Isolate this scenario from the troops created by the normal reset flow.
    for (const unit of units) {
      if (unit.type !== 'worker') unit.dead = true;
    }
    for (const reg of regiments) reg.destroyed = true;

    function placeRegiment(reg, x, y) {
      const members = regimentMembers(reg);
      const center = centroid(members);
      const dx = x - center.x;
      const dy = y - center.y;
      for (const unit of members) {
        unit.x += dx;
        unit.y += dy;
        unit.targetX = unit.x;
        unit.targetY = unit.y;
      }
      reg.targetX = x;
      reg.targetY = y;
    }

    function makeRegimentAt(side, x, y) {
      const candidates = [];
      for (let i = 0; i < 12; i++) {
        candidates.push(createUnit(side, 'infantry', x + (i % 6) * 8, y + Math.floor(i / 6) * 8));
      }
      candidates.push(createUnit(side, 'officer', x, y + 22));
      candidates.push(createUnit(side, 'drummer', x - 14, y + 22));
      const reg = createRegiment(side, candidates);
      placeRegiment(reg, x, y);
      return reg;
    }

    const british = makeRegimentAt('britain', 1900, 900);
    const french = makeRegimentAt('france', 1540, 900);
    window.__AI_COMMANDER_V1__.forceState('DEFEND');

    const api = window.__AI_PROXIMITY_ENGAGEMENT_V1__;
    const initialBritishX = centroid(regimentMembers(british)).x;
    const firstEngaged = api.apply();
    const first = api.state().find(item => item.regimentId === british.id);
    const firstTargetX = british.targetX;

    // Once contact exists, 480 m remains engaged because the release radius is 520 m.
    placeRegiment(french, initialBritishX - 480, 900);
    const retainedEngaged = api.apply();
    const retained = api.state().find(item => item.regimentId === british.id);

    // Closing inside 260 m should make the regiment deploy from column to line.
    placeRegiment(french, initialBritishX - 220, 900);
    api.apply();
    const close = api.state().find(item => item.regimentId === british.id);

    // Beyond 520 m the local contact is released and the prior order is restored.
    placeRegiment(french, initialBritishX - 550, 900);
    const releasedEngaged = api.apply();
    const released = api.state().find(item => item.regimentId === british.id);
    const releasedTargetX = british.targetX;

    return {
      config: api.config,
      firstEngaged,
      first,
      firstTargetX,
      initialBritishX,
      retainedEngaged,
      retained,
      close,
      releasedEngaged,
      released,
      releasedTargetX
    };
  });

  expect(result.config.contactEnterRadius).toBe(430);
  expect(result.config.contactExitRadius).toBe(520);
  expect(result.config.scanInterval).toBe(1);
  expect(result.firstEngaged).toBe(1);
  expect(result.first.targetKey).toMatch(/^regiment:/);
  expect(result.first.distance).toBeLessThanOrEqual(430);
  expect(result.first.formation).toBe('column');
  expect(result.firstTargetX).toBeLessThan(result.initialBritishX);

  expect(result.retainedEngaged).toBe(1);
  expect(result.retained.targetKey).toBe(result.first.targetKey);
  expect(result.retained.distance).toBeGreaterThan(430);
  expect(result.retained.distance).toBeLessThanOrEqual(520);

  expect(result.close.formation).toBe('line');
  expect(result.releasedEngaged).toBe(0);
  expect(result.released.targetKey).toBeNull();
  expect(Math.abs(result.releasedTargetX - result.initialBritishX)).toBeLessThan(2);
  expect(errors).toEqual([]);
});

test('loose British combat troops also move toward a nearby French threat', async ({ page }) => {
  const errors = await openGame(page);
  const result = await page.evaluate(() => {
    for (const unit of units) {
      if (unit.type !== 'worker') unit.dead = true;
    }
    for (const reg of regiments) reg.destroyed = true;

    const british = createUnit('britain', 'infantry', 1900, 900);
    const french = createUnit('france', 'infantry', 1540, 900);
    british.targetX = british.x;
    british.targetY = british.y;
    window.__AI_COMMANDER_V1__.forceState('DEFEND');

    const api = window.__AI_PROXIMITY_ENGAGEMENT_V1__;
    const engaged = api.apply();
    const contact = api.looseState().find(item => item.unitId === british.id);
    const targetDuringContact = british.targetX;

    french.x = 1340;
    french.targetX = french.x;
    const releasedEngaged = api.apply();
    const released = api.looseState().find(item => item.unitId === british.id);

    return {
      engaged,
      contact,
      targetDuringContact,
      originalX: 1900,
      releasedEngaged,
      released,
      targetAfterRelease: british.targetX
    };
  });

  expect(result.engaged).toBe(1);
  expect(result.contact.targetKey).toMatch(/^unit:/);
  expect(result.contact.distance).toBeLessThanOrEqual(430);
  expect(result.targetDuringContact).toBeLessThan(result.originalX);
  expect(result.releasedEngaged).toBe(0);
  expect(result.released.targetKey).toBeNull();
  expect(result.targetAfterRelease).toBe(result.originalX);
  expect(errors).toEqual([]);
});
