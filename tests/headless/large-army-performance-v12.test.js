'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

test('v1.2 loads the large-army performance authority after gameplay/render authorities', () => {
  const html = read('index.html');
  const perf = html.indexOf('src/systems/performance/large-army-v1.js');
  const characters = html.indexOf('src/systems/rendering/characters.js');
  const movement = html.indexOf('src/systems/movement/stuck-recovery-v1.js');
  assert.ok(perf > characters, 'performance authority must wrap the final character renderer');
  assert.ok(perf > movement, 'performance authority must wrap the final gameplay update chain');
});

test('large-army combat targeting uses spatial cells instead of a full unit scan', () => {
  const source = read('src/systems/performance/large-army-v1.js');
  assert.match(source, /const CELL = 160/);
  assert.match(source, /nearestEnemyEntitySpatial/);
  assert.match(source, /grid\?\.get/);
  assert.match(source, /prepareFrameIndexes/);
  assert.doesNotMatch(source, /for \(const other of units\)/);
});

test('large-army authority caches regiment membership once per frame with immediate fallbacks', () => {
  const source = read('src/systems/performance/large-army-v1.js');
  assert.match(source, /membersByRegiment/);
  assert.match(source, /regimentMembersCached/);
  assert.match(source, /regimentById/);
  assert.match(source, /getRegimentCached/);
  assert.match(source, /getRegimentBeforePerformanceV12/);
  assert.match(source, /regimentMembersBeforePerformanceV12/);
  assert.match(source, /immediateLookupFallbacks: true/);
});

test('large-army authority camera-culls expensive render entities', () => {
  const source = read('src/systems/performance/large-army-v1.js');
  assert.match(source, /drawUnitCameraCulledV12/);
  assert.match(source, /drawResourceCameraCulledV12/);
  assert.match(source, /drawBuildingCameraCulledV12/);
  assert.match(source, /cameraCulling: true/);
});
