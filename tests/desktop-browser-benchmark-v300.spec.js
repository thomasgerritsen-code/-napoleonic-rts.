// Reproducible A/B browser rendering measurement. Runs on the PR merge ref
// and loads the untouched origin/main into an independent local HTTP server.
// No network calls to production and no live game state mutation on main.
const { test, expect } = require('@playwright/test');
const { execFileSync, spawn } = require('node:child_process');
const { mkdtempSync, rmSync, writeFileSync, mkdirSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const VIEWPORT = { width: 1920, height: 1080 };
const RENDER_DURATION_MS = 3200;
const BASE_PORT = 4184;
const round = n => Math.round(n * 100) / 100;
const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  return round(sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]);
};
const median = values => percentile(values, .5);

async function waitForBaselineServer() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:' + BASE_PORT + '/index.html', { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Baseline HTTP server did not start');
}

async function measure(browser, url, scenario) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2.5 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.addInitScript(() => {
      let s = 987654321;
      Math.random = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    });
    await page.goto(url + '/?test=health', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() =>
      Boolean(window.__LARGE_ARMY_PERFORMANCE_V1__ && window.RTS_SIM &&
        window.__RTS_DEBUG__?.runScenario && document.getElementById('game-static')),
      null, { timeout: 20000 });
    const state = await page.evaluate(scenario => {
      if (scenario === '520 units') window.__RTS_DEBUG__.runScenario('performance-520');
      camera.zoom = 1;
      camera.x = 1060;
      camera.y = 920;
      clampCamera();
      const canvas = document.getElementById('game');
      const staticCanvas = document.getElementById('game-static');
      return {
        version: window.RTS_VERSION_INFO?.version || '(unknown)',
        renderWidth: canvas.width,
        renderHeight: canvas.height,
        staticWidth: staticCanvas.width,
        staticHeight: staticCanvas.height,
        units: units.filter(u => !u.dead).length
      };
    }, scenario);
    await page.waitForTimeout(750);
    await page.keyboard.down('d');
    const timing = await page.evaluate(ms => new Promise(resolve => {
      const round = n => Math.round(n * 100) / 100;
      const percentile = (values, p) => {
        if (!values.length) return null;
        const sorted = values.slice().sort((a, b) => a - b);
        return round(sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]);
      };
      const deltas = [];
      let started = null;
      let prev = null;
      function next(ts) {
        if (started === null) started = ts;
        if (prev !== null) deltas.push(ts - prev);
        prev = ts;
        if (ts - started < ms) requestAnimationFrame(next);
        else {
          const duration = ts - started;
          const metrics = window.RTS_SIM.getMetrics();
          resolve({
            durationMs: round(duration),
            samples: deltas.length,
            effectiveFps: round(1000 * deltas.length / duration),
            medianFrameMs: percentile(deltas, .5),
            p95FrameMs: percentile(deltas, .95),
            p99FrameMs: percentile(deltas, .99),
            over33ms: deltas.filter(x => x > 33.34).length,
            over50ms: deltas.filter(x => x > 50).length,
            drawMsEma: round(metrics.drawMs),
            updateMsEma: round(metrics.updateMs)
          });
        }
      }
      requestAnimationFrame(next);
    }), RENDER_DURATION_MS);
    await page.keyboard.up('d');
    return { ...state, ...timing, scenario, errors };
  } finally {
    await context.close();
  }
}

test('v301 browser FPS and frame pacing vs untouched v299 baseline', async ({ browser }, testInfo) => {
  test.setTimeout(240000);
  const sourceDir = mkdtempSync(path.join(os.tmpdir(), 'rts-baseline-v299-'));
  const baseDir = path.join(sourceDir, 'site');
  let server;
  try {
    const baseSha = execFileSync('git', ['rev-parse', 'origin/main'], { encoding: 'utf8' }).trim();
    if (!/^[a-f0-9]{40}$/.test(baseSha)) throw new Error('Missing trusted baseline SHA');
    execFileSync('git', ['worktree', 'add', '--detach', baseDir, baseSha], { stdio: 'pipe' });
    server = spawn('python3', ['-m', 'http.server', String(BASE_PORT), '--bind', '127.0.0.1', '--directory', baseDir], { stdio: 'ignore' });
    await waitForBaselineServer();

    const base = 'http://127.0.0.1:' + BASE_PORT;
    const current = 'http://127.0.0.1:4173';
    const sampleOrder = [
      ['v299/main', base, 'normal'],
      ['v301/PR', current, 'normal'],
      ['v301/PR', current, '520 units'],
      ['v299/main', base, '520 units'],
      ['v301/PR', current, 'normal'],
      ['v299/main', base, 'normal'],
      ['v299/main', base, '520 units'],
      ['v301/PR', current, '520 units']
    ];
    const entries = [];
    for (const [version, url, scenario] of sampleOrder) {
      const result = await measure(browser, url, scenario);
      entries.push({build:version, ...result});
      console.log('DESKTOP_BENCHMARK_SAMPLE=' + JSON.stringify({build:version, ...result}));
      expect(result.errors).toEqual([]);
      // Even when software-rendered headless Chromium is heavily overloaded,
      // keep the sample and report low FPS instead of discarding the evidence.
      expect(result.samples).toBeGreaterThan(3);
    }
    const groups = {};
    for (const entry of entries) {
      const key = entry.build + ':' + entry.scenario;
      (groups[key] ||= []).push(entry);
    }
    const summary = Object.fromEntries(Object.entries(groups).map(([key, group]) => [key, {
      fps: median(group.map(r => r.effectiveFps)),
      frameP95ms: median(group.map(r => r.p95FrameMs)),
      frameP99ms: median(group.map(r => r.p99FrameMs)),
      drawMsEma: median(group.map(r => r.drawMsEma)),
      updateMsEma: median(group.map(r => r.updateMsEma)),
      hitches33: median(group.map(r => r.over33ms)),
      hitches50: median(group.map(r => r.over50ms)),
      renderPixels: group[0].renderWidth * group[0].renderHeight,
      units: group[0].units
    }]));
    const report = { baselineSha:baseSha, viewport:VIEWPORT, nativeDpr:2.5,
      runLengthMs:RENDER_DURATION_MS, summary, entries };
    mkdirSync(path.resolve('test-results'), { recursive:true });
    writeFileSync(path.resolve('test-results/desktop-frame-benchmark-v301.json'), JSON.stringify(report,null,2));
    console.log('DESKTOP_BENCHMARK_V301=' + JSON.stringify(report));
    await testInfo.attach('desktop-frame-benchmark-v301.json', {
      body: Buffer.from(JSON.stringify(report, null, 2)), contentType: 'application/json'
    });
    expect(summary['v299/main:normal']).toBeDefined();
    expect(summary['v301/PR:normal']).toBeDefined();
    expect(summary['v299/main:520 units']).toBeDefined();
    expect(summary['v301/PR:520 units']).toBeDefined();
  } finally {
    if (server) {
      server.kill('SIGTERM');
      await new Promise(resolve => server.once('exit', resolve)).catch(() => {});
    }
    try { execFileSync('git', ['worktree', 'remove', '--force', baseDir], { stdio: 'pipe' }); }
    catch {}
    rmSync(sourceDir, { recursive:true, force:true });
  }
});
