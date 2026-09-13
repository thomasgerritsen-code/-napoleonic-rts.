const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const feedback = fs.readFileSync(path.join(root, 'src', 'systems', 'rendering', 'order-target-feedback-v1.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const version = fs.readFileSync(path.join(root, 'src', 'foundation', 'version.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('selected movement orders expose battlefield target markers without changing movement authority', () => {
  assert.match(feedback, /function regimentOrderTargets\(\)/);
  assert.match(feedback, /function looseOrderTarget\(\)/);
  assert.match(feedback, /ctx\.setLineDash/);
  assert.match(feedback, /Math\.round\(target\.distance\)/);
  assert.match(feedback, /MIN_VISIBLE_DISTANCE = 28/);
  assert.match(feedback, /RTS_ORDER_FEEDBACK/);
  assert.doesNotMatch(feedback, /\.targetX\s*=/);
  assert.doesNotMatch(feedback, /\.targetY\s*=/);
});

test('order markers remain screen-readable and safe across zoom levels', () => {
  assert.match(feedback, /function safeZoom\(\)/);
  assert.match(feedback, /zoom > 0\.05 \? zoom : 1/);
  assert.match(feedback, /MARKER_RADIUS_PX = 12/);
  assert.match(feedback, /const radius = \(MARKER_RADIUS_PX \* pulse\) \/ zoom/);
  assert.match(feedback, /const halo = MARKER_HALO_PX \/ zoom/);
  assert.match(feedback, /const cross = 7 \/ zoom/);
  assert.match(feedback, /ctx\.scale\(zoom, zoom\)/);
});

test('order feedback loads after the base 2D renderer and release identity is consistent', () => {
  const baseIndex = index.indexOf('src/simulation-render.js');
  const feedbackIndex = index.indexOf('src/systems/rendering/order-target-feedback-v1.js?build=1319a');
  assert.ok(baseIndex >= 0, 'base renderer script should exist');
  assert.ok(feedbackIndex > baseIndex, 'feedback wrapper should load after the base renderer');
  assert.match(index, /Napoleonic RTS v1\.3\.19/);
  assert.match(index, /<span class="version">v1\.3\.19<\/span>/);
  assert.match(version, /const VERSION = '1\.3\.19'/);
  assert.equal(pkg.version, '1.3.19');
});
