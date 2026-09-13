const { test, expect } = require('@playwright/test');

test('stuck recovery does not restart a battalion while it is forming its march column', async ({ page }) => {
  await page.addInitScript(() => {
    let seed = 1316;
    Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  });
  await page.goto('/?test=movement-coverage', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.RTS_SIM && window.__STUCK_RECOVERY_V2__?.formationPhaseIsolation));

  const result = await page.evaluate(() => {
    resetGame();
    v05PeaceMode = true;
    gameOver = false;
    for (const u of units) u.dead = true;
    for (const r of regiments) r.destroyed = true;

    const start = { x: 980, y: 980 };
    const made = [];
    for (let i = 0; i < 24; i++) made.push(createUnit('france', 'infantry', start.x + (i % 12) * 18, start.y + Math.floor(i / 12) * 18));
    made.push(createUnit('france', 'officer', start.x - 24, start.y));
    made.push(createUnit('france', 'drummer', start.x - 24, start.y + 22));
    const reg = createRegiment('france', made);

    const oldInf = TYPES.infantry.speed;
    const oldOfficer = TYPES.officer.speed;
    const oldDrummer = TYPES.drummer.speed;
    TYPES.infantry.speed = 0;
    TYPES.officer.speed = 0;
    TYPES.drummer.speed = 0;

    orderGroupPathV06(reg, start.x + 900, start.y + 260, 'line', 0);
    // This regression targets stuck-recovery ownership, not route-planner phase selection.
    // Force the public march state into the protected transition so the assertion stays
    // deterministic if the planner legitimately chooses a field-moving route here.
    reg.marchV063 = reg.marchV063 || {};
    reg.marchV063.phase = 'forming-column';
    const initialPhase = reg.marchV063.phase;
    for (let i = 0; i < 58; i++) window.RTS_SIM.step(.05);

    TYPES.infantry.speed = oldInf;
    TYPES.officer.speed = oldOfficer;
    TYPES.drummer.speed = oldDrummer;

    const stats = window.__STUCK_RECOVERY_V2__.stats();
    return {
      initialPhase,
      phase: reg.marchV063?.phase || reg.movementPhaseV063,
      replans: stats.groupReplans,
      formationIsolation: window.__STUCK_RECOVERY_V2__.formationPhaseIsolation,
      trafficYieldIsolation: window.__STUCK_RECOVERY_V2__.trafficYieldIsolation,
      nearTargetIsolation: window.__STUCK_RECOVERY_V2__.nearTargetIsolation,
      version: window.__STUCK_RECOVERY_V2__.version
    };
  });

  expect(result.initialPhase).toBe('forming-column');
  expect(result.replans).toBe(0);
  expect(result.formationIsolation).toBe(true);
  expect(result.trafficYieldIsolation).toBe(true);
  expect(result.nearTargetIsolation).toBe(true);
  expect(result.version).toBe('stuck-recovery-v2.2');
});
