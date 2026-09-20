const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const LOCAL_PIXI_MODULE = '/node_modules/pixi.js/dist/pixi.mjs';
const NORTH_STAR_SEED = 16092026;

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] || 0;
}

async function settleFrames(page, count = 4) {
  await page.evaluate(async frameCount => {
    for (let i = 0; i < frameCount; i += 1) {
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
  }, count);
}

test('Pixi V2 renders the North Star battle on desktop/mobile and stays responsive at 520 units', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const outputDir = path.resolve('test-results');
  fs.mkdirSync(outputDir, { recursive: true });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.addInitScript(({ moduleUrl, seedValue }) => {
    window.__NRTS_PIXI_MODULE_URL__ = moduleUrl;
    localStorage.setItem('nrts-pixi-v1', 'off');
    let seed = seedValue;
    Math.random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  }, { moduleUrl: LOCAL_PIXI_MODULE, seedValue: NORTH_STAR_SEED });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?test=pixi-north-star-v1', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__NRTS_PIXI_V1__ && window.__RTS_DEBUG__?.runScenario));
  const setup = await page.evaluate(() => {
    const ok = window.__RTS_DEBUG__.runScenario('north-star');
    window.__RTS_DEBUG__.setPeaceMode(true);
    return { ok, meta: window.__RTS_DEBUG__.northStarScenario() };
  });
  await page.evaluate(() => window.__NRTS_PIXI_V1__.setEnabled(true));
  await page.waitForFunction(() => {
    const d = window.__NRTS_PIXI_V1__?.diagnostics?.();
    return d?.enabled && d?.units >= 100 && d?.scenery > 0;
  }, null, { timeout: 20_000 });
  await settleFrames(page, 6);

  const desktopPath = path.join(outputDir, 'pixi-north-star-desktop.png');
  const desktopImage = await page.locator('#pixiBattlefield').screenshot({ path: desktopPath, animations: 'disabled' });
  await testInfo.attach('pixi-north-star-desktop', { body: desktopImage, contentType: 'image/png' });

  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => {
    const meta = window.__RTS_DEBUG__.northStarScenario();
    const camera = window.NRTS_3D_SOURCE.camera();
    camera.x = meta.center.x;
    camera.y = meta.center.y;
    camera.zoom = 0.32;
  });
  await settleFrames(page, 6);
  const mobilePath = path.join(outputDir, 'pixi-north-star-mobile-landscape.png');
  const mobileImage = await page.locator('#pixiBattlefield').screenshot({ path: mobilePath, animations: 'disabled' });
  await testInfo.attach('pixi-north-star-mobile-landscape', { body: mobileImage, contentType: 'image/png' });

  await page.evaluate(() => window.__RTS_DEBUG__.runScenario('performance-520'));
  await page.waitForFunction(() => window.__NRTS_PIXI_V1__?.diagnostics?.().units >= 520, null, { timeout: 20_000 });
  const frameTimes = await page.evaluate(async () => {
    const samples = [];
    let previous = performance.now();
    for (let i = 0; i < 90; i += 1) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const now = performance.now();
      if (i >= 10) samples.push(now - previous);
      previous = now;
    }
    return samples;
  });
  const performanceEvidence = {
    samples: frameTimes.length,
    meanMs: frameTimes.reduce((sum, value) => sum + value, 0) / Math.max(1, frameTimes.length),
    p95Ms: percentile(frameTimes, 0.95),
    maxMs: Math.max(...frameTimes)
  };

  const diagnostics = await page.evaluate(() => ({
    pixi: window.__NRTS_PIXI_V1__.diagnostics(),
    threeEnabled: window.__BATTLEFIELD_3D_V1__.enabled(),
    audit: window.__RTS_DEBUG__.audit(),
    inputHitTarget: document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.id || null
  }));
  const report = {
    version: 1,
    scenario: 'pixi-north-star-v1',
    deterministicSeed: NORTH_STAR_SEED,
    preservationImpact: 'compatible change',
    setup,
    diagnostics,
    performanceEvidence
  };
  const reportPath = path.join(outputDir, 'pixi-north-star-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  await testInfo.attach('pixi-north-star-report', {
    body: Buffer.from(JSON.stringify(report, null, 2)),
    contentType: 'application/json'
  });

  expect(pageErrors).toEqual([]);
  expect(setup.ok).toBe(true);
  expect(setup.meta?.id).toBe('north-star-v1');
  expect(diagnostics.pixi.units).toBeGreaterThanOrEqual(520);
  expect(diagnostics.pixi.water).toEqual({ riverPoints: 12, crossings: 4 });
  expect(diagnostics.pixi.inputAuthority).toBe('game-canvas');
  expect(diagnostics.pixi.inputProxyActive).toBe(true);
  expect(diagnostics.threeEnabled).toBe(false);
  expect(diagnostics.audit.errors || []).toEqual([]);
  expect(diagnostics.inputHitTarget).toBe('game');
  expect(performanceEvidence.samples).toBe(80);
  expect(performanceEvidence.p95Ms).toBeLessThan(100);
});
