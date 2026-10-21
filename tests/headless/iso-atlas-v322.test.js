'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dir = path.resolve(__dirname, '../../graphics-lab/assets/sprites/iso');
const DIRS = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'];

for (const prefix of ['fr', 'br']) {
  test(`v322 ${prefix} iso atlas: 8 directions x (2 idle + 6 march) in 128 px cells`, () => {
    const sheet = JSON.parse(fs.readFileSync(path.join(dir, `${prefix}_iso_infantry_atlas.json`), 'utf8'));
    const png = fs.readFileSync(path.join(dir, sheet.meta.image));
    assert.equal(png.readUInt32BE(16), 1024);
    assert.equal(png.readUInt32BE(20), 1024);
    assert.equal(png[25], 6, 'RGBA PNG');
    assert.deepEqual(sheet.meta.size, {w: 1024, h: 1024});
    assert.deepEqual(sheet.meta.directions, DIRS);
    assert.equal(Object.keys(sheet.frames).length, 64);
    DIRS.forEach((d, row) => {
      assert.equal(sheet.animations['idle_' + d].length, 2);
      assert.equal(sheet.animations['march_' + d].length, 6);
      [...sheet.animations['idle_' + d], ...sheet.animations['march_' + d]].forEach((name, col) => {
        assert.deepEqual(sheet.frames[name].frame, {x: col * 128, y: row * 128, w: 128, h: 128});
      });
    });
  });
}

test('v322 iso provenance is original and explicitly not yet approved for the game', () => {
  const p = JSON.parse(fs.readFileSync(path.join(dir, 'provenance.json'), 'utf8'));
  assert.equal(p.sourceType, 'original');
  assert.equal(p.reviewedForUse, false);
  assert.match(p.sourceRef, /render-iso-infantry\.py/);
});
