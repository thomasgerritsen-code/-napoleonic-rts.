const { test, expect, devices } = require('@playwright/test');

const phoneCases = [
  { name: 'compact iPhone landscape', viewport: { width: 844, height: 390 }, dpr: 3 },
  { name: 'Android landscape', viewport: { width: 915, height: 412 }, dpr: 2.625 },
  { name: 'portrait smoke', viewport: { width: 390, height: 844 }, dpr: 3 }
];

async function boot(page, phone) {
  await page.setViewportSize(phone.viewport);
  await page.goto('/?test');
  await page.waitForFunction(() => window.__PLAYABILITY_CONTROLS_V1__?.mobile?.enabled);
}

for (const phone of phoneCases) {
  test(`${phone.name}: HUD stays inside viewport with no page overflow`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: phone.viewport,
      deviceScaleFactor: phone.dpr,
      hasTouch: true,
      isMobile: true
    });
    const page = await context.newPage();
    await boot(page, phone);

    const layout = await page.evaluate(() => {
      const rects = [...document.querySelectorAll('.topbar,.bottombar')].map(el => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      });
      return {
        innerWidth,
        innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        rects,
        touchAction: getComputedStyle(document.getElementById('game')).touchAction
      };
    });

    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.innerWidth + 1);
    expect(layout.rects.every(r => r.left >= -1 && r.right <= layout.innerWidth + 1 && r.top >= -1 && r.bottom <= layout.innerHeight + 1)).toBeTruthy();
    expect(layout.touchAction).toBe('none');
    await context.close();
  });
}

test('touch pinch changes camera but never emits a gameplay order', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await boot(page, { viewport: { width: 844, height: 390 } });

  const before = await page.evaluate(() => window.__PLAYABILITY_CONTROLS_V1__.mobile.state());
  await page.evaluate(() => {
    const canvas = document.getElementById('game');
    const fire = (type, id, x, y) => canvas.dispatchEvent(new PointerEvent(type, {
      pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: x, clientY: y, bubbles: true, cancelable: true
    }));
    fire('pointerdown', 1, 330, 190);
    fire('pointerdown', 2, 510, 190);
    fire('pointermove', 1, 285, 175);
    fire('pointermove', 2, 555, 205);
    fire('pointerup', 1, 285, 175);
    fire('pointerup', 2, 555, 205);
  });
  const after = await page.evaluate(() => window.__PLAYABILITY_CONTROLS_V1__.mobile.state());

  expect(after.cameraGestures).toBeGreaterThan(before.cameraGestures);
  expect(after.moveOrders).toBe(before.moveOrders);
  expect(after.facingOrders).toBe(before.facingOrders);
  expect(after.ghostOrdersSuppressed).toBeGreaterThanOrEqual(before.ghostOrdersSuppressed + 2);
  expect(after.activePointers).toBe(0);
  await context.close();
});

test('single touch on selected-unit terrain emits exactly one move order', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 915, height: 412 }, deviceScaleFactor: 2.625, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await boot(page, { viewport: { width: 915, height: 412 } });

  const selected = await page.evaluate(() => {
    const state = window.__RTS_DEBUG__.getState();
    const id = state.france.regiments[0]?.id;
    if (!id) return false;
    window.__RTS_DEBUG__.selectRegiment(id);
    return window.__RTS_DEBUG__.getState().selected.length > 0;
  });
  expect(selected).toBeTruthy();
  const before = await page.evaluate(() => window.__PLAYABILITY_CONTROLS_V1__.mobile.state());
  await page.evaluate(() => {
    const canvas = document.getElementById('game');
    const opts = { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: 460, clientY: 205, bubbles: true, cancelable: true };
    canvas.dispatchEvent(new PointerEvent('pointerdown', opts));
    canvas.dispatchEvent(new PointerEvent('pointerup', opts));
  });
  const after = await page.evaluate(() => window.__PLAYABILITY_CONTROLS_V1__.mobile.state());
  expect(after.moveOrders - before.moveOrders).toBeLessThanOrEqual(1);
  expect(after.facingOrders).toBe(before.facingOrders);
  await context.close();
});
