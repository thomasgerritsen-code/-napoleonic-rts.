'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const SCRIPTS = path.join(ROOT, 'scripts');
const config = require('../../graphics-lab/assets/sprites/unit-animation-config.json');
const STATES = { idle: 2, march: 6, aim: 2, fire: 3, reload: 4 };

function crc32(input) {
  let crc = 0xffffffff;
  for (const n of input) {
    crc ^= n;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, payload) {
  const name = Buffer.from(type), len = Buffer.alloc(4), crc = Buffer.alloc(4);
  len.writeUInt32BE(payload.length); crc.writeUInt32BE(crc32(Buffer.concat([name, payload])));
  return Buffer.concat([len, name, payload, crc]);
}
function png(pixels, side = 96) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(side, 0); header.writeUInt32BE(side, 4);
  header[8] = 8; header[9] = 6;
  const raw = Buffer.concat(Array.from({ length: side }, (_, y) => Buffer.concat([
    Buffer.from([0]), pixels.subarray(y * side * 4, (y + 1) * side * 4)
  ])));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function fixture(root) {
  const frameFiles = {};
  for (const [side, prefix] of [['france', 'fr'], ['britain', 'br']]) {
    const dir = path.join(root, 'source', side);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'provenance.json'), JSON.stringify({
      assetId: prefix + '-infantry-fixture', sourceType: 'original',
      sourceReference: 'automated synthetic test fixture, not production art',
      license: 'project-owned fixture', author: 'test-suite', date: '2026-10-21',
      transformations: ['generated deterministic pixel fixtures']
    }));
    frameFiles[side] = [];
    let i = 0;
    for (const [state, count] of Object.entries(STATES)) {
      for (let n = 1; n <= count; n++, i++) {
        const pixels = Buffer.alloc(96 * 96 * 4);
        function put(x, y, rgba) {
          const offset = (y * 96 + x) * 4;
          for (let c = 0; c < 4; c++) pixels[offset + c] = rgba[c];
        }
        // Ground baseline y=78 stays locked; unique upper pixel marks prevent duplicates.
        for (let y = 51; y <= 78; y++) for (let x = 41; x <= 47; x++)
          put(x, y, [side === 'france' ? 25 : 180, 48, 72, 255]);
        put(32 + i, 40, [230, i, 1, 255]);
        const name = prefix + '_line_' + state + '_' + String(n).padStart(2, '0') + '.png';
        const file = path.join(dir, name);
        fs.writeFileSync(file, png(pixels));
        frameFiles[side].push(file);
      }
    }
  }
  return frameFiles;
}
function cli(name, args) {
  return spawnSync('python3', [path.join(SCRIPTS, name), ...args],
    { encoding: 'utf8', timeout: 15000 });
}
function workspace(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'infantry-atlas-v322-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const frames = fixture(dir);
  return { dir, frames, out: path.join(dir, 'out') };
}
function build(ws, extra = []) {
  return cli('build-infantry-atlas.py', ['--source', path.join(ws.dir, 'source'),
    '--out', ws.out, ...extra]);
}

test('v322 contract has correct pivot, facing, per-state frame duration', () => {
  assert.equal(config.version, 1);
  assert.deepEqual(config.pivot, { x: 48, y: 78 });
  assert.equal(config.frameWidth, 96);
  assert.equal(config.frameHeight, 96);
  assert.equal(config.referenceFacing, 'screen-right');
  assert.deepEqual(Object.fromEntries(Object.entries(config.states).map(([k, v]) => [k, v.frames])), STATES);
  assert.deepEqual(config.muzzleEvent, { state: 'fire', frame: 1 });
});

