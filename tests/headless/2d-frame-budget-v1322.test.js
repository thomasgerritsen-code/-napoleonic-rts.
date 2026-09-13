const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const renderPath = path.join(__dirname, '..', '..', 'src', 'simulation-render.js');
const source = fs.readFileSync(renderPath, 'utf8');

test('legacy HUD refresh is throttled instead of running every simulation tick', () => {
  assert.match(source, /const HUD_REFRESH_INTERVAL = 0\.10/);
  assert.match(source, /hudRefreshAccumulator \+= dt/);
  assert.match(source, /if \(hudRefreshAccumulator >= HUD_REFRESH_INTERVAL\)/);
  assert.doesNotMatch(source, /clampCamera\(\);\s*updateHud\(\);/);
});

test('legacy 2D renderer culls offscreen world entities before canvas work', () => {
  assert.match(source, /function isWorldVisible\(x, y, padding = 0\)/);
  assert.match(source, /r\.dead \|\| !isWorldVisible\(r\.x, r\.y, 28\)/);
  assert.match(source, /b\.dead \|\| !isWorldVisible\(b\.x, b\.y/);
  assert.match(source, /u\.dead \|\| !isWorldVisible\(u\.x, u\.y, 30\)/);
  assert.match(source, /if \(!isWorldVisible\(c\.x, c\.y, 70\)\) continue/);
  assert.match(source, /if \(!isWorldVisible\(p\.x, p\.y, 8\)\) return/);
});
