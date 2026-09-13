const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const source = fs.readFileSync(path.join(root, 'src', 'systems', 'rendering', 'battlefield-3d-order-feedback-v1.mjs'), 'utf8');

test('3D order feedback throttles expensive rebuild work while keeping animation per frame', () => {
  assert.match(source, /REBUILD_INTERVAL_FRAMES = 12/);
  assert.match(source, /frame % REBUILD_INTERVAL_FRAMES === 1/);
  assert.match(source, /animateMarkers\(timeMs \/ 1000\)/);
  assert.match(source, /rebuildIntervalFrames: REBUILD_INTERVAL_FRAMES/);
});

test('3D order feedback reuses terrain raycast helpers instead of allocating them per target', () => {
  assert.match(source, /const terrainRaycaster = new THREE\.Raycaster\(\)/);
  assert.match(source, /const terrainRayOrigin = new THREE\.Vector3\(\)/);
  assert.match(source, /const terrainRayDirection = new THREE\.Vector3\(0, -1, 0\)/);
  assert.match(source, /if \(!terrainObject\) terrainObject = scene\.getObjectByName\('battlefield-terrain'\) \|\| null/);
  assert.match(source, /terrainObject = null;/);
  assert.doesNotMatch(source, /function terrainHeight[\s\S]*?new THREE\.Raycaster/);
});

test('3D and 2D dense-order feedback prioritize the nearest visible destinations', () => {
  assert.match(source, /function prioritizedTargets\(\)/);
  assert.match(source, /\.filter\(target => target\.distance >= MIN_DISTANCE\)/);
  assert.match(source, /\.sort\(\(a, b\) => a\.distance - b\.distance\)/);
  assert.match(source, /\.slice\(0, MAX_TARGETS\)/);
});
