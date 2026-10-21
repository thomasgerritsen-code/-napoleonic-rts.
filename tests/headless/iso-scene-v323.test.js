'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dir = path.resolve(__dirname, '../../graphics-lab/assets/sprites/iso');
const DIRS = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'];

for (const prefix of ['fr', 'br']) {
  test(`v323 ${prefix} iso atlas: 8 directions x (2 idle + 6 march) in 128 px cells`, () => {
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

test('v323 iso provenance is original and explicitly not yet approved for the game', () => {
  const p = JSON.parse(fs.readFileSync(path.join(dir, 'provenance.json'), 'utf8'));
  assert.equal(p.sourceType, 'original');
  assert.equal(p.reviewedForUse, false);
  assert.match(p.sourceRef, /render-iso-infantry\.py/);
});

const isoDir = path.resolve(__dirname, '../../graphics-lab/assets/iso');
const layout = JSON.parse(fs.readFileSync(path.join(isoDir, 'layout.json'), 'utf8'));

test('v323 every layout prop has a rendered sprite whose PNG matches props.json', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(isoDir, 'props/props.json'), 'utf8'));
  assert.ok(layout.props.length > 30);
  for (const p of layout.props) {
    const meta = manifest.props[p.type];
    assert.ok(meta, `sprite for ${p.type}`);
    const png = fs.readFileSync(path.join(isoDir, 'props', meta.image));
    assert.equal(png.readUInt32BE(16), meta.w, `${p.type} width`);
    assert.equal(png.readUInt32BE(20), meta.h, `${p.type} height`);
    assert.ok(meta.pivot.x > 0 && meta.pivot.x < meta.w && meta.pivot.y > 0 && meta.pivot.y < meta.h);
  }
});

test('v323 Blender terrain exists and no prop stands on the marching road', () => {
  const jpg = fs.readFileSync(path.join(isoDir, layout.ground.image));
  assert.equal(jpg.readUInt16BE(0), 0xffd8, 'JPEG');
  const r = layout.road, apothem = r.radius * Math.cos(Math.PI / 8);
  for (const p of layout.props) {
    const sector = Math.PI / 4 * Math.round(Math.atan2(p.y, p.x) / (Math.PI / 4));
    const fromRing = Math.abs(p.x * Math.cos(sector) + p.y * Math.sin(sector) - apothem);
    assert.ok(fromRing > r.width / 2 + 0.5, `${p.type} at ${p.x},${p.y} blocks the road`);
  }
});
