'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createSandbox,
  loadProductionScript,
  runFixedSteps
} = require('./harness');

function loadMovementModel() {
  const { context, window } = createSandbox({
    seed: 424242,
    globals: {
      V071_ACTIVE: false,
      TYPES: {
        infantry: { speed: 60 },
        cavalry: { speed: 90 }
      },
      roadNetworkAtV066: x => (
        x >= 100 && x <= 200
          ? { road: { roadClass: 'chaussee', name: 'Headless Chaussee' } }
          : null
      ),
      fieldSpeedFactorV066: () => 0.8,
      clampV064: (value, min, max) => Math.max(min, Math.min(max, value))
    }
  });

  loadProductionScript(context, 'src/foundation/config.js');
  loadProductionScript(context, 'src/systems/movement/speed-model.js');
  return { context, window };
}

test('production movement config loads without a browser and keeps v0.7.1 tuning', () => {
  const { window } = loadMovementModel();
  assert.equal(window.NRTS_CONFIG.simulation.fixedHz, 60);
  assert.equal(window.NRTS_CONFIG.movement.roadMultipliers.chaussee, 1.24);
  assert.equal(window.NRTS_CONFIG.movement.roadMultipliers.secondary, 1.13);
  assert.equal(window.NRTS_CONFIG.movement.roadMultipliers.track, 1.05);
  assert.equal(window.NRTS_CONFIG.movement.intermediateTravelFloor.road, 0.95);
  assert.equal(window.NRTS_CONFIG.movement.intermediateTravelFloor.field, 0.92);
});

test('actual production speed model preserves road and field speed behaviour headlessly', () => {
  const { context } = loadMovementModel();

  assert.equal(context.canonicalBaseSpeedV071('infantry'), 60);
  assert.equal(context.canonicalBaseSpeedV071('cavalry'), 90);
  assert.equal(context.canonicalRoadMultiplierV071('chaussee'), 1.24);
  assert.equal(context.canonicalRoadMultiplierV071('secondary'), 1.13);
  assert.equal(context.canonicalRoadMultiplierV071('track'), 1.05);

  assert.equal(context.canonicalTerrainSpeedV071('infantry', 50, 0), 48);
  assert.equal(context.canonicalTerrainSpeedV071('infantry', 150, 0), 74.4);
  assert.equal(context.canonicalTerrainSpeedV071('cavalry', 50, 0), 72);
  assert.equal(context.canonicalTerrainSpeedV071('cavalry', 150, 0), 111.6);
});

test('fixed-step headless scenario is deterministic and exercises production movement logic', () => {
  function runOnce() {
    const { context } = loadMovementModel();
    return runFixedSteps({
      durationSeconds: 8,
      hz: 60,
      state: { x: 0, y: 0 },
      step(state, dt) {
        const speed = context.canonicalTerrainSpeedV071('infantry', state.x, state.y);
        state.x += speed * dt;
      },
      sampleEvery: 60,
      sample: state => Number(state.x.toFixed(6))
    });
  }

  const first = runOnce();
  const second = runOnce();

  assert.equal(first.stepsRun, 480);
  assert.equal(first.simulatedSeconds, 8);
  assert.equal(first.state.x, second.state.x);
  assert.deepEqual(first.samples, second.samples);
  assert.ok(first.state.x > 384, 'road segment should make the unit travel farther than field-only movement');
});
