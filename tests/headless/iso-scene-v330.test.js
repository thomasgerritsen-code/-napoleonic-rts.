'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dir = path.resolve(__dirname, '../../graphics-lab/assets/sprites/iso');
const DIRS = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'];

// Width/height of a PNG or a WebP (VP8X, as written by Pillow for lossy+alpha).
function imageSize(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString('ascii', 1, 4) === 'PNG') return {w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), alpha: buf[25] === 6};
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
  assert.equal(buf.toString('ascii', 12, 16), 'VP8X', 'extended WebP with alpha');
  return {w: buf.readUIntLE(24, 3) + 1, h: buf.readUIntLE(27, 3) + 1, alpha: (buf[20] & 0x10) !== 0};
}

for (const prefix of ['fr', 'br', 'fr2', 'br2', 'fr3', 'br3', 'fr4', 'br4', 'fr5', 'br5']) {
  const load = kind => JSON.parse(fs.readFileSync(path.join(dir, `${prefix}_iso_${kind}_atlas.json`), 'utf8'));
  const checkSheet = (sheet, states, width) => {
    assert.match(sheet.meta.image, /\.webp$/);
    assert.deepEqual(imageSize(path.join(dir, sheet.meta.image)), {w: width, h: 1024, alpha: true});
    assert.deepEqual(sheet.meta.size, {w: width, h: 1024});
    assert.deepEqual(sheet.meta.cell, {w: 176, h: 128});
    assert.deepEqual(sheet.meta.directions, DIRS);
    assert.equal(Object.keys(sheet.frames).length, 8 * states.reduce((n, [, c]) => n + c, 0));
    DIRS.forEach((d, row) => {
      const names = states.flatMap(([s, n]) => {
        assert.equal(sheet.animations[s + '_' + d].length, n, `${s}_${d}`);
        return sheet.animations[s + '_' + d];
      });
      names.forEach((name, col) => {
        assert.deepEqual(sheet.frames[name].frame, {x: col * 176, y: row * 128, w: 176, h: 128});
      });
    });
  };

  test(`v330 ${prefix} infantry atlas: 8 directions x 17 drill frames with muzzle points`, () => {
    const sheet = load('infantry');
    checkSheet(sheet, [['idle', 2], ['march', 6], ['aim', 2], ['fire', 3], ['reload', 4]], 2992);
    for (const d of DIRS) {
      const m = sheet.meta.muzzle.px[d];
      assert.ok(m.x > 0 && m.x < 176 && m.y > 0 && m.y < 128, `muzzle ${d} inside the cell`);
    }
    // The lab's v321 controller fires on fire frame index 1; the atlas must agree.
    const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../graphics-lab/assets/sprites/unit-animation-config.json'), 'utf8'));
    assert.deepEqual({state: sheet.meta.muzzle.state, frame: sheet.meta.muzzle.frame}, config.muzzleEvent);
  });

  test(`v330 ${prefix} fallen atlas: three falls x 4 frames in 8 directions`, () => {
    checkSheet(load('fallen'), [['die', 4], ['diefwd', 4], ['dieside', 4]], 2112);
  });

  test(`v330 ${prefix} combat atlas: kneeling fire with muzzle points, misfire, charge, thrust`, () => {
    const sheet = load('combat');
    checkSheet(sheet, [['kaim', 2], ['kfire', 3], ['misfire', 3], ['charge', 6], ['thrust', 3]], 2992);
    assert.equal(sheet.meta.muzzle.state, 'kfire');
    for (const d of DIRS) {
      const m = sheet.meta.muzzle.px[d];
      assert.ok(m.x > 0 && m.x < 176 && m.y > 0 && m.y < 128, `kneeling muzzle ${d} inside the cell`);
    }
  });

  test(`v330 ${prefix} morale and idle atlases: rout, crawl, cheer / look, adjust, lean`, () => {
    checkSheet(load('morale'), [['rout', 6], ['crawl', 4], ['cheer', 2]], 2112);
    checkSheet(load('idlex'), [['look', 4], ['adjust', 4], ['lean', 2]], 1760);
  });
}

for (const [key, role] of [['fro', 'officer'], ['frd', 'drummer'], ['fre', 'ensign'], ['bro', 'officer'], ['brd', 'drummer'], ['bre', 'ensign']]) {
  test(`v330 ${key} ${role} atlas: idle, march and command in 8 directions, 176x160 cells`, () => {
    const sheet = JSON.parse(fs.readFileSync(path.join(dir, `${key}_iso_${role}_atlas.json`), 'utf8'));
    assert.deepEqual(imageSize(path.join(dir, sheet.meta.image)), {w: 1760, h: 1280, alpha: true});
    assert.deepEqual(sheet.meta.cell, {w: 176, h: 160});
    assert.deepEqual(sheet.meta.pivot, {x: 88, y: 140});
    DIRS.forEach((d, row) => {
      const names = [['idle', 2], ['march', 6], ['command', 2]].flatMap(([s, n]) => {
        assert.equal(sheet.animations[s + '_' + d].length, n, `${s}_${d}`);
        return sheet.animations[s + '_' + d];
      });
      names.forEach((name, col) => assert.deepEqual(sheet.frames[name].frame, {x: col * 176, y: row * 160, w: 176, h: 160}));
    });
  });
}

