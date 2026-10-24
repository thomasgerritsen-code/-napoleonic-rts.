const { test, expect } = require('@playwright/test');

test.describe.configure({ timeout: 90_000 });

async function openPhone(browser, viewport, query = 'view=iso') {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?' + query);
  await page.waitForFunction(() => window.__ISO_VIEW_V1__?.stats().ground && window.__ISO_VIEW_V1__.stats().workerSprites);
  return { context, page, errors };
}

async function visibleStart(page) {
  return page.evaluate(() => {
    const men = units.filter(u => !u.dead && u.side === 'france');
    const visible = men.filter(u => {
      const p = window.__ISO_VIEW_V1__.bodyOf(u);
      return document.elementFromPoint(p.x, p.y)?.id === 'game';
    });
    const home = buildings.find(b => b.side === 'france' && b.type === 'towncenter');
    const p = worldToScreen(home.x, home.y);
    return {
      total: men.length, visible: visible.length,
      workers: visible.filter(u => u.type === 'worker').length,
      infantry: visible.filter(u => u.type === 'infantry').length,
      cavalry: visible.filter(u => u.type === 'cavalry').length,
      homeVisible: document.elementFromPoint(p.x, p.y)?.id === 'game'
    };
  });
}

for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 640 }, { width: 844, height: 390 }]) {
  test(`iso mobile start shows the home base, peasants and soldiers at ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    const { context, page, errors } = await openPhone(browser, viewport);
    const start = await visibleStart(page);
    expect(start.visible).toBeGreaterThanOrEqual(start.total * 0.8);
    expect(start.workers).toBeGreaterThan(0);
    expect(start.infantry).toBeGreaterThan(0);
    expect(start.cavalry).toBeGreaterThan(0);
    expect(start.homeVisible).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
  });
}

test('iso mobile new battle restores the starting view after exploring', async ({ browser }) => {
  const { context, page, errors } = await openPhone(browser, { width: 390, height: 844 }, 'test=mobile-reset&view=iso');
  await page.evaluate(() => { camera.x = 4000; camera.y = 2400; camera.zoom = 1.1; });
  await page.locator('#mobileMenuBtn').click();
  await page.getByRole('button', { name: 'Nieuwe slag', exact: true }).click();
  // Close the menu to check actual canvas visibility, including the base.
  await page.locator('#mobileMenuBtn').click();
  const start = await visibleStart(page);
  expect(start.visible).toBeGreaterThanOrEqual(start.total * 0.8);
  expect(start.workers).toBeGreaterThan(0);
  expect(start.infantry).toBeGreaterThan(0);
  expect(start.homeVisible).toBe(true);
  expect(errors).toEqual([]);
  await context.close();
});

test('iso mobile camera stays where the player pans after boot', async ({ browser }) => {
  const { context, page, errors } = await openPhone(browser, { width: 390, height: 844 });
  await page.evaluate(() => { camera.x = 2400; camera.y = 1900; camera.zoom = 0.9; });
  await page.waitForTimeout(1200);
  const position = await page.evaluate(() => ({ ...camera }));
  expect(position.x).toBeCloseTo(2400, 2);
  expect(position.y).toBeCloseTo(1900, 2);
  expect(position.zoom).toBeCloseTo(0.9, 2);
  expect(errors).toEqual([]);
  await context.close();
});
