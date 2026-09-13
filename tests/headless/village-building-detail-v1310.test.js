'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const moduleSource = read('src/systems/rendering/battlefield-3d-village-buildings-v1.mjs');
const html = read('index.html');

test('v1.3.10 village detail remains render-only and preserves simulation identity', () => {
  assert.match(moduleSource, /contract: 'render-only-building-detail-v1'/);
  assert.match(moduleSource, /renderOnly: true/);
  assert.match(moduleSource, /const sceneryId = object\?\.userData\?\.sceneryId/);
  assert.match(moduleSource, /rebuildHouse\(object, housesById\.get\(sceneryId\)\)/);
  assert.doesNotMatch(moduleSource, /NRTS_GAME\s*\./);
  assert.doesNotMatch(moduleSource, /collision|pathfinding|routePlanner/i);
});

test('v1.3.10 replaces pyramid roofs with gable building geometry and facade detail', () => {
  assert.match(moduleSource, /function gableRoofGeometry/);
  assert.match(moduleSource, /gableRoofs: true/);
  assert.match(moduleSource, /facadeOpenings: true/);
  assert.match(moduleSource, /chimneys: true/);
  assert.match(moduleSource, /innSigns: true/);
  assert.match(moduleSource, /chapelSpires: true/);
  assert.match(moduleSource, /addWindow\(/);
  assert.match(moduleSource, /addDoor\(/);
});

test('v1.3.10 building detail loads after the base 3D renderer', () => {
  const base = html.indexOf('battlefield-3d-v1.mjs?build=1310a');
  const detail = html.indexOf('battlefield-3d-village-buildings-v1.mjs?build=1310a');
  assert.ok(base >= 0, 'base 3D renderer is wired');
  assert.ok(detail > base, 'detail module loads after the base renderer');
  assert.match(html, /Napoleonic RTS v1\.3\.10/);
});
