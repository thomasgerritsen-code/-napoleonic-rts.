'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

test('game health observer loads after test lab and large-army performance authority', () => {
  const html = read('index.html');
  const performance = html.indexOf('src/systems/performance/large-army-v1.js');
  const testLab = html.indexOf('src/test-lab.js');
  const health = html.indexOf('src/systems/diagnostics/game-health-observer-v1.js');
  assert.ok(health > performance, 'health observer must wrap the final performance update chain');
  assert.ok(health > testLab, 'health observer must observe test-lab scenarios too');
});

test('health observer detects invalid positions, stuck movement, overlaps and artillery separation', () => {
  const source = read('src/systems/diagnostics/game-health-observer-v1.js');
  assert.match(source, /inspectPositions/);
  assert.match(source, /inspectStuckUnits/);
  assert.match(source, /inspectOverlaps/);
  assert.match(source, /inspectArtillery/);
  assert.match(source, /runtimeErrors/);
  assert.match(source, /unhandledRejections/);
});

test('health observer retains bounded performance history and exposes a report API', () => {
  const source = read('src/systems/diagnostics/game-health-observer-v1.js');
  assert.match(source, /performanceSamples\.length > 120/);
  assert.match(source, /medianFps/);
  assert.match(source, /p95FrameMs/);
  assert.match(source, /global\.__GAME_HEALTH__ = api/);
  assert.match(source, /report: buildReport/);
  assert.match(source, /reset/);
});
