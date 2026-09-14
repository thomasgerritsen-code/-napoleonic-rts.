const { test, expect, devices } = require('@playwright/test');

const iphone = devices['iPhone 13'];

test.describe('mobile render budget', () => {
  test.use({ ...iphone, viewport: { width: 844, height: 390 } });

  test('caps high-DPR phone backing store while preserving CSS viewport', async ({ page }) => {
    await page.goto('/?test');
    const state = await page.evaluate(() => ({
      budget: window.__MOBILE_RENDER_BUDGET_V1__?.state?.(),
      contract: window.__MOBILE_RENDER_BUDGET_V1__?.contract,
      width: innerWidth,
      height: innerHeight,
      canvasCssWidth: document.getElementById('game').getBoundingClientRect().width,
      canvasCssHeight: document.getElementById('game').getBoundingClientRect().height
    }));

    expect(state.contract?.mobileDprCap).toBe(1.5);
    expect(state.budget?.mobile).toBe(true);
    expect(state.budget?.renderDpr).toBeLessThanOrEqual(1.5);
    expect(state.budget?.nativeDpr).toBeGreaterThan(1.5);
    expect(state.budget?.backingPixels).toBeLessThanOrEqual(Math.floor(state.width * 1.5) * Math.floor(state.height * 1.5));
    expect(Math.abs(state.canvasCssWidth - state.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(state.canvasCssHeight - state.height)).toBeLessThanOrEqual(1);
  });

  test('orientation resize reapplies budget without changing touch coordinate space', async ({ page }) => {
    await page.goto('/?test');
    await page.setViewportSize({ width: 390, height: 844 });
    const state = await page.evaluate(() => ({
      budget: window.__MOBILE_RENDER_BUDGET_V1__.state(),
      world: window.__RTS_DEBUG__.screenToWorld(195, 422),
      roundTrip: (() => {
        const world = window.__RTS_DEBUG__.screenToWorld(195, 422);
        return window.__RTS_DEBUG__.worldToScreen(world.x, world.y);
      })()
    }));

    expect(state.budget.reason).toBe('resize');
    expect(state.budget.renderDpr).toBeLessThanOrEqual(1.5);
    expect(Math.abs(state.roundTrip.x - 195)).toBeLessThan(0.01);
    expect(Math.abs(state.roundTrip.y - 422)).toBeLessThan(0.01);
  });
});

test('desktop keeps existing DPR ceiling', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2.5 });
  const page = await context.newPage();
  await page.goto('/?test');
  const state = await page.evaluate(() => window.__MOBILE_RENDER_BUDGET_V1__?.state?.());
  expect(state.mobile).toBe(false);
  expect(state.renderDpr).toBe(2);
  await context.close();
});