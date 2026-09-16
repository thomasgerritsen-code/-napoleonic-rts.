const { test, expect } = require('@playwright/test');

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
  expect(contract.library).toContain('PixiJS');
  expect(contract.bridgeStillPresent).toBe(true);
  expect(contract.simStillPresent).toBe(true);
});
