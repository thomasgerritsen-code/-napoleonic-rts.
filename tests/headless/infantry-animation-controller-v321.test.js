'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '../..');
const anim = require(path.join(root, 'graphics-lab/render/infantry-animation-controller.js'));
const atlas = require(path.join(root, 'graphics-lab/render/sprite-atlas-loader.js'));
const config = JSON.parse(fs.readFileSync(path.join(root, 'graphics-lab/assets/sprites/unit-animation-config.json'), 'utf8'));

function run(controller, id, steps) {
  const out = [];
  for (const [t, input] of steps) out.push({t, ...controller.update(id, t, input)});
  return out;
}

test('v321 controller walks march -> aim -> fire -> reload -> idle deterministically', () => {
  const c = anim.createInfantryAnimationController(config);
  const seen = [];
  const muzzles = [];
  for (let t = 0; t <= 6000; t += 16) {
    const moving = t < 1000, fireOrder = t >= 1000 && t < 1800;
    const r = c.update('fr:1', t, {moving, fireOrder});
    if (seen[seen.length - 1] !== r.state) seen.push(r.state);
    muzzles.push(...r.events);
    if (r.state === 'march') assert.ok(moving, 'march frames only while moving');
  }
  assert.deepEqual(seen, ['march', 'aim', 'fire', 'reload', 'idle']);
  assert.equal(muzzles.length, 1, 'exactly one muzzle event per volley');
  const again = anim.createInfantryAnimationController(config);
  const a = run(anim.createInfantryAnimationController(config), 'x', [[0, {moving: true}], [555, {moving: true}], [900, {}]]);
  const b = run(again, 'x', [[0, {moving: true}], [555, {moving: true}], [900, {}]]);
  assert.deepEqual(a, b);
});

test('v321 controller emits one muzzle event even across a large clock jump', () => {
  const c = anim.createInfantryAnimationController(config);
  c.update('br:3', 0, {fireOrder: true});
  const r = c.update('br:3', 1200, {fireOrder: true});
  assert.equal(r.events.filter(e => e.type === 'muzzle').length, 1);
  assert.equal(r.state, 'reload');
  assert.equal(c.metrics().muzzleEvents, 1);
});

test('v321 new march order interrupts fire/reload without a lingering fire frame', () => {
  const c = anim.createInfantryAnimationController(config);
  c.update('u', 0, {fireOrder: true});
  assert.equal(c.update('u', 560, {fireOrder: true}).state, 'fire');
  const r = c.update('u', 570, {moving: true, fireOrder: true});
  assert.equal(r.state, 'march');
  assert.deepEqual(r.events, []);
});

test('v321 paused clock keeps identical pose; loops use stable per-unit offsets', () => {
  const c = anim.createInfantryAnimationController(config);
  c.update('a', 0, {moving: true});
  const p1 = c.update('a', 777, {moving: true});
  const p2 = c.update('a', 777, {moving: true});
  assert.deepEqual(p1, p2);
  const frames = new Set();
  for (let i = 0; i < 32; i++) frames.add(c.update('fr:' + i, 300, {moving: true}).frame);
  assert.ok(frames.size >= 3, 'march frames vary across the regiment');
  for (const f of frames) assert.ok(f >= 0 && f < config.states.march.frames);
});

test('v321 atlas loader rejects sheets whose cells drift from the 6x3 contract', () => {
  const names = anim.frameNames('fr', config);
  const frames = {};
  let i = 0;
  for (const list of Object.values(names)) for (const n of list) {
    frames[n] = {frame: {x: (i % 6) * 96, y: Math.floor(i / 6) * 96, w: 96, h: 96}};
    i++;
  }
  const sheet = {frames, animations: names, meta: {image: 'x.png', size: {w: 576, h: 288}}};
  assert.equal(atlas.validateSheet(sheet, 'france', config, names), sheet);
  sheet.frames.fr_line_fire_02.frame.x += 1;
  assert.throws(() => atlas.validateSheet(sheet, 'france', config, names), /onjuiste cel/);
  assert.throws(() => anim.validateConfig({...config, muzzleEvent: {state: 'fire', frame: 9}}), /muzzleEvent/);
});
