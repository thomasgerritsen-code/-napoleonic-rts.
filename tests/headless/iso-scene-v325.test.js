'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dir = path.resolve(__dirname, '../../graphics-lab/assets/sprites/iso');
const DIRS = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'];

for (const prefix of ['fr', 'br']) {
  test(`v325 ${prefix} iso atlas: 8 directions x 21 drill frames in 176x128 cells with muzzle points`, () => {
    const sheet = JSON.parse(fs.readFileSync(path.join(dir, `${prefix}_iso_infantry_atlas.json`), 'utf8'));
    const png = fs.readFileSync(path.join(dir, sheet.meta.image));
    assert.equal(png.readUInt32BE(16), 3696);
    assert.equal(png.readUInt32BE(20), 1024);
    assert.equal(png[25], 6, 'RGBA PNG');
    assert.deepEqual(sheet.meta.size, {w: 3696, h: 1024});
    assert.deepEqual(sheet.meta.cell, {w: 176, h: 128});
    assert.deepEqual(sheet.meta.directions, DIRS);
    assert.equal(Object.keys(sheet.frames).length, 168);
    const states = [['idle', 2], ['march', 6], ['aim', 2], ['fire', 3], ['reload', 4], ['die', 4]];
    DIRS.forEach((d, row) => {
      const names = states.flatMap(([s, n]) => {
        assert.equal(sheet.animations[s + '_' + d].length, n, `${s}_${d}`);
        return sheet.animations[s + '_' + d];
      });
      names.forEach((name, col) => {
        assert.deepEqual(sheet.frames[name].frame, {x: col * 176, y: row * 128, w: 176, h: 128});
      });
      const m = sheet.meta.muzzle.px[d];
      assert.ok(m.x > 0 && m.x < 176 && m.y > 0 && m.y < 128, `muzzle ${d} inside the cell`);
    });
    // The lab's v321 controller fires on fire frame index 1; the atlas must agree.
    const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../graphics-lab/assets/sprites/unit-animation-config.json'), 'utf8'));
    assert.deepEqual({state: sheet.meta.muzzle.state, frame: sheet.meta.muzzle.frame}, config.muzzleEvent);
  });
}

test('v325 iso provenance is original and explicitly not yet approved for the game', () => {
  const p = JSON.parse(fs.readFileSync(path.join(dir, 'provenance.json'), 'utf8'));
  assert.equal(p.sourceType, 'original');
  assert.equal(p.reviewedForUse, false);
  assert.match(p.sourceRef, /render-iso-infantry\.py/);
});

const isoDir = path.resolve(__dirname, '../../graphics-lab/assets/iso');
const layout = JSON.parse(fs.readFileSync(path.join(isoDir, 'layout.json'), 'utf8'));

test('v325 every layout prop has a rendered sprite whose PNG matches props.json', () => {
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

test('v325 Blender terrain exists and no prop stands on the marching road', () => {
  const jpg = fs.readFileSync(path.join(isoDir, layout.ground.image));
  assert.equal(jpg.readUInt16BE(0), 0xffd8, 'JPEG');
  const r = layout.road, apothem = r.radius * Math.cos(Math.PI / 8);
  for (const p of layout.props) {
    const sector = Math.PI / 4 * Math.round(Math.atan2(p.y, p.x) / (Math.PI / 4));
    const fromRing = Math.abs(p.x * Math.cos(sector) + p.y * Math.sin(sector) - apothem);
    assert.ok(fromRing > r.width / 2 + 0.5, `${p.type} at ${p.x},${p.y} blocks the road`);
  }
});
