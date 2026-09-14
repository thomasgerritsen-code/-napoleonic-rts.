const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const GOLDEN_SEED = 18150914;

async function openGoldenBattle(page) {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(seedValue => {
    let seed = seedValue;
    Math.random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  }, GOLDEN_SEED);
  await page.goto('/?test=golden-battle-v1', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(
    window.__RTS_DEBUG__?.runScenario &&
    window.__RTS_DEBUG__?.createFreshInfantryRegiment &&
    window.__RTS_DEBUG__?.formationState &&
    window.__GAME_HEALTH__?.sample &&
    window.RTS_SIM?.step
  ));
  return pageErrors;
}

function persistReport(report) {
  const outputDir = path.resolve('test-results');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'golden-battle-report.json'), JSON.stringify(report, null, 2));
}

function percentile(values, percentileValue) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(percentileValue * sorted.length) - 1));
  return sorted[index];
}

test('deterministic Golden Battle keeps large 2D combat healthy, cohesive and frame-stable', async ({ page }, testInfo) => {
  const pageErrors = await openGoldenBattle(page);

  const setup = await page.evaluate(() => {
    window.__RTS_DEBUG__.runScenario('regiment-duel');
    window.__RTS_DEBUG__.setPeaceMode(false);

    const ids = [];
    const rows = 7;
    for (let row = 0; row < rows; row += 1) {
      const y = 520 + row * 185;
      const france = window.__RTS_DEBUG__.createFreshInfantryRegiment('france', 1220, y);
      const britain = window.__RTS_DEBUG__.createFreshInfantryRegiment('britain', 2580, y + 18);
      ids.push(france, britain);

      window.__RTS_DEBUG__.selectRegiment(france);
      window.__RTS_DEBUG__.orderSelectedWithFacing(1775, y, 0);
      window.__RTS_DEBUG__.selectRegiment(britain);
      window.__RTS_DEBUG__.orderSelectedWithFacing(2025, y + 18, Math.PI);
    }

    // Advance the same fixed simulation interval on every run so the measured
    // phase starts with both armies already manoeuvring into contact.
    window.RTS_SIM.step(7.5);
    window.__GAME_HEALTH__.reset();

    const states = ids.map(id => window.__RTS_DEBUG__.formationState(id)).filter(Boolean);
    const anchorsFinite = states.every(state => Number.isFinite(state.anchor?.x) && Number.isFinite(state.anchor?.y));
    const readiness = states.map(state => state.readiness).filter(Number.isFinite);

    return {
      seed: 18150914,
      regimentIds: ids,
      regimentCount: states.length,
      anchorsFinite,
      meanReadiness: readiness.length ? readiness.reduce((sum, value) => sum + value, 0) / readiness.length : null,
      canvasWidth: document.getElementById('game').width,
      canvasHeight: document.getElementById('game').height
    };
  });

  // Observe real requestAnimationFrame cadence; this is deliberately separate
  // from the fixed simulation step so rendering regressions are visible.
  const frameProbe = await page.evaluate(async () => {
    const canvas = document.getElementById('game');
    const context = canvas.getContext('2d');
    const initialWidth = canvas.width;
    const initialHeight = canvas.height;
    const frameIntervals = [];
    const alphas = [];
    let sameCanvasEveryFrame = true;
    let previous = performance.now();

    for (let index = 0; index < 120; index += 1) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const now = performance.now();
      frameIntervals.push(now - previous);
      previous = now;
      sameCanvasEveryFrame &&= document.getElementById('game') === canvas;
      const sample = context.getImageData(12, 12, 1, 1).data;
      alphas.push(sample[3]);
    }

    return {
      frameIntervals,
      sameCanvasEveryFrame,
      dimensionsStable: canvas.width === initialWidth && canvas.height === initialHeight,
      allFramesOpaque: alphas.every(alpha => alpha > 0)
    };
  });

  // Keep the representative battle running a little longer so the health
  // observer gathers several samples with active movement/combat/rendering.
  await page.waitForTimeout(2600);

  const runtime = await page.evaluate(ids => {
    const health = window.__GAME_HEALTH__.sample();
    const performanceMetrics = window.__RTS_DEBUG__.getPerformance();
    const states = ids.map(id => window.__RTS_DEBUG__.formationState(id)).filter(Boolean);
    const finiteAnchors = states.every(state => Number.isFinite(state.anchor?.x) && Number.isFinite(state.anchor?.y));
    const readiness = states.map(state => state.readiness).filter(Number.isFinite);
    const phases = states.reduce((counts, state) => {
      const key = state.phase || 'unknown';
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {});
    return {
      health,
      performanceMetrics,
      regimentCount: states.length,
      finiteAnchors,
      meanReadiness: readiness.length ? readiness.reduce((sum, value) => sum + value, 0) / readiness.length : null,
      phases
    };
  }, setup.regimentIds);

  const browserP95FrameMs = percentile(frameProbe.frameIntervals, 0.95);
  const report = {
    version: 1,
    scenario: 'golden-battle-v1',
    deterministicSeed: GOLDEN_SEED,
    setup,
    browser: {
      samples: frameProbe.frameIntervals.length,
      p95FrameMs: browserP95FrameMs,
      maxFrameMs: Math.max(...frameProbe.frameIntervals),
      sameCanvasEveryFrame: frameProbe.sameCanvasEveryFrame,
      dimensionsStable: frameProbe.dimensionsStable,
      allFramesOpaque: frameProbe.allFramesOpaque
    },
    runtime
  };

  persistReport(report);
  await testInfo.attach('golden-battle-report', {
    body: Buffer.from(JSON.stringify(report, null, 2)),
    contentType: 'application/json'
  });
  await testInfo.attach('golden-battle-frame', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png'
  });

  expect(pageErrors).toEqual([]);
  expect(setup.regimentCount).toBeGreaterThanOrEqual(14);
  expect(setup.anchorsFinite).toBe(true);
  expect(runtime.regimentCount).toBeGreaterThan(0);
  expect(runtime.finiteAnchors).toBe(true);
  expect(runtime.health.counters.runtimeErrors).toBe(0);
  expect(runtime.health.counters.unhandledRejections).toBe(0);
  expect(runtime.health.counters.invalidPositions).toBe(0);
  expect(runtime.health.counters.outsideWorld).toBe(0);
  expect(runtime.health.performance.samples).toBeGreaterThanOrEqual(3);
  expect(runtime.health.performance.p95FrameMs).toBeGreaterThan(0);
  expect(runtime.health.errors).toEqual([]);
  expect(frameProbe.sameCanvasEveryFrame).toBe(true);
  expect(frameProbe.dimensionsStable).toBe(true);
  expect(frameProbe.allFramesOpaque).toBe(true);
  expect(browserP95FrameMs).toBeGreaterThan(0);
  // Broad catastrophic-regression ceiling only. A tighter budget is frozen
  // later from repeated Golden Battle baselines, not from one CI machine run.
  expect(browserP95FrameMs).toBeLessThan(250);
});
