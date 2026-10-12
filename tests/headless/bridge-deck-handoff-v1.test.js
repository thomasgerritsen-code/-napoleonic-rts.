'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness() {
  const source = fs.readFileSync(path.join(__dirname, '../../src/v068.js'), 'utf8');
  const start = source.indexOf('function cancelTrafficForRegV068(');
  const end = source.indexOf('function prepareCrossingTrafficV068(', start);
  assert.ok(start >= 0 && end > start, 'Expected real bridge-queue implementation');
  const crossing = { id: 'pont-test', name: 'Pont Test', x: 0, y: 0, angle: 0, width: 98, length: 120 };
  const formerHolder = {
    id: 1, destroyed: false, members: [{ x: 0, y: 0, dead: false }],
    marchV063: { v064: true },
    crossingTrafficV068: { crossingId: crossing.id, state: 'crossing', initialSide: -1 }
  };
  const next = {
    id: 2, destroyed: false, members: [{ x: -180, y: 0, dead: false }],
    marchV063: { v064: true },
    crossingTrafficV068: { crossingId: crossing.id, state: 'waiting', initialSide: 1 }
  };
  const regiments = [formerHolder, next];
  const state = { crossing, capacity: 1, holderIds: [formerHolder.id], queue: [next.id] };
  const context = vm.createContext({
    regiments, CROSSING_TRAFFIC_V068: new Map([[crossing.id, state]]), elapsed: 10,
    getRegiment: id => regiments.find(reg => reg.id === id),
    regimentMembers: reg => reg.members,
    groupKindV06: () => 'infantry',
    crossingLocalV068: (c, x, y) => ({ along: x - c.x, perp: y - c.y })
  });
  vm.runInContext(source.slice(start, end), context);
  return { context, state, formerHolder, next };
}

test('new march order does not grant a bridge still occupied by an unreserved regiment', () => {
  const { context, state, formerHolder, next } = harness();
  context.formerHolder = formerHolder;
  vm.runInContext('cancelTrafficForRegV068(formerHolder); promoteTrafficQueuesV068();', context);
  assert.deepEqual(state.holderIds, [], 'former holder has relinquished its logical reservation');
  assert.deepEqual(state.queue, [next.id], 'queued opponent must not enter while soldiers remain on deck');
  assert.equal(next.crossingTrafficV068.state, 'waiting');

  formerHolder.members[0].x = 120; // beyond the entire bridge deck and clearance
  vm.runInContext('promoteTrafficQueuesV068();', context);
  assert.deepEqual(state.holderIds, [next.id], 'next regiment should proceed as soon as deck is actually free');
  assert.deepEqual(state.queue, []);
  assert.equal(next.crossingTrafficV068.state, 'approach');
});

test('dead bridge occupants do not reserve a bridge forever', () => {
  const { context, state, formerHolder, next } = harness();
  context.formerHolder = formerHolder;
  formerHolder.members[0].dead = true;
  vm.runInContext('cancelTrafficForRegV068(formerHolder); promoteTrafficQueuesV068();', context);
  assert.deepEqual(state.holderIds, [next.id]);
});

test('a queued regiment already on the deck can regain its own reservation', () => {
  const { context, state, formerHolder } = harness();
  state.holderIds = [];
  state.queue = [formerHolder.id];
  formerHolder.crossingTrafficV068.state = 'waiting';
  vm.runInContext('promoteTrafficQueuesV068();', context);
  assert.deepEqual(state.holderIds, [formerHolder.id]);
  assert.equal(formerHolder.crossingTrafficV068.state, 'approach');
});
