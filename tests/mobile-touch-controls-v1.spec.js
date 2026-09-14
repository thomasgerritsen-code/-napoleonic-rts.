const { test, expect } = require('@playwright/test');

async function pointer(page, type, id, x, y) {
  await page.locator('#game').evaluate((canvas, data) => {
    const event = new PointerEvent(data.type, {
      bubbles: true,
      cancelable: true,
      pointerId: data.id,
      pointerType: 'touch',
      isPrimary: data.id === 1,
      button: 0,
      buttons: data.type === 'pointerup' ? 0 : 1,
      clientX: data.x,
      clientY: data.y
    });
    canvas.dispatchEvent(event);
  }, { type, id, x, y });
}

async function worldToScreen(page, x, y) {
  return page.evaluate(({ x, y }) => window.__RTS_DEBUG__.worldToScreen(x, y), { x, y });
}

test('mobile landscape touch supports selection, move/facing orders and pinch camera without ghost orders', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/?test');
  await expect(page.locator('#game')).toBeVisible();

  const contract = await page.evaluate(() => window.__PLAYABILITY_CONTROLS_V1__?.contract);
  expect(contract?.mobileTouchVerticalSlice).toBe(true);
  expect(contract?.mobileTwoFingerCamera).toBe(true);

  const overflow = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.width);

  const infantry = await worldToScreen(page, 700, 1010);
  await pointer(page, 'pointerdown', 1, infantry.x, infantry.y);
  await pointer(page, 'pointerup', 1, infantry.x, infantry.y);
  const selectedAfterTap = await page.evaluate(() => window.__RTS_DEBUG__.getState().selected.length);
  expect(selectedAfterTap).toBeGreaterThan(0);

  const moveTarget = await worldToScreen(page, 1120, 920);
  await pointer(page, 'pointerdown', 1, moveTarget.x, moveTarget.y);
  await pointer(page, 'pointerup', 1, moveTarget.x, moveTarget.y);

  const facingTarget = await worldToScreen(page, 1240, 920);
  await pointer(page, 'pointerdown', 1, facingTarget.x, facingTarget.y);
  await pointer(page, 'pointermove', 1, facingTarget.x + 90, facingTarget.y + 35);
  await pointer(page, 'pointerup', 1, facingTarget.x + 90, facingTarget.y + 35);

  const beforeCamera = await page.evaluate(() => window.__PLAYABILITY_CONTROLS_V1__.mobile.state().camera);
  await pointer(page, 'pointerdown', 1, 300, 180);
  await pointer(page, 'pointerdown', 2, 500, 180);
  await pointer(page, 'pointermove', 1, 260, 160);
  await pointer(page, 'pointermove', 2, 560, 200);
  await pointer(page, 'pointerup', 2, 560, 200);
  await pointer(page, 'pointerup', 1, 260, 160);
  const mobileState = await page.evaluate(() => window.__PLAYABILITY_CONTROLS_V1__.mobile.state());

  expect(mobileState.moveOrders).toBe(1);
  expect(mobileState.facingOrders).toBe(1);
  expect(mobileState.cameraGestures).toBeGreaterThan(0);
  expect(mobileState.ghostOrdersSuppressed).toBeGreaterThanOrEqual(2);
  expect(mobileState.camera.zoom).not.toBe(beforeCamera.zoom);
  expect(mobileState.moveOrders + mobileState.facingOrders).toBe(2);

  const formationDragOrders = await page.evaluate(() => window.__FORMATION_DRAG_V1__?.state?.().orders ?? 0);
  expect(formationDragOrders).toBe(0);
});

test('mobile portrait remains inside viewport and keeps touch targets usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?test');
  const layout = await page.evaluate(() => {
    const actions = [...document.querySelectorAll('#actions button')].map(button => {
      const rect = button.getBoundingClientRect();
      return { width: rect.width, height: rect.height, right: rect.right, left: rect.left };
    });
    return {
      viewportWidth: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      actions
    };
  });
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.actions.length).toBeGreaterThan(0);
  for (const button of layout.actions) {
    expect(button.height).toBeGreaterThanOrEqual(44);
    expect(button.width).toBeGreaterThanOrEqual(44);
  }
});