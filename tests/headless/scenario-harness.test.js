'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createDeterministicRandom,
  runFixedSteps,
  sweep
} = require('./harness');

test('deterministic random generator reproduces identical sequences', () => {
  const a = createDeterministicRandom(987654);
  const b = createDeterministicRandom(987654);
  const c = createDeterministicRandom(123456);

  const seqA = Array.from({ length: 12 }, () => a());
  const seqB = Array.from({ length: 12 }, () => b());
  const seqC = Array.from({ length: 12 }, () => c());

  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, seqC);
});

test('fixed-step runner can simulate long game time without wall-clock waiting', () => {
  const result = runFixedSteps({
    durationSeconds: 60,
    hz: 60,
    state: { distance: 0 },
    step(state, dt) {
      state.distance += 75 * dt;
    }
  });

  assert.equal(result.stepsRun, 3600);
  assert.ok(Math.abs(result.state.distance - 4500) < 1e-8);
});

test('scenario sweeps make angle and parameter matrices cheap to execute', () => {
  const angles = [-60, -45, -30, -15, 0, 15, 30, 45, 60];
  const results = sweep(angles, angle => {
    const radians = angle * Math.PI / 180;
    return {
      x: Math.cos(radians),
      y: Math.sin(radians)
    };
  });

  assert.equal(results.length, angles.length);
  assert.equal(results[4].value, 0);
  assert.ok(Math.abs(results[4].result.x - 1) < 1e-12);
  assert.ok(Math.abs(results[4].result.y) < 1e-12);
});