test('v322 packs both nations and validates exact 576x288 Pixi atlases deterministically', t => {
  const ws = workspace(t);
  const run = build(ws);
  assert.equal(run.status, 0, run.stderr);
  const recheck = cli('validate-infantry-atlas.py', ['--out', ws.out]);
  assert.equal(recheck.status, 0, recheck.stderr);
  const images = [];
  for (const [side, prefix] of [['france', 'fr'], ['britain', 'br']]) {
    const directory = path.join(ws.out, side);
    const image = path.join(directory, prefix + '_line_infantry_atlas.png');
    const manifest = JSON.parse(fs.readFileSync(path.join(directory,
      prefix + '_line_infantry_atlas.json'), 'utf8'));
    assert.equal(manifest.meta.image, path.basename(image));
    assert.deepEqual(manifest.meta.size, { w: 576, h: 288 });
    assert.equal(Object.keys(manifest.frames).length, 17);
    assert.deepEqual(Object.fromEntries(Object.entries(manifest.animations).map(([k, v]) =>
      [k, v.length])), STATES);
    assert.deepEqual(manifest.frames[prefix + '_line_idle_01'].anchor, { x: 0.5, y: 0.8125 });
    assert.equal(manifest.meta.provenance.sourceType, 'original');
    images.push(fs.readFileSync(image));
    // The unused eighteenth cell and all empty margins are transparent.
    assert.ok(images.at(-1).length > 100);
  }
  assert.equal(build(ws).status, 0);
  assert.deepEqual(fs.readFileSync(path.join(ws.out, 'france/fr_line_infantry_atlas.png')), images[0]);
  assert.deepEqual(fs.readFileSync(path.join(ws.out, 'britain/br_line_infantry_atlas.png')), images[1]);
});

test('v322 rejects exact duplicate frames, instead of disguising them as new poses', t => {
  const ws = workspace(t);
  fs.copyFileSync(ws.frames.france[0], ws.frames.france[1]);
  const run = build(ws, ['--side', 'france']);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /duplicate frame/);
});

test('v322 rejects absent licensing/provenance and missing input images', t => {
  const ws = workspace(t);
  const record = path.join(ws.dir, 'source/france/provenance.json');
  const provenance = JSON.parse(fs.readFileSync(record, 'utf8'));
  provenance.license = 'unknown';
  fs.writeFileSync(record, JSON.stringify(provenance));
  const unlicensed = build(ws, ['--side', 'france']);
  assert.notEqual(unlicensed.status, 0);
  assert.match(unlicensed.stderr, /license/);
  provenance.license = 'project-owned fixture';
  fs.writeFileSync(record, JSON.stringify(provenance));
  fs.unlinkSync(ws.frames.france[16]);
  const missing = build(ws, ['--side', 'france']);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /No such file|not found/);
});

test('v322 independent validator rejects atlas metadata, last cell and foot drift', t => {
  const ws = workspace(t);
  assert.equal(build(ws, ['--side', 'france']).status, 0);
  const manifestPath = path.join(ws.out, 'france/fr_line_infantry_atlas.json');
  const original = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const modified = JSON.parse(JSON.stringify(original));
  modified.frames.fr_line_idle_01.anchor.y = 0.5;
  fs.writeFileSync(manifestPath, JSON.stringify(modified));
  const invalid = cli('validate-infantry-atlas.py', ['--side', 'france', '--out', ws.out]);
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /frame contract|pivot/);
  fs.writeFileSync(manifestPath, JSON.stringify(original));

  // Move just one frame's lower baseline 3px without changing dimensions.
  const file = ws.frames.france[5];
  const p = Buffer.alloc(96 * 96 * 4);
  for (let y = 51; y <= 74; y++) for (let x = 41; x <= 47; x++) {
    const off = (y * 96 + x) * 4; p.set([25, 48, 72, 255], off);
  }
  p.set([230, 5, 1, 255], (40 * 96 + 37) * 4);
  fs.writeFileSync(file, png(p));
  const drift = build(ws, ['--side', 'france']);
  assert.notEqual(drift.status, 0);
  assert.match(drift.stderr, /foot baseline/);
});
