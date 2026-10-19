const { test, expect } = require('@playwright/test');

async function phonePage(browser, viewport = { width: 844, height: 390 }) {
  const context = await browser.newContext({
    viewport,
    screen: viewport,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();
  return { context, page };
}

test('caps high-DPR phone backing store while preserving CSS viewport', async ({ browser }) => {
  const { context, page } = await phonePage(browser);
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
  expect(state.budget?.renderDpr).toBe(1.5);
  expect(state.budget?.nativeDpr).toBe(3);
  const priorCap2Pixels = Math.floor(state.width * 2) * Math.floor(state.height * 2);
  expect(state.budget?.backingPixels).toBeLessThan(priorCap2Pixels);
  expect(state.budget?.backingPixels / priorCap2Pixels).toBeLessThanOrEqual(0.563);
  expect(Math.abs(state.canvasCssWidth - state.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(state.canvasCssHeight - state.height)).toBeLessThanOrEqual(1);
  await context.close();
});

test('orientation resize reapplies budget without changing touch coordinate space', async ({ browser }) => {
  const { context, page } = await phonePage(browser);
  await page.goto('/?test');
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await page.evaluate(() => {
    const sx = 195;
    const sy = 422;
    // The game's actual camera may already have advanced during startup.
    // Verify a round-trip through the live camera instead of assuming the
    // historical reset coordinates are still its center.
    const before = window.__RTS_DEBUG__.worldToScreen(camera.x, camera.y);
    const canvas = document.getElementById('game');
    const rect = canvas.getBoundingClientRect();
    return {
      budget: window.__MOBILE_RENDER_BUDGET_V1__.state(),
      cameraCenter: before,
      cssPoint: { x: sx, y: sy },
      canvasRect: { width: rect.width, height: rect.height }
    };
  });

  expect(state.budget.reason).toBe('resize');
  expect(state.budget.renderDpr).toBe(1.5);
  // The public worldToScreen hook is the same coordinate path used by selection/rendering.
  // After portrait resize the live camera center must map to CSS viewport center,
  // independently of the lower backing-store DPR.
  expect(Math.abs(state.cameraCenter.x - state.cssPoint.x)).toBeLessThan(0.01);
  expect(Math.abs(state.cameraCenter.y - state.cssPoint.y)).toBeLessThan(0.01);
  expect(Math.abs(state.canvasRect.width - 390)).toBeLessThanOrEqual(1);
  expect(Math.abs(state.canvasRect.height - 844)).toBeLessThanOrEqual(1);
  await context.close();
});

test('large desktop is pixel-budgeted consistently by both 2D canvas owners', async ({ browser }) => {
  const viewport = { width: 1920, height: 1080 };
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2.5 });
  const page = await context.newPage();
  await page.goto('/?test');
  const state = await page.evaluate(() => {
    const budget = window.__MOBILE_RENDER_BUDGET_V1__;
    const main = document.getElementById('game');
    const staticCanvas = document.getElementById('game-static');
    return {
      budget: budget.state(),
      contract: budget.contract,
      effectiveDpr: budget.desiredDpr(),
      main: { width: main.width, height: main.height },
      staticCanvas: { width: staticCanvas.width, height: staticCanvas.height },
      cssWidth: main.getBoundingClientRect().width
    };
  });
  expect(state.budget.mobile).toBe(false);
  const expectedDpr = Math.sqrt(2200000 / (viewport.width * viewport.height));
  expect(state.effectiveDpr).toBeCloseTo(expectedDpr, 4);
  expect(state.budget.renderDpr).toBeCloseTo(expectedDpr, 4);
  expect(state.main.width).toBe(Math.floor(viewport.width * expectedDpr));
  expect(state.main.height).toBe(Math.floor(viewport.height * expectedDpr));
  expect(state.staticCanvas).toEqual(state.main);
  expect(state.main.width * state.main.height).toBeLessThanOrEqual(2200000);
  expect(state.cssWidth).toBe(viewport.width);
  await context.close();
});