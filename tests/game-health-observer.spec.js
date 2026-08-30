const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

async function openHealthGame(page) {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    let seed = 987654321;
    Math.random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  });
  await page.goto('/?test=health', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__RTS_DEBUG__?.runScenario && window.__GAME_HEALTH__?.report));
  return pageErrors;
}

function persistReport(report, name = 'game-health-report.json') {
  const outputDir = path.resolve('test-results');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, name), JSON.stringify(report, null, 2));
}

test('observer catches a deliberately invalid unit state', async ({ page }) => {
  await openHealthGame(page);
  const result = await page.evaluate(() => {
    window.__RTS_DEBUG__.runScenario('performance-520');
    window.__GAME_HEALTH__.reset();
    const unit = units.find(candidate => !candidate.dead);
    const originalX = unit.x;
    unit.x = Number.NaN;
    const report = window.__GAME_HEALTH__.sample();
    unit.x = originalX;
    window.__GAME_HEALTH__.reset();
    return report;
  });

  expect(result.ok).toBe(false);
  expect(result.counters.invalidPositions).toBeGreaterThan(0);
  expect(result.errors.some(error => error.includes('invalid coordinates'))).toBeTruthy();
});

test('520-unit scenario produces an automatic game health report', async ({ page }, testInfo) => {
  const pageErrors = await openHealthGame(page);
  await page.evaluate(() => {
    window.__RTS_DEBUG__.runScenario('performance-520');
    window.__GAME_HEALTH__.reset();
  });

  // Let real requestAnimationFrame rendering run so frame/update/draw metrics are meaningful.
  await page.waitForTimeout(4500);
  const report = await page.evaluate(() => window.__GAME_HEALTH__.sample());
  persistReport(report);
  await testInfo.attach('game-health-report', {
    body: Buffer.from(JSON.stringify(report, null, 2)),
    contentType: 'application/json'
  });

  expect(pageErrors).toEqual([]);
  expect(report.counters.runtimeErrors).toBe(0);
  expect(report.counters.unhandledRejections).toBe(0);
  expect(report.counters.invalidPositions).toBe(0);
  expect(report.counters.outsideWorld).toBe(0);
  expect(report.performance.maxLivingUnits).toBeGreaterThanOrEqual(500);
  expect(report.performance.samples).toBeGreaterThanOrEqual(4);
  expect(report.performance.p95FrameMs).toBeGreaterThan(0);
  expect(report.errors).toEqual([]);
});
