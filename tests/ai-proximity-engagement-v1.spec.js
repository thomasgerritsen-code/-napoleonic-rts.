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
      reg.path = null;
      reg.finalTarget = null;
      reg.finalFacing = null;
    }

    // Build a minimal valid runtime regiment directly. This avoids legacy wrappers
    // around createRegiment changing the setup of this isolated AI test.
    function makeRegimentAt(side, x, y) {
      const infantry = [];
      for (let i = 0; i < 12; i++) {
        infantry.push(createUnit(side, 'infantry', x + (i % 6) * 8, y + Math.floor(i / 6) * 8));
      }
      const officer = createUnit(side, 'officer', x, y + 22);
      const drummer = createUnit(side, 'drummer', x - 14, y + 22);
      const members = [...infantry, officer, drummer];
      const reg = {
        id: nextRegimentId++,
        side,
        name: `${side === 'france' ? 'Frans' : 'Brits'} proximity test regiment`,
        memberIds: members.map(unit => unit.id),
        officerId: officer.id,
        drummerId: drummer.id,
        formation: 'line',
        facing: side === 'france' ? 0 : Math.PI,
        morale: 100,
        destroyed: false,
        targetX: x,
        targetY: y,
        formedAt: elapsed,
        formedInfantryCount: infantry.length
      };
      members.forEach(unit => { unit.regimentId = reg.id; });
      regiments.push(reg);
      placeRegiment(reg, x, y);
      return reg;
    }

    const british = makeRegimentAt('britain', 1900, 900);
    const french = makeRegimentAt('france', 1540, 900);
    window.__AI_COMMANDER_V1__.forceState('DEFEND');

    // Give the regiment a real strategic path before local contact interrupts it.
    // The proximity system must remember the final destination, not the current waypoint.
    const strategicTargetX = 2300;
    orderGroupPathV06(british, strategicTargetX, 900, 'line', Math.PI);

    const api = window.__AI_PROXIMITY_ENGAGEMENT_V1__;
    const initialBritishX = centroid(regimentMembers(british)).x;
    const firstEngaged = api.apply();
    const first = api.state().find(item => item.regimentId === british.id);
    const firstContactFinalX = british.finalTarget?.x ?? null;
    const firstContactPath = british.path;

    // Re-scanning an unchanged contact must not restart the route from waypoint zero.
    const repeatedEngaged = api.apply();
    const repeated = api.state().find(item => item.regimentId === british.id);
    const sameContactPathPreserved = british.path === firstContactPath;

    // Once contact exists, 480 m remains engaged because the release radius is 520 m.
    placeRegiment(french, initialBritishX - 480, 900);
    const retainedEngaged = api.apply();
    const retained = api.state().find(item => item.regimentId === british.id);

    // Closing inside 260 m should make the regiment deploy from column to line.
    placeRegiment(french, initialBritishX - 220, 900);
    api.apply();
    const close = api.state().find(item => item.regimentId === british.id);

    // Beyond 520 m the local contact is released and the original strategic order is restored.
    placeRegiment(french, initialBritishX - 550, 900);
    const releasedEngaged = api.apply();
    const released = api.state().find(item => item.regimentId === british.id);
    const releasedFinalX = british.finalTarget?.x ?? null;

    return {
      config: api.config,
      firstEngaged,
      first,
      firstContactFinalX,
      initialBritishX,
      repeatedEngaged,
      repeated,
      sameContactPathPreserved,
      retainedEngaged,
      retained,
      close,
      releasedEngaged,
      released,
      releasedFinalX,
      releasedFormation: british.formation,
      strategicTargetX
    };
  });

  expect(result.config.contactEnterRadius).toBe(430);
  expect(result.config.contactExitRadius).toBe(520);
  expect(result.config.scanInterval).toBe(1);
  expect(result.firstEngaged).toBe(1);
  expect(result.first.targetKey).toMatch(/^regiment:/);
  expect(result.first.distance).toBeLessThanOrEqual(430);
  expect(result.first.formation).toBe('column');
  expect(result.first.commandTarget.x).toBeLessThan(result.initialBritishX);
  expect(result.firstContactFinalX).toBeCloseTo(result.first.commandTarget.x, 5);

  expect(result.repeatedEngaged).toBe(1);
  expect(result.repeated.targetKey).toBe(result.first.targetKey);
  expect(result.sameContactPathPreserved).toBe(true);

  expect(result.retainedEngaged).toBe(1);
  expect(result.retained.targetKey).toBe(result.first.targetKey);
  expect(result.retained.distance).toBeGreaterThan(430);
  expect(result.retained.distance).toBeLessThanOrEqual(520);

  expect(result.close.formation).toBe('line');
  expect(result.releasedEngaged).toBe(0);
  expect(result.released.targetKey).toBeNull();
  expect(result.releasedFinalX).toBeCloseTo(result.strategicTargetX, 5);
  expect(result.releasedFormation).toBe('line');
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

test('RETREAT cancels local proximity aggression and restores the prior loose-unit order', async ({ page }) => {
  const errors = await openGame(page);
  const result = await page.evaluate(() => {
    for (const unit of units) {
      if (unit.type !== 'worker') unit.dead = true;
    }
    for (const reg of regiments) reg.destroyed = true;

    const british = createUnit('britain', 'infantry', 1900, 900);
    createUnit('france', 'infantry', 1540, 900);
    const strategicTargetX = 2200;
    british.targetX = strategicTargetX;
    british.targetY = british.y;
    window.__AI_COMMANDER_V1__.forceState('DEFEND');

    const api = window.__AI_PROXIMITY_ENGAGEMENT_V1__;
    const engagedBeforeRetreat = api.apply();
    const contactTargetX = british.targetX;

    window.__AI_COMMANDER_V1__.forceState('RETREAT');
    const engagedDuringRetreat = api.apply();
    const contact = api.looseState().find(item => item.unitId === british.id);

    return {
      engagedBeforeRetreat,
      contactTargetX,
      strategicTargetX,
      engagedDuringRetreat,
      restoredTargetX: british.targetX,
      targetKey: contact?.targetKey ?? null
    };
  });

  expect(result.engagedBeforeRetreat).toBe(1);
  expect(result.contactTargetX).toBeLessThan(1900);
  expect(result.engagedDuringRetreat).toBe(0);
  expect(result.targetKey).toBeNull();
  expect(result.restoredTargetX).toBe(result.strategicTargetX);
  expect(errors).toEqual([]);
});
