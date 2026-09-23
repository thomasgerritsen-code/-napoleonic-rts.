const { test, expect } = require('@playwright/test');

async function bootPhone(page) {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/?test');
  await page.waitForFunction(() => window.RTS_SIM && window.__OFFICER_REGIMENT_MOBILE_V1__);
}

test('one selected officer can automatically form a regiment', async ({ page }) => {
  await bootPhone(page);

  const officer = await page.evaluate(() => {
    const unit = window.RTS_SIM.snapshot().units.find(u => u.side === 'france' && u.type === 'officer' && !u.regimentId);
    if (!unit) return null;
    window.RTS_SIM.dispatch({ type: 'select-point', x: unit.x, y: unit.y });
    return { id: unit.id };
  });
  expect(officer).not.toBeNull();

  const selectedBefore = await page.evaluate(() => window.RTS_SIM.snapshot().selection.unitIds);
  expect(selectedBefore).toEqual([officer.id]);

  const createButton = page.locator('#actions [data-action="create-regiment"]');
  await expect(createButton).toBeVisible();
  await expect(createButton).toBeEnabled();
  await expect(createButton).toContainText('Maak regiment');
  await expect(createButton).toContainText('auto');

  const draft = await page.evaluate(() => window.__OFFICER_REGIMENT_MOBILE_V1__.draft());
  expect(draft?.officerId).toBe(officer.id);
  expect(draft?.infantryIds).toHaveLength(12);
  expect(draft?.drummerId).not.toBeNull();
  expect(draft?.canCreate).toBe(true);

  await createButton.click();
  const result = await page.evaluate(() => {
    const snap = window.RTS_SIM.snapshot();
    const regiment = snap.groups.find(group => !group.destroyed && group.members.some(member => member.id === snap.selection.unitIds[0]));
    return { snap, regiment };
  });

  expect(result.regiment).toBeTruthy();
  expect(result.regiment.members.filter(member => member.type === 'infantry')).toHaveLength(12);
  expect(result.regiment.members.some(member => member.type === 'officer' && member.id === officer.id)).toBe(true);
  expect(result.regiment.members.some(member => member.type === 'drummer')).toBe(true);
  expect(result.snap.selection.unitIds).toHaveLength(14);
});

test('a loose officer is tappable directly in the 3D mobile battlefield', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true
  });
  const page = await context.newPage();
  await page.goto('/?test');
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_V1__?.enabled?.(), null, { timeout: 20000 });
  await page.waitForFunction(() => window.__OFFICER_REGIMENT_MOBILE_V1__?.threeDReady?.(), null, { timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.__OFFICER_REGIMENT_MOBILE_V1__?.screenPointForOfficer?.()), null, { timeout: 20000 });

  const target = await page.evaluate(() => window.__OFFICER_REGIMENT_MOBILE_V1__.screenPointForOfficer());
  expect(target).not.toBeNull();

  await page.locator('#battlefield3d').evaluate((canvas, target) => {
    const emit = (type, buttons) => canvas.dispatchEvent(new PointerEvent(type, {
      pointerType: 'touch',
      pointerId: 71,
      isPrimary: true,
      button: 0,
      buttons,
      clientX: target.x,
      clientY: target.y,
      bubbles: true,
      cancelable: true
    }));
    emit('pointerdown', 1);
    emit('pointerup', 0);
  }, target);

  const result = await page.evaluate(() => ({
    selected: window.RTS_SIM.snapshot().selection.unitIds,
    claimedTaps: window.__OFFICER_REGIMENT_MOBILE_V1__.threeDClaimedTaps,
    buttonDisabled: document.querySelector('#actions [data-action="create-regiment"]')?.disabled ?? true
  }));

  expect(result.selected).toEqual([target.id]);
  expect(result.claimedTaps).toBe(1);
  expect(result.buttonDisabled).toBe(false);
  await context.close();
});
