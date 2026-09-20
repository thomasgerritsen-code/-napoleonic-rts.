const { test, expect } = require('@playwright/test');

const LOCAL_PIXI_MODULE = '/node_modules/pixi.js/dist/pixi.mjs';

async function preparePixi(page) {
  await page.addInitScript(moduleUrl => {
    localStorage.setItem('nrts-pixi-v1', 'off');
    window.__NRTS_PIXI_MODULE_URL__ = moduleUrl;
  }, LOCAL_PIXI_MODULE);
  await page.goto('/?test=pixi-v2');
  await page.waitForFunction(() => Boolean(window.__NRTS_PIXI_V1__ && window.__BATTLEFIELD_3D_V1__));
}

async function enablePixi(page) {
  await page.evaluate(() => window.__NRTS_PIXI_V1__.setEnabled(true));
  await page.waitForFunction(() => {
    const d = window.__NRTS_PIXI_V1__?.diagnostics?.();
    return d?.enabled && d?.loaded && d?.units > 0;
  }, null, { timeout: 20_000 });
}

async function touchSequence(page, events) {
  await page.locator('#game').evaluate((canvas, sequence) => {
    for (const event of sequence) {
      canvas.dispatchEvent(new PointerEvent(event.type, {
        pointerId: event.id,
        pointerType: 'touch',
        isPrimary: event.primary !== false,
        button: 0,
        buttons: event.type === 'pointerup' ? 0 : 1,
        clientX: event.x,
        clientY: event.y,
        bubbles: true,
        cancelable: true
      }));
    }
  }, events);
}

test('Pixi V2 loader is opt-in and does not replace the default render path', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('nrts-pixi-v1', 'off'));
  await page.goto('/');
  await page.waitForFunction(() => window.__NRTS_PIXI_V1__);

  const state = await page.evaluate(() => ({
    version: window.__NRTS_PIXI_V1__.version,
    enabled: window.__NRTS_PIXI_V1__.enabled(),
    loaded: window.__NRTS_PIXI_V1__.loaded(),
    diagnostics: window.__NRTS_PIXI_V1__.diagnostics(),
    hasButton: Boolean(document.getElementById('pixiModeBtn')),
    hasCanvas: Boolean(document.getElementById('pixiBattlefield')),
    gameVisible: getComputedStyle(document.getElementById('game')).visibility !== 'hidden'
  }));

  expect(state.version).toBe('pixi-battlefield-v1');
  expect(state.enabled).toBe(false);
  expect(state.loaded).toBe(false);
  expect(state.diagnostics.loading).toBe(false);
  expect(state.diagnostics.loadError).toBe('');
  expect(state.hasButton).toBe(true);
  expect(state.hasCanvas).toBe(false);
  expect(state.gameVisible).toBe(true);
});

test('Pixi V2 exposes smoke and mode APIs without taking simulation authority', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('nrts-pixi-v1', 'off'));
  await page.goto('/');
  await page.waitForFunction(() => window.__NRTS_PIXI_V1__);

  const contract = await page.evaluate(() => {
    const api = window.__NRTS_PIXI_V1__;
    return {
      hasSetEnabled: typeof api.setEnabled === 'function',
      hasSmoke: typeof api.spawnSmoke === 'function',
      library: api.library,
      bridgeStillPresent: Boolean(window.NRTS_3D_SOURCE),
      simStillPresent: Boolean(window.RTS_SIM)
    };
  });

  expect(contract.hasSetEnabled).toBe(true);
  expect(contract.hasSmoke).toBe(true);
  expect(contract.library).toContain('PixiJS 8.21.0');
  expect(contract.bridgeStillPresent).toBe(true);
  expect(contract.simStillPresent).toBe(true);
});

