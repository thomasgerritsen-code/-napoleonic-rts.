'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { selectFocusedTests } = require('../../scripts/select-focused-tests');

test('navigation changes select navigation, traffic and water coverage', () => {
  const selected = selectFocusedTests(['src/systems/navigation/bridge-safety.js']);
  assert.deepEqual(selected, [
    'tests/navigation-v2.spec.js',
    'tests/smoke-v1.spec.js',
    'tests/traffic-v068.spec.js',
    'tests/water-v067.spec.js'
  ]);
});

test('Battlefield V7 bundle keeps browser coverage targeted on smoke and village regressions', () => {
  const selected = selectFocusedTests([
    'index.html',
    'src/systems/world/map-expansion-v7.js',
    'src/systems/world/village-scale-v7.js',
    'src/systems/navigation/road-index.js',
    'src/systems/navigation/route-planner.js',
    'src/systems/navigation/village-obstacles-v7.js',
    'tests/village-navigation-v7.spec.js'
  ]);
  assert.deepEqual(selected, [
    'tests/smoke-v1.spec.js',
    'tests/village-navigation-v7.spec.js',
    'tests/village-renderer-v2.spec.js'
  ]);
});

test('movement changes select movement, motion and speed coverage', () => {
  const selected = selectFocusedTests(['src/systems/movement/speed-model.js']);
  assert.deepEqual(selected, [
    'tests/motion-v071.spec.js',
    'tests/movement-formation-consolidation.spec.js',
    'tests/smoke-v1.spec.js',
    'tests/speed-v071.spec.js'
  ]);
});

test('AI changes stay focused on AI plus the lightweight smoke test', () => {
  const selected = selectFocusedTests(['src/systems/ai/production.js']);
  assert.deepEqual(selected, [
    'tests/ai-separation.spec.js',
    'tests/smoke-v1.spec.js'
  ]);
});

test('index changes include the village regression because the settlement bundle is loaded there', () => {
  const selected = selectFocusedTests(['index.html']);
  assert.deepEqual(selected, [
    'tests/smoke-v1.spec.js',
    'tests/village-renderer-v2.spec.js'
  ]);
});

test('village renderer changes stay lightweight but always verify the settlement model', () => {
  const selected = selectFocusedTests(['src/systems/world/village-renderer-v2.js']);
  assert.deepEqual(selected, [
    'tests/smoke-v1.spec.js',
    'tests/village-renderer-v2.spec.js'
  ]);
});

test('village collision and building placement changes verify settlement exclusion', () => {
  for (const file of ['src/systems/world/village-collision-v4.js','src/systems/world/building-placement.js']) {
    const selected = selectFocusedTests([file]);
    assert.deepEqual(selected, [
      'tests/smoke-v1.spec.js',
      'tests/village-renderer-v2.spec.js'
    ]);
  }
});

test('Architecture V2.1 config changes select foundation plus the compact service regression', () => {
  const selected = selectFocusedTests(['src/foundation/config.js']);
  assert.deepEqual(selected, [
    'tests/architecture-v21.spec.js',
    'tests/foundation-v071.spec.js',
    'tests/smoke-v1.spec.js'
  ]);
});

test('Architecture V2.1 world service changes stay compact', () => {
  const selected = selectFocusedTests(['src/systems/world/api.js']);
  assert.deepEqual(selected, [
    'tests/architecture-v21.spec.js',
    'tests/smoke-v1.spec.js'
  ]);
});

test('Architecture V2.1 navigation facade changes stay compact', () => {
  const selected = selectFocusedTests(['src/systems/navigation/api.js']);
  assert.deepEqual(selected, [
    'tests/architecture-v21.spec.js',
    'tests/smoke-v1.spec.js'
  ]);
});

test('Architecture V2.1 movement facade changes stay compact', () => {
  const selected = selectFocusedTests(['src/systems/movement/api.js']);
  assert.deepEqual(selected, [
    'tests/architecture-v21.spec.js',
    'tests/smoke-v1.spec.js'
  ]);
});

test('documentation-only changes keep browser coverage minimal', () => {
  const selected = selectFocusedTests(['docs/testing-architecture.md']);
  assert.deepEqual(selected, ['tests/smoke-v1.spec.js']);
});
