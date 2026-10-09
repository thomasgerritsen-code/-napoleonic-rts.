const { test, expect } = require('@playwright/test');

test('iPhone: officer tap -> 12 musketeers and drummer -> one march -> two-finger camera without ghost selection/orders', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true
  });
  try {
    const page = await context.newPage();
    await page.goto('/?test');
    await page.waitForFunction(() => window.RTS_SIM && window.__OFFICER_REGIMENT_MOBILE_V1__ && window.__PLAYABILITY_CONTROLS_V1__?.mobile);

    const officer = await page.evaluate(() => {
      const unit = window.RTS_SIM.snapshot().units.find(u => u.side === 'france' && u.type === 'officer' && !u.regimentId);
      return unit && { id: unit.id, ...window.__RTS_DEBUG__.worldToScreen(unit.x, unit.y) };
    });
    expect(officer).toBeTruthy();
    expect(officer.x).toBeGreaterThan(0);
    expect(officer.x).toBeLessThan(844);
    expect(officer.y).toBeGreaterThan(50);
    expect(officer.y).toBeLessThan(300);

    // Use actual browser touchscreen input instead of calling select-point directly.
    await page.touchscreen.tap(officer.x, officer.y);
    await expect.poll(() => page.evaluate(() => window.RTS_SIM.snapshot().selection.unitIds)).toEqual([officer.id]);

    const create = page.locator('#actions [data-action="create-regiment"]');
    await expect(create).toBeEnabled();
    await create.tap();
    const members = await page.evaluate(id => {
      const group = window.RTS_SIM.snapshot().groups.find(g => !g.destroyed && g.members.some(u => u.id === id));
      return group?.members.map(u => ({ id: u.id, type: u.type })) || [];
    }, officer.id);
    expect(members.filter(u => u.type === 'infantry')).toHaveLength(12);
    expect(members.filter(u => u.type === 'drummer')).toHaveLength(1);
    expect(members.filter(u => u.type === 'officer')).toHaveLength(1);

    const marchPoint = await page.evaluate(() => {
      for (const [x, y] of [[650, 205], [680, 165], [580, 180], [720, 205]]) {
        const w = screenToWorld(x, y);
        if (!unitAt(w.x, w.y, 'france') && !buildingAt(w.x, w.y, 'france') && !resourceAt(w.x, w.y)) return { x, y };
      }
      return null;
    });
    expect(marchPoint).not.toBeNull();
    const beforeMarch = await page.evaluate(() => window.__PLAYABILITY_CONTROLS_V1__.mobile.state());
    await page.touchscreen.tap(marchPoint.x, marchPoint.y);
    const afterMarch = await page.evaluate(() => window.__PLAYABILITY_CONTROLS_V1__.mobile.state());
    expect(afterMarch.moveOrders - beforeMarch.moveOrders).toBe(1);
    expect(afterMarch.facingOrders - beforeMarch.facingOrders).toBe(0);

    const before = await page.evaluate(() => ({
      mobile: window.__PLAYABILITY_CONTROLS_V1__.mobile.state(),
      formation: window.__FORMATION_DRAG_V1__.state(),
      selection: window.RTS_SIM.snapshot().selection.unitIds
    }));

    // CDP multi-touch injects genuine browser touch/pointer sequences in mobile Chromium.
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
      { x: 300, y: 170, id: 41 }, { x: 500, y: 170, id: 42 }
    ] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [
      { x: 267, y: 154, id: 41 }, { x: 557, y: 192, id: 42 }
    ] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    const after = await page.evaluate(() => ({
      mobile: window.__PLAYABILITY_CONTROLS_V1__.mobile.state(),
      formation: window.__FORMATION_DRAG_V1__.state(),
      selection: window.RTS_SIM.snapshot().selection.unitIds
    }));
    expect(after.mobile.cameraGestures).toBeGreaterThan(before.mobile.cameraGestures);
    expect(after.mobile.camera.zoom).not.toBe(before.mobile.camera.zoom);
    expect(after.mobile.camera.x).not.toBe(before.mobile.camera.x);
    expect(after.mobile.moveOrders - before.mobile.moveOrders).toBe(0);
    expect(after.mobile.facingOrders - before.mobile.facingOrders).toBe(0);
    expect(after.mobile.ghostOrdersSuppressed - before.mobile.ghostOrdersSuppressed).toBeGreaterThanOrEqual(2);
    expect(after.mobile.activePointers).toBe(0);
    expect(after.selection).toEqual(before.selection);
    expect(after.formation.selections - before.formation.selections).toBe(0);
    expect(after.formation.orders - before.formation.orders).toBe(0);
  } finally {
    await context.close();
  }
});
