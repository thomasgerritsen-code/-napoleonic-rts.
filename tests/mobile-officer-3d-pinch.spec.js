const { test, expect } = require('@playwright/test');

test('3D iPhone two-finger gesture starting over a selected loose French officer zooms without a ghost march', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true
  });
  try {
    const page = await context.newPage();
    await page.goto('/?test=3d');
    await page.waitForFunction(() => window.__BATTLEFIELD_3D_V1__?.enabled?.(), null, { timeout: 20000 });
    await page.waitForFunction(() => window.__OFFICER_REGIMENT_MOBILE_V1__?.threeDReady?.(), null, { timeout: 20000 });
    const officerId = await page.evaluate(() => {
      const source = window.NRTS_3D_SOURCE;
      const officer = source.snapshot().units.find(u => u.side === 'france' && u.type === 'officer' && !u.regimentId);
      if (!officer) return null;
      const camera = source.camera();
      source.panCamera(officer.x - camera.x, officer.y - camera.y);
      return officer.id;
    });
    expect(officerId).not.toBeNull();
    await page.waitForFunction(id => Boolean(window.__OFFICER_REGIMENT_MOBILE_V1__.screenPointForOfficer(id)), officerId, { timeout: 20000 });
    const officer = await page.evaluate(id => window.__OFFICER_REGIMENT_MOBILE_V1__.screenPointForOfficer(id), officerId);
    expect(officer).toBeTruthy();
    await page.touchscreen.tap(officer.x, officer.y);
    await expect.poll(() => page.evaluate(() => window.RTS_SIM.snapshot().selection.unitIds)).toEqual([officerId]);

    const before = await page.evaluate(id => {
      const unit = window.RTS_SIM.snapshot().units.find(u => u.id === id);
      return {
        cameraDistance: window.__BATTLEFIELD_3D_V1__.diagnostics().cameraDistance,
        targetX: unit.targetX, targetY: unit.targetY,
        selected: window.RTS_SIM.snapshot().selection.unitIds
      };
    }, officerId);

    const otherX = officer.x < 600 ? officer.x + 120 : officer.x - 120;
    const direction = otherX > officer.x ? 1 : -1;
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
      { id: 21, x: officer.x, y: officer.y },
      { id: 22, x: otherX, y: officer.y }
    ] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [
      { id: 21, x: officer.x - direction * 35, y: officer.y - 10 },
      { id: 22, x: otherX + direction * 45, y: officer.y + 10 }
    ] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    const after = await page.evaluate(id => {
      const unit = window.RTS_SIM.snapshot().units.find(u => u.id === id);
      return {
        cameraDistance: window.__BATTLEFIELD_3D_V1__.diagnostics().cameraDistance,
        targetX: unit.targetX, targetY: unit.targetY,
        selected: window.RTS_SIM.snapshot().selection.unitIds
      };
    }, officerId);

    // A real two-finger camera gesture must never turn into the second finger's march.
    expect(after.cameraDistance).not.toBe(before.cameraDistance);
    expect(after.targetX).toBe(before.targetX);
    expect(after.targetY).toBe(before.targetY);
    expect(after.selected).toEqual(before.selected);
  } finally {
    await context.close();
  }
});
