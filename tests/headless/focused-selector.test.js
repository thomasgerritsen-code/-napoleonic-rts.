'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { selectFocusedTests } = require('../../scripts/select-focused-tests');

test('navigation changes select navigation, traffic and water coverage', () => {
  const selected = selectFocusedTests(['src/systems/navigation/bridge-safety.js']);
  assert.deepEqual(selected, [
    'tests/foundation-v071.spec.js',
    'tests/navigation-v2.spec.js',
    'tests/traffic-v068.spec.js',
    'tests/water-v067.spec.js'
  ]);
});

test('movement changes select movement, motion and speed coverage', () => {
  const selected = selectFocusedTests(['src/systems/movement/speed-model.js']);
  assert.deepEqual(selected, [
    'tests/foundation-v071.spec.js',
    'tests/motion-v071.spec.js',
    'tests/movement-formation-consolidation.spec.js',
    'tests/speed-v071.spec.js'
  ]);
});

test('AI changes stay focused on AI plus the foundation smoke test', () => {
  const selected = selectFocusedTests(['src/systems/ai/production.js']);
  assert.deepEqual(selected, [
    'tests/ai-separation.spec.js',
    'tests/foundation-v071.spec.js'
  ]);
});

test('core runtime changes add the broader RTS smoke test', () => {
  const selected = selectFocusedTests(['index.html']);
  assert.deepEqual(selected, [
    'tests/foundation-v071.spec.js',
    'tests/rts.spec.js'
  ]);
});

test('documentation-only changes keep browser coverage minimal', () => {
  const selected = selectFocusedTests(['docs/testing-architecture.md']);
  assert.deepEqual(selected, ['tests/foundation-v071.spec.js']);
});