test('Pixi V2 activates on the canonical input canvas and restores the prior renderer cleanly', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await preparePixi(page);
  expect(await page.evaluate(() => window.__RTS_DEBUG__.runScenario('morale-35'))).toBe(true);
  await enablePixi(page);

  const active = await page.evaluate(() => {
    const game = document.getElementById('game');
    const pixi = document.getElementById('pixiBattlefield');
    const center = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    return {
      diagnostics: window.__NRTS_PIXI_V1__.diagnostics(),
      threeEnabled: window.__BATTLEFIELD_3D_V1__.enabled(),
      game: {
        visibility: game.style.visibility,
        opacity: game.style.opacity,
        pointerEvents: game.style.pointerEvents,
        zIndex: game.style.zIndex
      },
      pixiDisplay: pixi.style.display,
      hitTarget: center?.id || null
    };
  });

  expect(active.diagnostics.inputAuthority).toBe('game-canvas');
  expect(active.diagnostics.inputProxyActive).toBe(true);
  expect(active.diagnostics.pixiPointerEvents).toBe('none');
  expect(active.diagnostics.moduleUrl).toBe(LOCAL_PIXI_MODULE);
  expect(active.threeEnabled).toBe(false);
  expect(active.game).toEqual({ visibility: 'visible', opacity: '0', pointerEvents: 'auto', zIndex: '3' });
  expect(active.pixiDisplay).toBe('block');
  expect(active.hitTarget).toBe('game');

  const regimentId = await page.evaluate(() => {
    const snap = window.RTS_SIM.snapshot();
    const selected = new Set(snap.selection.unitIds);
    return snap.groups.find(group => group.members.some(member => selected.has(member.id)))?.id || null;
  });
  expect(regimentId).not.toBeNull();
  const destination = await page.evaluate(() => window.__RTS_DEBUG__.worldToScreen(2180, 1160));
  const facing = await page.evaluate(() => window.__RTS_DEBUG__.worldToScreen(2290, 1160));
  await page.mouse.move(destination.x, destination.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(facing.x, facing.y, { steps: 6 });
  await page.mouse.up({ button: 'right' });
  const ordered = await page.evaluate(id => window.__RTS_DEBUG__.formationState(id), regimentId);
  expect(ordered.pathLength).toBeGreaterThan(0);
  expect(Math.abs(ordered.finalFacing)).toBeLessThan(0.12);

  await page.keyboard.press('2');
  expect(await page.evaluate(id => window.__RTS_DEBUG__.formationState(id).formation, regimentId)).toBe('column');

  await page.evaluate(() => window.__NRTS_PIXI_V1__.setEnabled(false));
  const restored = await page.evaluate(() => {
    const game = document.getElementById('game');
    return {
      pixi: window.__NRTS_PIXI_V1__.diagnostics(),
      threeEnabled: window.__BATTLEFIELD_3D_V1__.enabled(),
      game: {
        visibility: game.style.visibility,
        opacity: game.style.opacity,
        pointerEvents: game.style.pointerEvents,
        zIndex: game.style.zIndex
      },
      pixiDisplay: document.getElementById('pixiBattlefield').style.display
    };
  });
  expect(restored.pixi.enabled).toBe(false);
  expect(restored.pixi.inputProxyActive).toBe(false);
  expect(restored.threeEnabled).toBe(true);
  expect(restored.game).toEqual({ visibility: '', opacity: '', pointerEvents: '', zIndex: '' });
  expect(restored.pixiDisplay).toBe('none');
  expect(pageErrors).toEqual([]);
});

test('Pixi V2 preserves mobile facing, pinch and formation controls', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await preparePixi(page);
  expect(await page.evaluate(() => window.__RTS_DEBUG__.runScenario('morale-35'))).toBe(true);
  await enablePixi(page);

  const before = await page.evaluate(() => window.__PLAYABILITY_CONTROLS_V1__.mobile.state());
  await touchSequence(page, [
    { type: 'pointerdown', id: 10, x: 650, y: 205 },
    { type: 'pointermove', id: 10, x: 735, y: 255 },
    { type: 'pointerup', id: 10, x: 735, y: 255 }
  ]);
  await touchSequence(page, [
    { type: 'pointerdown', id: 1, x: 300, y: 180 },
    { type: 'pointerdown', id: 2, x: 500, y: 180, primary: false },
    { type: 'pointermove', id: 1, x: 260, y: 160 },
    { type: 'pointermove', id: 2, x: 560, y: 200, primary: false },
    { type: 'pointerup', id: 2, x: 560, y: 200, primary: false },
    { type: 'pointerup', id: 1, x: 260, y: 160 }
  ]);
  const after = await page.evaluate(() => window.__PLAYABILITY_CONTROLS_V1__.mobile.state());

  expect(after.facingOrders - before.facingOrders).toBe(1);
  expect(after.moveOrders).toBe(before.moveOrders);
  expect(after.cameraGestures).toBeGreaterThan(before.cameraGestures);
  expect(after.ghostOrdersSuppressed).toBeGreaterThanOrEqual(before.ghostOrdersSuppressed + 2);

  const selectedGroupId = await page.evaluate(() => {
    const snap = window.RTS_SIM.snapshot();
    const selected = new Set(snap.selection.unitIds);
    return snap.groups.find(group => group.members.some(member => selected.has(member.id)))?.id || null;
  });
  await page.locator('[data-formation="square"]').tap();
  expect(await page.evaluate(id => window.RTS_SIM.snapshot().groups.find(group => group.id === id)?.formation, selectedGroupId)).toBe('square');
  expect(pageErrors).toEqual([]);
  await context.close();
});
