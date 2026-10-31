'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const index = fs.readFileSync('play.html', 'utf8');
const feedback2d = fs.readFileSync('src/systems/rendering/order-target-feedback-v1.js', 'utf8');

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

test('formation destination preview is wired in the 2D runtime', () => {
  assert.ok(index.includes('order-target-feedback-v1.js?build=1321a'));
});
