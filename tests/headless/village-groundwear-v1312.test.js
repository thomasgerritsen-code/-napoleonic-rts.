'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const moduleSource = read('src/systems/rendering/battlefield-3d-village-groundwear-v1.mjs');
const html = read('index.html');
const packageVersion = JSON.parse(read('package.json')).version;

test('v1.3.12 village ground wear stays render-only and exposes five lived-in yard features', () => {
  assert.match(moduleSource, /contract: 'render-only-village-ground-wear-v1'/);
  assert.match(moduleSource, /renderOnly: true/);
  assert.match(moduleSource, /thresholdWear: true/);
  assert.match(moduleSource, /wheelRuts: true/);
  assert.match(moduleSource, /steppingStones: true/);
  assert.match(moduleSource, /woodpiles: true/);
  assert.match(moduleSource, /troughs: true/);
  assert.doesNotMatch(moduleSource, /NRTS_GAME\s*\./);
  assert.doesNotMatch(moduleSource, /collision|pathfinding|routePlanner/i);
});

test('v1.3.12 ground wear loads after base village props and release identity follows package version', () => {
  const props = html.indexOf('battlefield-3d-village-props-v1.mjs?build=1312a');
  const wear = html.indexOf('battlefield-3d-village-groundwear-v1.mjs?build=1312a');
  assert.ok(props >= 0, 'village props are wired with the v1.3.12 cache key');
  assert.ok(wear > props, 'ground wear loads after village props');
  assert.match(html, new RegExp(`Napoleonic RTS v${packageVersion.replace(/\./g, '\\.')}`));
  assert.match(html, /src\/foundation\/version\.js\?build=\w+/);
});
