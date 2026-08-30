const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

async function openConsolidatedMovement(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?test=v071', { waitUntil:'networkidle' });
  await page.waitForFunction(() => Boolean(
    window.RTS_VERSION &&
    window.RTS_SIM?.version === window.RTS_VERSION &&
    window.NRTS?.subsystems.has('movement') &&
    window.NRTS?.subsystems.has('formation') &&
    window.NRTS?.subsystems.has('frame-stability') &&
    window.__FRAME_STABILITY_V1__ &&
    window.__RTS_DEBUG__?.motionStatsV071 &&
    window.__V071_SPEED_PARITY__?.version === '0.7.1-hotfix2'
  ));
  return errors;
}

test('active v0.7.1 movement layer is owned by Architecture v2.1 modules', async ({ page }) => {
  const errors = await openConsolidatedMovement(page);
  const snapshot = await page.evaluate(() => window.NRTS.diagnostics.snapshot());
  const movement = snapshot.subsystems.find(s => s.name === 'movement');
  const formation = snapshot.subsystems.find(s => s.name === 'formation');
  expect(movement?.meta?.phase).toBe('architecture-v2.1');
  expect(movement?.meta?.legacyBridge).toBe(false);
  expect(formation?.meta?.phase).toBe('architecture-v2.1');
  expect(formation?.meta?.legacyBridge).toBe(false);
  expect(errors).toEqual([]);
});

test('legacy v071 motion/hotfix files remain archived but are no longer loaded', async () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  expect(html).not.toContain('src/v071-motion.js');
  expect(html).not.toContain('src/v071-speed-hotfix.js');
  const ordered = [
    'src/systems/movement/state.js',
    'src/systems/formation/followers.js',
    'src/systems/movement/fixed-step.js',
    'src/systems/movement/speed-model.js',
    'src/systems/movement/api.js'
  ].map(item => html.indexOf(item));
  expect(ordered.every(index => index >= 0)).toBe(true);
  expect(ordered).toEqual([...ordered].sort((a,b) => a-b));
});

test('central config preserves v0.7.1 follower and speed tuning', async ({ page }) => {
  await openConsolidatedMovement(page);
  const values = await page.evaluate(() => ({
    fixedHz: window.NRTS_CONFIG.simulation.fixedHz,
    infantryHardCap: window.NRTS_CONFIG.movement.followerHardCaps.infantry,
    cavalryHardCap: window.NRTS_CONFIG.movement.followerHardCaps.cavalry,
    roadLookAhead: window.NRTS_CONFIG.formation.followers.lookAhead.road,
    roadMultiplier: window.NRTS_CONFIG.movement.roadMultipliers.chaussee,
    speedParity: window.__V071_SPEED_PARITY__
  }));
  expect(values.fixedHz).toBe(60);
  expect(values.infantryHardCap).toBe(124);
  expect(values.cavalryHardCap).toBe(178);
  expect(values.roadLookAhead).toBe(.075);
  expect(values.roadMultiplier).toBe(1.24);
  expect(values.speedParity.infantryField).toBeGreaterThan(0);
});

test('final render frame uses one coherent smoothed snapshot', async ({ page }) => {
  const errors = await openConsolidatedMovement(page);
  const stability = await page.evaluate(() => ({
    api: window.__FRAME_STABILITY_V1__,
    subsystem: window.NRTS.diagnostics.snapshot().subsystems.find(s => s.name === 'frame-stability'),
    hasRenderer: typeof window.renderStableFrameV1 === 'function'
  }));
  expect(stability.api.version).toBe('frame-stability-v1');
  expect(stability.api.phase).toBe('architecture-v2.2');
  expect(stability.api.outerFrameSnapshot).toBe(true);
  expect(stability.api.unitInterpolation).toBe(true);
  expect(stability.api.microJitterFilter).toBe(true);
  expect(stability.api.cameraSmoothing).toBe(true);
  expect(stability.api.simulationStatePreserved).toBe(true);
  expect(stability.subsystem?.meta?.phase).toBe('architecture-v2.2');
  expect(stability.subsystem?.meta?.legacyBridge).toBe(false);
  expect(stability.hasRenderer).toBe(true);
  expect(errors).toEqual([]);
});

test('consolidated systems preserve existing smooth march debug contract', async ({ page }) => {
  const errors = await openConsolidatedMovement(page);
  await page.evaluate(() => window.__RTS_DEBUG__.setPeaceMode(true));
  const id = await page.evaluate(() => window.__RTS_DEBUG__.createFreshInfantryRegiment('france',700,900));
  await page.evaluate(id => {
    window.__RTS_DEBUG__.selectRegiment(id);
    window.__RTS_DEBUG__.orderSelectedWithFacing(1500,895,0);
    window.RTS_SIM.step(1.2);
  }, id);
  const state = await page.evaluate(id => window.__RTS_DEBUG__.motionSystemV071(id), id);
  const stats = await page.evaluate(() => window.__RTS_DEBUG__.motionStatsV071());
  expect(state.solver).toBe('anchor-damped-slots-fixed60-render-interp');
  expect(stats.fixedStepHz).toBe(60);
  expect(stats.renderInterpolation).toBe(true);
  expect(state.members.length).toBeGreaterThan(10);
  expect(errors).toEqual([]);
});
