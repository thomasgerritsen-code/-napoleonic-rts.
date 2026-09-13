'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const index = fs.readFileSync('index.html', 'utf8');
const hook = fs.readFileSync('src/systems/rendering/battlefield-3d-scene-hook-v1.mjs', 'utf8');
const feedback3d = fs.readFileSync('src/systems/rendering/battlefield-3d-order-feedback-v1.mjs', 'utf8');
const version = fs.readFileSync('src/foundation/version.js', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

test('3D order feedback loads after the base 3D renderer', () => {
  const rendererIndex = index.indexOf('battlefield-3d-v1.mjs');
  const feedbackIndex = index.indexOf('battlefield-3d-order-feedback-v1.mjs');
  assert.ok(rendererIndex >= 0, 'base 3D renderer must be loaded');
  assert.ok(feedbackIndex > rendererIndex, '3D order feedback must load after the base renderer');
});

test('scene hook exposes read-only active scene/camera access and preserves scenery compatibility', () => {
  assert.match(hook, /WebGLRenderer\.prototype\.render/);
  assert.match(hook, /scene:\s*\(\)\s*=>\s*activeScene/);
  assert.match(hook, /camera:\s*\(\)\s*=>\s*activeCamera/);
  assert.match(hook, /window\.__NRTS_THREE_SCENE__\s*=\s*scene/);
});

test('3D feedback reads existing order targets and never writes movement targets', () => {
  assert.match(feedback3d, /RTS_ORDER_FEEDBACK/);
  assert.match(feedback3d, /feedback\.getTargets\(\)/);
  assert.match(feedback3d, /LineDashedMaterial/);
  assert.match(feedback3d, /RingGeometry/);
  assert.match(feedback3d, /battlefield\.enabled\(\)/);
  assert.doesNotMatch(feedback3d, /targetX\s*=/);
  assert.doesNotMatch(feedback3d, /targetY\s*=/);
  assert.doesNotMatch(feedback3d, /dispatch\(/);
});

test('release identity is consistently v1.3.20', () => {
  assert.equal(pkg.version, '1.3.20');
  assert.match(version, /VERSION = '1\.3\.20'/);
  assert.match(index, /Napoleonic RTS v1\.3\.20/);
  assert.match(index, /class="version">v1\.3\.20/);
});
