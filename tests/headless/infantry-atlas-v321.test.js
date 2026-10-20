'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const path = require('node:path');

test('v321 Python atlas packer and validator pass real raster fixture regression suite', () => {
  const root = path.resolve(__dirname, '../..');
  const result = spawnSync('python3', [
    path.join(root, 'tests/headless/infantry_atlas_v321_cases.py'), '-v'
  ], {cwd: root, encoding:'utf8', timeout:120000});
  assert.equal(result.error, undefined, String(result.error));
  assert.equal(result.status, 0, result.stderr + '\n' + result.stdout);
  assert.match(result.stderr, /Ran 8 tests/);
  assert.match(result.stderr, /OK/);
});
