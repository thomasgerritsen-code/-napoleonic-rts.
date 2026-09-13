const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('v1.3.11 village props stay render-only and expose all five yard-detail features', () => {
  const moduleText = read('src/systems/rendering/battlefield-3d-village-props-v1.mjs');
  const index = read('index.html');
  const version = read('src/foundation/version.js');
  const pkg = JSON.parse(read('package.json'));

  assert.match(moduleText, /contract: 'render-only-village-props-v1'/);
  assert.match(moduleText, /renderOnly: true/);
  for (const marker of ['barrels: true', 'crates: true', 'hayBales: true', 'carts: true', 'fences: true']) {
    assert.ok(moduleText.includes(marker), `missing feature marker: ${marker}`);
  }
  assert.match(moduleText, /object\.userData\.propsContract = 'village-props-render-only-v1'/);
  assert.match(index, /battlefield-3d-village-buildings-v1\.mjs\?build=1310a[\s\S]*battlefield-3d-village-props-v1\.mjs\?build=13(?:11|12)a[\s\S]*battlefield-3d-village-landscape-v1\.mjs/);
  const escapedVersion = pkg.version.replace(/\./g, '\\.');
  assert.match(version, new RegExp(`const VERSION = '${escapedVersion}'`));
});
