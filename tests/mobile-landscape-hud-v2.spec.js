const { test, expect } = require('@playwright/test');

test('short landscape phone keeps HUD compact and commands usable', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/?test');
  await page.waitForFunction(() => window.RTS_SIM);

  const metrics = await page.evaluate(() => {
    const topbar = document.querySelector('.topbar');
    const bottombar = document.querySelector('.bottombar');
    const actions = document.querySelector('#actions');
    const selectionTitle = document.querySelector('#selectionTitle');
    const selectionDetails = document.querySelector('#selectionDetails');
    const armyCounts = document.querySelector('.army-counts');
    const topRect = topbar.getBoundingClientRect();
    const bottomRect = bottombar.getBoundingClientRect();
    const actionStyle = getComputedStyle(actions);
    const buttonHeights = [...actions.querySelectorAll('button')].map(button => button.getBoundingClientRect().height);

    return {
      topHeight: topRect.height,
      bottomHeight: bottomRect.height,
      occupiedRatio: (topRect.height + bottomRect.height) / innerHeight,
      detailsDisplay: getComputedStyle(selectionDetails).display,
      armyDisplay: getComputedStyle(armyCounts).display,
      titleDisplay: getComputedStyle(selectionTitle).display,
      actionsOverflowX: actionStyle.overflowX,
      minButtonHeight: Math.min(...buttonHeights)
    };
  });

  expect(metrics.bottomHeight).toBeLessThanOrEqual(52);
  expect(metrics.occupiedRatio).toBeLessThan(0.25);
  expect(metrics.detailsDisplay).toBe('none');
  expect(metrics.armyDisplay).toBe('none');
  expect(metrics.titleDisplay).not.toBe('none');
  expect(metrics.actionsOverflowX).toBe('auto');
  expect(metrics.minButtonHeight).toBeGreaterThanOrEqual(43);

  const officerId = await page.evaluate(() => {
    const officer = window.RTS_SIM.snapshot().units.find(unit => unit.side === 'france' && unit.type === 'officer' && !unit.regimentId);
    if (!officer) return null;
    window.RTS_SIM.dispatch({ type: 'select-point', x: officer.x, y: officer.y });
    return officer.id;
  });
  expect(officerId).not.toBeNull();

  await expect(page.locator('#selectionTitle')).toContainText('Officier');
  const createRegiment = page.locator('#actions [data-action="create-regiment"]');
  await expect(createRegiment).toBeVisible();
  await expect(createRegiment).toBeEnabled();
  await createRegiment.scrollIntoViewIfNeeded();
  await expect(createRegiment).toBeVisible();
});