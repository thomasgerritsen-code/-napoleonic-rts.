const { test, expect } = require('@playwright/test');

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

async function touchSequence(page, events) {
  await page.evaluate(sequence => {
    const canvas = document.getElementById('game');
    for (const event of sequence) {
      canvas.dispatchEvent(new PointerEvent(event.type, {
        pointerId: event.id,
        pointerType: 'touch',
        isPrimary: event.primary !== false,
        clientX: event.x,
        clientY: event.y,
        bubbles: true,
        cancelable: true
      }));
    }
  }, events);
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

test('single touch selects a French battlefield unit', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await boot(page, { viewport: { width: 844, height: 390 } });

  const target = await page.evaluate(() => {
    const unit = window.RTS_SIM.snapshot().units.find(u => u.side === 'france' && u.type === 'infantry' && !u.regimentId);
    if (!unit) return null;
    return { id: unit.id, ...window.__RTS_DEBUG__.worldToScreen(unit.x, unit.y) };
  });
  expect(target).not.toBeNull();

  const before = await page.evaluate(() => window.__PLAYABILITY_CONTROLS_V1__.mobile.state());
  await touchSequence(page, [
    { type: 'pointerdown', id: 10, x: target.x, y: target.y },
    { type: 'pointerup', id: 10, x: target.x, y: target.y }
  ]);
  const result = await page.evaluate(() => ({
    selection: window.RTS_SIM.snapshot().selection.unitIds,
    mobile: window.__PLAYABILITY_CONTROLS_V1__.mobile.state()
  }));

  expect(result.selection).toContain(target.id);
  expect(result.mobile.taps - before.taps).toBe(1);
  expect(result.mobile.moveOrders).toBe(before.moveOrders);
  await context.close();
});

test('touch box selects multiple units and a later tap replaces that selection', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 915, height: 412 }, deviceScaleFactor: 2.625, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await boot(page, { viewport: { width: 915, height: 412 } });

  const targets = await page.evaluate(() => {
    const snap = window.RTS_SIM.snapshot();
    const infantry = snap.units.filter(u => u.side === 'france' && u.type === 'infantry' && !u.regimentId);
    const worker = snap.units.find(u => u.side === 'france' && u.type === 'worker');
    if (!infantry.length || !worker) return null;
    const screens = infantry.map(u => window.__RTS_DEBUG__.worldToScreen(u.x, u.y));
    const xs = screens.map(p => p.x), ys = screens.map(p => p.y);
    return {
      box: { x1: Math.min(...xs) - 16, y1: Math.min(...ys) - 16, x2: Math.max(...xs) + 16, y2: Math.max(...ys) + 16 },
      worker: { id: worker.id, ...window.__RTS_DEBUG__.worldToScreen(worker.x, worker.y) }
    };
  });
  expect(targets).not.toBeNull();

  const before = await page.evaluate(() => window.__PLAYABILITY_CONTROLS_V1__.mobile.state());
  await touchSequence(page, [
    { type: 'pointerdown', id: 20, x: targets.box.x1, y: targets.box.y1 },
    { type: 'pointermove', id: 20, x: targets.box.x2, y: targets.box.y2 },
    { type: 'pointerup', id: 20, x: targets.box.x2, y: targets.box.y2 }
  ]);
  const boxed = await page.evaluate(() => ({
    selection: window.RTS_SIM.snapshot().selection.unitIds,
    mobile: window.__PLAYABILITY_CONTROLS_V1__.mobile.state()
  }));
  expect(boxed.selection.length).toBeGreaterThan(1);
  expect(boxed.mobile.boxSelections - before.boxSelections).toBe(1);
  expect(boxed.mobile.moveOrders).toBe(before.moveOrders);

  await touchSequence(page, [
    { type: 'pointerdown', id: 21, x: targets.worker.x, y: targets.worker.y },
    { type: 'pointerup', id: 21, x: targets.worker.x, y: targets.worker.y }
  ]);
  const replaced = await page.evaluate(() => window.RTS_SIM.snapshot().selection.unitIds);
  expect(replaced).toEqual([targets.worker.id]);
  await context.close();
});

