'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function extract(file, from, to, context) {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', file), 'utf8');
  const start = source.indexOf(from);
  const end = source.indexOf(to, start + from.length);
  assert.ok(start >= 0 && end > start, 'Expected formation implementation must exist');
  vm.runInNewContext(source.slice(start, end), context);
}

test('road-column uses four infantry files regardless of regiment size', () => {
  const members = Array.from({ length: 19 }, (_, id) => ({ id, type: 'infantry' }));
  const context = { regimentMembers: () => members, groupKindV06: () => 'infantry' };
  extract('src/v063.js', 'function marchColumnOffsetsV063(', 'function applyFormationTargetsV063(', context);
  const offsets = vm.runInNewContext('marchColumnOffsetsV063({})', context);
  assert.equal(offsets.size, 19);
  assert.equal(new Set(members.slice(0, 4).map(u => offsets.get(u.id).ox)).size, 1);
  assert.equal(new Set(members.slice(0, 4).map(u => offsets.get(u.id).oy)).size, 4);
  assert.equal(offsets.get(4).ox, offsets.get(0).ox - 20);
  assert.equal(offsets.get(16).ox, offsets.get(0).ox - 80);
});

test('short gaps do not interrupt road column, sustained exit does', () => {
  const context = { elapsed: 10 };
  extract('src/v064.js', 'function stableRoadMarchV064(', 'function updateRoadBlendV064(', context);
  const road = onRoad => vm.runInNewContext('stableRoadMarchV064(march, onRoad)', { ...context, march, onRoad });
  const march = {};
  assert.equal(road(true), true);
  context.elapsed = 11;
  assert.equal(road(false), true);
  context.elapsed = 11.49;
  assert.equal(road(false), true);
  context.elapsed = 11.5;
  assert.equal(road(false), false);
  assert.equal(road(true), true);
  assert.equal(road(false), true);
});
