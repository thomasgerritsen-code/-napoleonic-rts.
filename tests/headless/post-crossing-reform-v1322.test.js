'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const index = fs.readFileSync('index.html', 'utf8');
const source = fs.readFileSync('src/systems/movement/post-crossing-reform-v1322.js', 'utf8');

test('post-crossing reform loads after formation traffic and before AI order discipline', () => {
  const traffic = index.indexOf('src/systems/movement/formation-traffic-v1.js');
  const reform = index.indexOf('src/systems/movement/post-crossing-reform-v1322.js?build=1322b');
  const ai = index.indexOf('src/systems/ai/order-discipline-v1322.js');
  assert.ok(traffic >= 0 && reform > traffic && ai > reform);
});

test('bridge columns expand progressively instead of snapping straight back to full width', () => {
  assert.match(source, /REFORM_SECONDS=2\.6/);
  assert.match(source, /START_LATERAL_SCALE=\.28/);
  assert.match(source, /START_LONGITUDINAL_SCALE=\.82/);
  assert.match(source, /function scaledOffsets\(offsets,progress\)/);
  assert.match(source, /oy:\(Number\(o\.oy\)\|\|0\)\*lateral/);
});

test('regrouping limits snap turns and gates anchor speed until followers catch up', () => {
  assert.match(source, /TURN_RATE=Math\.PI\*\.24/);
  assert.match(source, /function disciplinedFacing\(state,desired,t\)/);
  assert.match(source, /const ready=readiness\(reg\)/);
  assert.match(source, /MIN_SPEED_FACTOR=\.66/);
  assert.match(source, /return base\*factor/);
});

test('new explicit orders always override automatic regrouping and passing bias cannot derail early reform', () => {
  assert.match(source, /explicitOrderAfterBegin/);
  assert.match(source, /finish\(reg,state,'new-order'\)/);
  assert.match(source, /bias\?\.reason==='right-hand-pass'/);
  assert.match(source, /reg\.formationTrafficV132=null/);
  assert.match(source, /explicitOrdersWin:true/);
});
