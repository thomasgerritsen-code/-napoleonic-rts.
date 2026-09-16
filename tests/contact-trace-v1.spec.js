const { test, expect } = require('@playwright/test');

// MOVEMENT-CONTACT-V1 gameplay-side trace. This observes intent/state only;
// locomotion and formation execution remain owned by Movement/Simulation.
test('frontal contact trace exposes gameplay handoff and target-retention evidence', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?test=v071', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(
    window.__RTS_DEBUG__?.createFreshInfantryRegiment &&
    window.__AI_COMMANDER_V1__ &&
    window.__AI_ORDER_DISCIPLINE_V1322__
  ));

  const trace = await page.evaluate(() => {
    gameOver = false;
    v05PeaceMode = false;
    for (const u of units) {
      if (u.type === 'worker') continue;
      if (u.side === 'france') {
        u.x = 120; u.y = 120; u.targetX = 120; u.targetY = 120; u.morale = 100;
      }
    }
    const britishId = window.__RTS_DEBUG__.createFreshInfantryRegiment('britain', 2100, 900);
    const frenchId = window.__RTS_DEBUG__.createFreshInfantryRegiment('france', 2600, 900);
    const british = getRegiment(britishId), french = getRegiment(frenchId);
    for (const u of regimentMembers(british)) { u.morale = 100; u.hp = u.maxHp; }
    for (const u of regimentMembers(french)) { u.morale = 100; u.hp = u.maxHp; }

    const rows = [];
    for (let i = 0; i < 8; i++) {
      eval(`elapsed=${80 + i}`);
      window.__AI_COMMANDER_V1__.forceState(i < 2 ? 'ADVANCE' : 'ATTACK');
      aiMilitaryOrder();
      const bc = centroid(regimentMembers(british));
      const fc = centroid(regimentMembers(french));
      const state = window.__AI_COMMANDER_V1__.state();
      const discipline = window.__AI_ORDER_DISCIPLINE_V1322__.stats();
      rows.push({
        t: 80 + i,
        commanderState: state.state,
        targetKind: state.target?.kind || null,
        targetId: state.target?.id ?? null,
        targetDistance: Math.hypot(fc.x - bc.x, fc.y - bc.y),
        formation: british.formation,
        issuedFormation: british.aiOrderDisciplineV1322?.formation || null,
        orderSuppressed: discipline.suppressed,
        targetX: british.aiOrderDisciplineV1322?.requestedX ?? null,
        targetY: british.aiOrderDisciplineV1322?.requestedY ?? null
      });
    }
    v05PeaceMode = true;
    const switches = rows.slice(1).reduce((n, r, i) => n + (r.targetId !== rows[i].targetId ? 1 : 0), 0);
    const deployTransitions = rows.slice(1).reduce((n, r, i) => n + (r.issuedFormation !== rows[i].issuedFormation ? 1 : 0), 0);
    return { scenario: 'frontal-contact', rows, switches, deployTransitions };
  });

  console.log('MOVEMENT_CONTACT_TRACE ' + JSON.stringify(trace));
  expect(trace.rows.length).toBe(8);
  expect(trace.rows.some(r => r.commanderState === 'ATTACK')).toBe(true);
  expect(trace.rows.every(r => r.targetId !== null)).toBe(true);
  expect(trace.switches).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});
