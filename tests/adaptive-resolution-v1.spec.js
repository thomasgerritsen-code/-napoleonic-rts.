const { test, expect } = require('@playwright/test');

// The governor draws fewer pixels when frames run long, and more again with room.
test('adaptive resolution steps down on slow frames, reverts when it does not help, and steps back up', async ({ page }) => {
  await page.goto('/play.html?view=iso&mode=singleplayer&autores=1', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ADAPTIVE_RESOLUTION_V1__ && window.__MOBILE_RENDER_BUDGET_V1__);
  const r = await page.evaluate(() => {
    const gov = __ADAPTIVE_RESOLUTION_V1__, budget = __MOBILE_RENDER_BUDGET_V1__, canvas = document.getElementById('game');
    gov.setStep(0);
    const full = { w: canvas.width, dpr: budget.state().renderDpr };
    gov.judge(80);                       // slow: one step less sharp
    const down = { step: gov.state().step, w: canvas.width, dpr: budget.state().renderDpr };
    gov.judge(50);                       // much faster: the step helped, and still slow -> another
    const twice = gov.state().step;
    gov.judge(49);                       // barely faster: undo the last step and hold
    const reverted = gov.state();
    gov.judge(90);                       // holding: no step down while held
    const held = gov.state().step;
    return { full, down, twice, reverted, held, css: canvas.style.width };
  });
  expect(r.down.step).toBe(1);
  expect(r.down.w).toBeLessThan(r.full.w);
  expect(r.down.dpr).toBeCloseTo(r.full.dpr * 0.85, 1);
  expect(r.twice).toBe(2);
  expect(r.reverted.step).toBe(1);
  expect(r.reverted.reverted).toBe(1);
  expect(r.held).toBe(1);
  expect(r.css).toBe(`${await page.evaluate(() => Math.floor(innerWidth))}px`);

  // Room for four windows: one step sharper.
  const up = await page.evaluate(() => { const gov = __ADAPTIVE_RESOLUTION_V1__; gov.setStep(2); for (let i = 0; i < 4; i++) gov.judge(15); return gov.state().step; });
  expect(up).toBe(1);
});

test('automated browsers keep the fixed budget unless they ask for it', async ({ page }) => {
  await page.goto('/play.html?view=iso&mode=singleplayer', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ADAPTIVE_RESOLUTION_V1__);
  expect(await page.evaluate(() => __ADAPTIVE_RESOLUTION_V1__.state().enabled)).toBe(false);
});