test('touch pinch changes camera but never emits a gameplay order', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await boot(page, { viewport: { width: 844, height: 390 } });

  const before = await page.evaluate(() => window.__PLAYABILITY_CONTROLS_V1__.mobile.state());
  await touchSequence(page, [
    { type: 'pointerdown', id: 1, x: 330, y: 190 },
    { type: 'pointerdown', id: 2, x: 510, y: 190, primary: false },
    { type: 'pointermove', id: 1, x: 285, y: 175 },
    { type: 'pointermove', id: 2, x: 555, y: 205, primary: false },
    { type: 'pointerup', id: 1, x: 285, y: 175 },
    { type: 'pointerup', id: 2, x: 555, y: 205, primary: false }
  ]);
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
    if (!window.__RTS_DEBUG__?.runScenario?.('morale-35')) return false;
    return window.RTS_SIM.snapshot().selection.unitIds.length > 0;
  });
  expect(selected).toBeTruthy();

  const before = await page.evaluate(() => window.__PLAYABILITY_CONTROLS_V1__.mobile.state());
  await touchSequence(page, [
    { type: 'pointerdown', id: 7, x: 650, y: 205 },
    { type: 'pointerup', id: 7, x: 650, y: 205 }
  ]);
  const after = await page.evaluate(() => window.__PLAYABILITY_CONTROLS_V1__.mobile.state());

  expect(after.moveOrders - before.moveOrders).toBe(1);
  expect(after.facingOrders).toBe(before.facingOrders);
  await context.close();
});

test('touch facing drag emits one facing order without a duplicate tap order', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 915, height: 412 }, deviceScaleFactor: 2.625, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await boot(page, { viewport: { width: 915, height: 412 } });
  expect(await page.evaluate(() => window.__RTS_DEBUG__?.runScenario?.('morale-35'))).toBeTruthy();

  const before = await page.evaluate(() => window.__PLAYABILITY_CONTROLS_V1__.mobile.state());
  await touchSequence(page, [
    { type: 'pointerdown', id: 30, x: 650, y: 205 },
    { type: 'pointermove', id: 30, x: 735, y: 255 },
    { type: 'pointerup', id: 30, x: 735, y: 255 }
  ]);
  const after = await page.evaluate(() => ({
    mobile: window.__PLAYABILITY_CONTROLS_V1__.mobile.state(),
    snapshot: window.RTS_SIM.snapshot()
  }));

  expect(after.mobile.facingOrders - before.facingOrders).toBe(1);
  expect(after.mobile.moveOrders).toBe(before.moveOrders);
  expect(after.mobile.activePointers).toBe(0);
  expect(after.snapshot.groups.some(g => !g.destroyed && g.pathLength > 0)).toBeTruthy();
  await context.close();
});

test('touch formation button changes the selected regiment formation', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await boot(page, { viewport: { width: 844, height: 390 } });
  expect(await page.evaluate(() => window.__RTS_DEBUG__?.runScenario?.('morale-35'))).toBeTruthy();

  const selectedGroupId = await page.evaluate(() => {
    const snap = window.RTS_SIM.snapshot();
    const ids = new Set(snap.selection.unitIds);
    return snap.groups.find(g => g.members.some(m => ids.has(m.id)))?.id || null;
  });
  expect(selectedGroupId).not.toBeNull();

  const square = page.locator('[data-formation="square"]');
  await square.tap();
  await expect(square).toHaveAttribute('aria-pressed', 'true');
  const formation = await page.evaluate(id => window.RTS_SIM.snapshot().groups.find(g => g.id === id)?.formation, selectedGroupId);
  expect(formation).toBe('square');
  await context.close();
});

test('orientation change keeps the same canvas and HUD inside the viewport', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await boot(page, { viewport: { width: 844, height: 390 } });
  await page.evaluate(() => { window.__mobileCanvasIdentity = document.getElementById('game'); });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const portrait = await page.evaluate(() => {
    const canvas = document.getElementById('game');
    const rects = [...document.querySelectorAll('.topbar,.bottombar')].map(el => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    });
    return {
      sameCanvas: canvas === window.__mobileCanvasIdentity,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth,
      innerHeight,
      rects,
      rotateHint: getComputedStyle(document.getElementById('mobileRotateHint')).display,
      activePointers: window.__PLAYABILITY_CONTROLS_V1__.mobile.state().activePointers
    };
  });

  expect(portrait.sameCanvas).toBeTruthy();
  expect(portrait.canvasWidth).toBeGreaterThan(0);
  expect(portrait.canvasHeight).toBeGreaterThan(0);
  expect(portrait.scrollWidth).toBeLessThanOrEqual(portrait.innerWidth + 1);
  expect(portrait.rects.every(r => r.left >= -1 && r.right <= portrait.innerWidth + 1 && r.top >= -1 && r.bottom <= portrait.innerHeight + 1)).toBeTruthy();
  expect(portrait.rotateHint).not.toBe('none');
  expect(portrait.activePointers).toBe(0);

  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const landscape = await page.evaluate(() => ({
    sameCanvas: document.getElementById('game') === window.__mobileCanvasIdentity,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth,
    rotateHint: getComputedStyle(document.getElementById('mobileRotateHint')).display
  }));
  expect(landscape.sameCanvas).toBeTruthy();
  expect(landscape.scrollWidth).toBeLessThanOrEqual(landscape.innerWidth + 1);
  expect(landscape.rotateHint).toBe('none');
  await context.close();
});
