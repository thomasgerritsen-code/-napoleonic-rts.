'use strict';
// Continuous runtime diagnostics for automated game-health checks.
(function installGameHealthObserver(global) {
  const nrts = global.NRTS;
  if (!nrts) throw new Error('NRTS foundation runtime must load before game health observer.');

  const SAMPLE_INTERVAL = 0.5;
  const STUCK_AFTER = 6;
  const STUCK_MOVE_EPSILON = 2.5;
  const TARGET_DISTANCE_MIN = 16;
  const OVERLAP_CELL = 32;
  const OVERLAP_DISTANCE = 8;
  const MAX_RECENT_EVENTS = 80;

  const tracked = new Map();
  const recentEvents = [];
  const counters = {
    samples: 0,
    invalidPositions: 0,
    outsideWorld: 0,
    stuckUnits: 0,
    overlaps: 0,
    artilleryCrewDetached: 0,
    runtimeErrors: 0,
    unhandledRejections: 0
  };
  const performanceSamples = [];
  let sampleClock = 0;
  let lastReport = null;

  function pushEvent(type, message, data = null) {
    recentEvents.push({ at: +(typeof elapsed === 'number' ? elapsed : 0).toFixed(2), type, message, data });
    if (recentEvents.length > MAX_RECENT_EVENTS) recentEvents.shift();
  }

  function finitePosition(entity) {
    return Number.isFinite(entity?.x) && Number.isFinite(entity?.y);
  }

  function inspectPositions(living) {
    let invalid = 0;
    let outside = 0;
    for (const unit of living) {
      if (!finitePosition(unit)) {
        invalid++;
        pushEvent('invalid-position', `unit ${unit.id} has non-finite coordinates`);
        continue;
      }
      if (unit.x < -2 || unit.y < -2 || unit.x > WORLD.width + 2 || unit.y > WORLD.height + 2) {
        outside++;
        pushEvent('outside-world', `unit ${unit.id} is outside world`, { x: unit.x, y: unit.y });
      }
    }
    counters.invalidPositions = invalid;
    counters.outsideWorld = outside;
  }

  function inspectStuckUnits(living) {
    let stuck = 0;
    const aliveIds = new Set();
    const now = typeof elapsed === 'number' ? elapsed : 0;

    for (const unit of living) {
      aliveIds.add(unit.id);
      if (!finitePosition(unit)) continue;
      const hasTarget = Number.isFinite(unit.targetX) && Number.isFinite(unit.targetY);
      const targetDistance = hasTarget ? Math.hypot(unit.targetX - unit.x, unit.targetY - unit.y) : 0;
      const shouldMove = hasTarget && targetDistance > TARGET_DISTANCE_MIN && !unit.routing;
      let state = tracked.get(unit.id);
      if (!state) {
        state = { x: unit.x, y: unit.y, movedAt: now, reported: false };
        tracked.set(unit.id, state);
      }

      const moved = Math.hypot(unit.x - state.x, unit.y - state.y);
      if (moved >= STUCK_MOVE_EPSILON || !shouldMove) {
        state.x = unit.x;
        state.y = unit.y;
        state.movedAt = now;
        state.reported = false;
      } else if (now - state.movedAt >= STUCK_AFTER) {
        stuck++;
        if (!state.reported) {
          state.reported = true;
          pushEvent('stuck-unit', `unit ${unit.id} has not progressed for ${Math.round(now - state.movedAt)}s`, { targetDistance: +targetDistance.toFixed(1), regimentId: unit.regimentId || null });
        }
      }
    }

    for (const id of tracked.keys()) if (!aliveIds.has(id)) tracked.delete(id);
    counters.stuckUnits = stuck;
  }

  function inspectOverlaps(living) {
    const grid = new Map();
    let overlaps = 0;
    const key = (x, y) => `${Math.floor(x / OVERLAP_CELL)},${Math.floor(y / OVERLAP_CELL)}`;

    for (const unit of living) {
      if (!finitePosition(unit)) continue;
      const cx = Math.floor(unit.x / OVERLAP_CELL);
      const cy = Math.floor(unit.y / OVERLAP_CELL);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const bucket = grid.get(`${cx + ox},${cy + oy}`);
          if (!bucket) continue;
          for (const other of bucket) {
            if (unit.regimentId && unit.regimentId === other.regimentId) continue;
            const d2 = (unit.x - other.x) ** 2 + (unit.y - other.y) ** 2;
            if (d2 < OVERLAP_DISTANCE ** 2) overlaps++;
          }
        }
      }
      const ownKey = key(unit.x, unit.y);
      let bucket = grid.get(ownKey);
      if (!bucket) grid.set(ownKey, bucket = []);
      bucket.push(unit);
    }
    counters.overlaps = overlaps;
  }

  function inspectArtillery() {
    let detached = 0;
    for (const reg of regiments) {
      if (reg.destroyed || typeof groupKindV06 !== 'function' || groupKindV06(reg) !== 'artillery') continue;
      const members = regimentMembers(reg).filter(unit => !unit.dead);
      const cannon = members.find(unit => unit.type === 'artillery');
      if (!cannon) continue;
      for (const crew of members) {
        if (crew === cannon) continue;
        if (Math.hypot(crew.x - cannon.x, crew.y - cannon.y) > 115) detached++;
      }
    }
    counters.artilleryCrewDetached = detached;
  }

  function capturePerformance() {
    const metrics = global.RTS_SIM?.getMetrics?.() || {};
    const sample = {
      at: +(typeof elapsed === 'number' ? elapsed : 0).toFixed(2),
      fps: Number(metrics.fps) || 0,
      frameMs: Number(metrics.frameMs) || 0,
      updateMs: Number(metrics.updateMs) || 0,
      drawMs: Number(metrics.drawMs) || 0,
      livingUnits: Number(metrics.livingUnits) || units.filter(unit => !unit.dead).length,
      combatCandidates: Number(metrics.avgCombatCandidates) || 0
    };
    performanceSamples.push(sample);
    if (performanceSamples.length > 120) performanceSamples.shift();
  }

  function percentile(values, p) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
  }

  function summarizePerformance() {
    const active = performanceSamples.filter(sample => sample.fps > 0 && sample.frameMs > 0);
    return {
      samples: active.length,
      medianFps: +percentile(active.map(sample => sample.fps), 0.5).toFixed(1),
      p95FrameMs: +percentile(active.map(sample => sample.frameMs), 0.95).toFixed(2),
      p95UpdateMs: +percentile(active.map(sample => sample.updateMs), 0.95).toFixed(2),
      p95DrawMs: +percentile(active.map(sample => sample.drawMs), 0.95).toFixed(2),
      maxLivingUnits: active.reduce((max, sample) => Math.max(max, sample.livingUnits), 0)
    };
  }

  function buildReport() {
    const simulationAudit = global.RTS_SIM?.audit?.() || { ok: true, errors: [], warnings: [] };
    const perf = summarizePerformance();
    const errors = [];
    const warnings = [];

    if (counters.invalidPositions) errors.push(`${counters.invalidPositions} unit(s) with invalid coordinates`);
    if (counters.outsideWorld) errors.push(`${counters.outsideWorld} unit(s) outside world bounds`);
    if (counters.runtimeErrors) errors.push(`${counters.runtimeErrors} runtime error(s)`);
    if (counters.unhandledRejections) errors.push(`${counters.unhandledRejections} unhandled rejection(s)`);
    if (counters.stuckUnits) warnings.push(`${counters.stuckUnits} unit(s) appear stuck`);
    if (counters.overlaps) warnings.push(`${counters.overlaps} cross-regiment overlap pair(s)`);
    if (counters.artilleryCrewDetached) warnings.push(`${counters.artilleryCrewDetached} artillery crew member(s) detached`);
    if (perf.maxLivingUnits >= 500 && perf.samples >= 4 && perf.p95FrameMs > 50) warnings.push(`large-army p95 frame time is ${perf.p95FrameMs}ms`);
    for (const error of simulationAudit.errors || []) errors.push(`simulation: ${error}`);
    for (const warning of simulationAudit.warnings || []) warnings.push(`simulation: ${warning}`);

    lastReport = {
      schema: 'napoleonic-rts-game-health-v1',
      version: global.RTS_VERSION_INFO?.version || global.RTS_SIM?.version || null,
      scenario: global.__RTS_DEBUG__?.getScenario?.() || null,
      elapsed: +(typeof elapsed === 'number' ? elapsed : 0).toFixed(2),
      ok: errors.length === 0,
      status: errors.length ? 'FAIL' : warnings.length ? 'WARNING' : 'OK',
      errors,
      warnings,
      counters: { ...counters },
      performance: perf,
      recentEvents: recentEvents.slice(-30),
      simulationAudit
    };
    return lastReport;
  }

  function sample() {
    const living = units.filter(unit => !unit.dead);
    counters.samples++;
    inspectPositions(living);
    inspectStuckUnits(living);
    inspectOverlaps(living);
    inspectArtillery();
    capturePerformance();
    return buildReport();
  }

  function reset() {
    tracked.clear();
    recentEvents.length = 0;
    performanceSamples.length = 0;
    for (const key of Object.keys(counters)) counters[key] = 0;
    sampleClock = 0;
    lastReport = null;
    return true;
  }

  global.addEventListener('error', event => {
    counters.runtimeErrors++;
    pushEvent('runtime-error', event.message || 'runtime error');
  });
  global.addEventListener('unhandledrejection', event => {
    counters.unhandledRejections++;
    pushEvent('unhandled-rejection', String(event.reason || 'unhandled rejection'));
  });

  const updateBeforeHealthObserver = update;
  update = function updateWithGameHealthObserver(dt) {
    updateBeforeHealthObserver(dt);
    sampleClock += dt;
    if (sampleClock >= SAMPLE_INTERVAL) {
      sampleClock %= SAMPLE_INTERVAL;
      sample();
    }
  };

  const api = Object.freeze({
    version: 'game-health-v1',
    sample,
    report: buildReport,
    reset,
    getRecentEvents: () => [...recentEvents],
    getPerformanceSamples: () => [...performanceSamples]
  });
  global.__GAME_HEALTH__ = api;
  if (!nrts.subsystems.has('game-health-observer')) {
    nrts.subsystems.register('game-health-observer', api, {
      phase: 'diagnostics',
      legacyBridge: false,
      responsibility: 'continuous simulation health, stuck/overlap/runtime error and performance diagnostics'
    });
  }
})(window);
