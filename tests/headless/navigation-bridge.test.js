'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createSandbox,
  loadProductionScript,
  runFixedSteps,
  sweep
} = require('./harness');

const RIVER_HALF_WIDTH = 70;
const BRIDGE_HALF_WIDTH = 28;

function dedupePath(path, epsilon = 1.5) {
  const out = [];
  for (const point of path || []) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(last.x - point.x, last.y - point.y) > epsilon) {
      out.push({ x: point.x, y: point.y });
    }
  }
  return out;
}

function loadBridgeGeometry() {
  const crossing = {
    id: 'headless-bridge',
    name: 'Headless Bridge',
    type: 'bridge',
    x: 0,
    y: 0,
    angle: 0,
    length: 270,
    width: BRIDGE_HALF_WIDTH * 2
  };

  const { context, window } = createSandbox({
    seed: 20260829,
    globals: {
      URLSearchParams,
      location: { search: '?test=v070' },
      RIVER_NAV_HALF_WIDTH_V067: RIVER_HALF_WIDTH,
      bankSideV067: x => x,
      segmentWaterCrossingV067: (x1, y1, x2, y2) => {
        const crosses = (x1 < 0 && x2 > 0) || (x1 > 0 && x2 < 0);
        return crosses ? { crossing } : null;
      },
      dedupePathV065: path => dedupePath(path)
    }
  });

  loadProductionScript(context, 'src/foundation/config.js');
  loadProductionScript(context, 'src/systems/navigation/bridge-corridors.js');
  return { context, window, crossing };
}

function followPath(path, start) {
  const state = {
    x: start.x,
    y: start.y,
    pathIndex: 0,
    clippedWater: false,
    maxDeckPerp: 0,
    stallFrames: 0,
    maxStallFrames: 0,
    previousX: start.x,
    previousY: start.y
  };

  return runFixedSteps({
    durationSeconds: 20,
    hz: 60,
    state,
    step(current, dt) {
      const target = path[current.pathIndex];
      if (!target) return;
      const dx = target.x - current.x;
      const dy = target.y - current.y;
      const distance = Math.hypot(dx, dy);
      const stepDistance = Math.min(distance, 60 * dt);
      if (distance > 1e-9) {
        current.x += dx / distance * stepDistance;
        current.y += dy / distance * stepDistance;
      }
      if (distance <= 1.05) current.pathIndex++;

      const moved = Math.hypot(current.x - current.previousX, current.y - current.previousY);
      if (moved < 0.01 && current.pathIndex < path.length) current.stallFrames++;
      else current.stallFrames = 0;
      current.maxStallFrames = Math.max(current.maxStallFrames, current.stallFrames);
      current.previousX = current.x;
      current.previousY = current.y;

      if (Math.abs(current.x) <= RIVER_HALF_WIDTH) {
        current.maxDeckPerp = Math.max(current.maxDeckPerp, Math.abs(current.y));
        if (Math.abs(current.y) > BRIDGE_HALF_WIDTH) current.clippedWater = true;
      }
    },
    stop: current => current.pathIndex >= path.length
  });
}

function pointIndex(path, point, epsilon = 2.5) {
  return path.findIndex(candidate => Math.hypot(candidate.x - point.x, candidate.y - point.y) <= epsilon);
}

test('production bridge corridor keeps approach, entry and exit on the bridge centreline', () => {
  const { context, crossing } = loadBridgeGeometry();
  const corridor = context.bridgeCorridorArchitectureV2(crossing, -1);

  assert.equal(corridor.approach.y, 0);
  assert.equal(corridor.entry.y, 0);
  assert.equal(corridor.exit.y, 0);
  assert.equal(corridor.clear.y, 0);
  assert.ok(corridor.approach.x < corridor.entry.x);
  assert.ok(corridor.entry.x < corridor.exit.x);
  assert.ok(corridor.exit.x < corridor.clear.x);
});

test('angled approaches fully traverse production bridge corridors without clipping or stalling', () => {
  const angles = [-60, -45, -30, -15, 0, 15, 30, 45, 60];
  const { context, crossing } = loadBridgeGeometry();
  const corridor = context.bridgeCorridorArchitectureV2(crossing, -1);

  const results = sweep(angles, angle => {
    const radians = angle * Math.PI / 180;
    const start = {
      x: corridor.approach.x - 90,
      y: Math.tan(radians) * 85
    };
    const target = {
      x: corridor.clear.x + 140,
      y: -Math.tan(radians) * 70
    };
    const injected = context.injectBridgeCorridorsArchitectureV2(start, [target]);
    const simulation = followPath(injected.path, start);
    return { injected, simulation, target };
  });

  for (const { value: angle, result } of results) {
    const path = result.injected.path;
    const approachIndex = pointIndex(path, corridor.approach);
    const entryIndex = pointIndex(path, corridor.entry);
    const exitIndex = pointIndex(path, corridor.exit);
    const clearIndex = pointIndex(path, corridor.clear);

    assert.equal(result.injected.corridors.length, 1, `angle ${angle} should resolve one bridge corridor`);
    assert.equal(result.injected.corridors[0].id, crossing.id);
    assert.ok(approachIndex >= 0, `angle ${angle} omitted the approach portal`);
    assert.ok(entryIndex > approachIndex, `angle ${angle} reached entry before approach`);
    assert.ok(exitIndex > entryIndex, `angle ${angle} reached exit before entry`);
    assert.ok(clearIndex > exitIndex, `angle ${angle} reached clear before exit`);
    assert.equal(result.simulation.state.clippedWater, false, `angle ${angle} clipped a bridge corner`);
    assert.ok(result.simulation.state.maxDeckPerp <= BRIDGE_HALF_WIDTH, `angle ${angle} left the bridge deck`);
    assert.equal(result.simulation.state.pathIndex, path.length, `angle ${angle} did not finish the corridor`);
    assert.ok(result.simulation.state.maxStallFrames / 60 < 0.2, `angle ${angle} stalled on the corridor`);
    assert.ok(result.simulation.state.x > corridor.clear.x + 100, `angle ${angle} did not clear the bridge`);
  }
});
