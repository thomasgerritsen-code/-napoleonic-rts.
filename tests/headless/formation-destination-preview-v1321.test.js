'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const index = fs.readFileSync('index.html', 'utf8');
const feedback2d = fs.readFileSync('src/systems/rendering/order-target-feedback-v1.js', 'utf8');
const feedback3d = fs.readFileSync('src/systems/rendering/battlefield-3d-order-feedback-v1.mjs', 'utf8');
const version = fs.readFileSync('src/foundation/version.js', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

test('regiment order targets expose a footprint derived from production formation offsets', () => {
  assert.match(feedback2d, /regimentRoleOffsets\(reg, reg\.formation\)/);
  assert.match(feedback2d, /footprint/);
  assert.match(feedback2d, /width:/);
  assert.match(feedback2d, /depth:/);
  assert.doesNotMatch(feedback2d, /\.targetX\s*=/);
  assert.doesNotMatch(feedback2d, /\.targetY\s*=/);
});

test('2D battlefield draws the destination footprint and reports its dimensions', () => {
  assert.match(feedback2d, /drawFormationFootprint/);
  assert.match(feedback2d, /fillRect\(/);
  assert.match(feedback2d, /strokeRect\(/);
  assert.match(feedback2d, /footprintLabel/);
});

test('3D battlefield mirrors the same landing zone without movement authority', () => {
  assert.match(feedback3d, /target\.footprint/);
  assert.match(feedback3d, /PlaneGeometry\(width, depth\)/);
  assert.match(feedback3d, /EdgesGeometry/);
  assert.match(feedback3d, /orderFootprint/);
  assert.doesNotMatch(feedback3d, /\.targetX\s*=/);
  assert.doesNotMatch(feedback3d, /\.targetY\s*=/);
});

test('release identity and cache keys are consistently v1.3.21', () => {
  assert.equal(pkg.version, '1.3.21');
  assert.match(version, /VERSION = '1\.3\.21'/);
  assert.match(index, /Napoleonic RTS v1\.3\.21/);
  assert.match(index, /class="version">v1\.3\.21/);
  assert.match(index, /order-target-feedback-v1\.js\?build=1321a/);
  assert.match(index, /battlefield-3d-order-feedback-v1\.mjs\?build=1321a/);
});