test('v330 iso provenance is original and explicitly not yet approved for the game', () => {
  const p = JSON.parse(fs.readFileSync(path.join(dir, 'provenance.json'), 'utf8'));
  assert.equal(p.sourceType, 'original');
  assert.equal(p.reviewedForUse, false);
  assert.match(p.sourceRef, /render-iso-infantry\.py/);
});

const isoDir = path.resolve(__dirname, '../../graphics-lab/assets/iso');
const layout = JSON.parse(fs.readFileSync(path.join(isoDir, 'layout.json'), 'utf8'));

test('v330 every layout prop has a rendered WebP sprite whose size matches props.json', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(isoDir, 'props/props.json'), 'utf8'));
  assert.ok(layout.props.length > 30);
  for (const p of layout.props) {
    const meta = manifest.props[p.type];
    assert.ok(meta, `sprite for ${p.type}`);
    assert.match(meta.image, /\.webp$/);
    const size = imageSize(path.join(isoDir, 'props', meta.image));
    assert.equal(size.w, meta.w, `${p.type} width`);
    assert.equal(size.h, meta.h, `${p.type} height`);
    assert.ok(meta.pivot.x > 0 && meta.pivot.x < meta.w && meta.pivot.y > 0 && meta.pivot.y < meta.h);
  }
});

test('v330 Blender terrain exists and no prop stands on the marching road', () => {
  const jpg = fs.readFileSync(path.join(isoDir, layout.ground.image));
  assert.equal(jpg.readUInt16BE(0), 0xffd8, 'JPEG');
  const r = layout.road, apothem = r.radius * Math.cos(Math.PI / 8);
  for (const p of layout.props) {
    const sector = Math.PI / 4 * Math.round(Math.atan2(p.y, p.x) / (Math.PI / 4));
    const fromRing = Math.abs(p.x * Math.cos(sector) + p.y * Math.sin(sector) - apothem);
    assert.ok(fromRing > r.width / 2 + 0.5, `${p.type} at ${p.x},${p.y} blocks the road`);
  }
});

for (const prefix of ['fr', 'br']) {
  test(`v334 ${prefix} artillery atlases: gun with muzzle points, gunner drill and falls`, () => {
    const load = name => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    const gun = load(`${prefix}g_iso_gun_atlas.json`);
    assert.deepEqual(imageSize(path.join(dir, gun.meta.image)), {w: 1792, h: 1408, alpha: true});
    assert.deepEqual(gun.meta.cell, {w: 256, h: 176});
    assert.deepEqual(gun.meta.pivot, {x: 128, y: 112});
    assert.equal(gun.meta.muzzle.state, 'fire');
    for (const d of DIRS) {
      for (const [state, n] of [['idle', 1], ['fire', 2], ['roll', 4]]) assert.equal(gun.animations[`${state}_${d}`].length, n);
      const m = gun.meta.muzzle.px[d];
      assert.ok(m.x > 0 && m.x < 256 && m.y > 0 && m.y < 176, `muzzle ${d} inside the cell`);
    }
    const sheets = {gunner: [['idle', 2], ['ram', 4], ['load', 2], ['aim', 2], ['ready', 2], ['touch', 2], ['haul', 4]],
      gunner2: [['march', 6], ['die', 4], ['diefwd', 4], ['dieside', 4]]};
    for (const [kind, states] of Object.entries(sheets)) {
      const sheet = load(`${prefix}a_iso_${kind}_atlas.json`);
      assert.deepEqual(imageSize(path.join(dir, sheet.meta.image)), {w: 3168, h: 1024, alpha: true});
      for (const d of DIRS) for (const [state, n] of states) assert.equal(sheet.animations[`${state}_${d}`].length, n, `${kind} ${state}_${d}`);
    }
  });
}

for (const key of ['frc', 'frc2', 'brc', 'brc2']) {
  test(`v335 ${key} cavalry atlases: walk, gallop, slash, rear and fall in 8 directions`, () => {
    const sheets = {cavalry: [[['idle', 2], ['walk', 6], ['gallop', 6]], 3136], cavfight: [[['slash', 3], ['rear', 2], ['die', 4]], 2016]};
    for (const [kind, [states, width]] of Object.entries(sheets)) {
      const sheet = JSON.parse(fs.readFileSync(path.join(dir, `${key}_iso_${kind}_atlas.json`), 'utf8'));
      assert.deepEqual(imageSize(path.join(dir, sheet.meta.image)), {w: width, h: 1536, alpha: true});
      assert.deepEqual(sheet.meta.cell, {w: 224, h: 192});
      assert.deepEqual(sheet.meta.pivot, {x: 112, y: 152});
      for (const d of DIRS) for (const [state, n] of states) assert.equal(sheet.animations[`${state}_${d}`].length, n, `${kind} ${state}_${d}`);
    }
  });
}
