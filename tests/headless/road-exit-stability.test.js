'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '../../src/systems/movement/road-exit-stability.js'), 'utf8');

function loadHarness(kind) {
  const reg = {
    kind,
    path: [{ x: 200, y: 100 }],
    pathIndex: 0,
    marchV063: {
      v064: true,
      anchorX: 100,
      anchorY: 100,
      marchFacing: Math.PI / 2,
      speedV064: kind === 'cavalry' ? 70 : 42
    }
  };
  const context = {
    window: {},
    regiments: [reg],
    elapsed: 10,
    groupKindV06: value => value.kind,
    roadAtV064: () => false,
    updateGroupPathsV06: () => {},
    Math
  };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(source, context, { filename:'road-exit-stability.js' });
  return { context, reg, api: context.window.NRTS_ROAD_EXIT_V2 };
}

for (const kind of ['infantry', 'cavalry']) {
  const { reg, api } = loadHarness(kind);
  const march = reg.marchV063;

  // Seed the previous frame on-road, then cross onto field terrain.
  api.stabilize(reg, march, true, 9.9);
  api.stabilize(reg, march, false, 10.0);

  assert.ok(Math.abs(march.marchFacing) < 1e-9, `${kind}: heading should point directly at the field waypoint`);
  assert.strictEqual(march.roadExitTransitionsV2, 1, `${kind}: road exit should be registered exactly once`);
  assert.ok(march.roadExitStabilizeUntilV2 > 10.5, `${kind}: transition should remain stabilized while formation expands`);

  // A rotating slot layout must not drag the anchor back into a turn during the transition.
  march.marchFacing = Math.PI * 0.75;
  api.stabilize(reg, march, false, 10.25);
  assert.ok(Math.abs(march.marchFacing) < 1e-9, `${kind}: field transition should keep the anchor on-route`);
  assert.strictEqual(march.roadExitTransitionsV2, 1, `${kind}: staying off-road must not retrigger the transition`);
}

console.log('road-exit-stability headless regression passed');
