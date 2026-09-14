'use strict';
// ---------- v1.4.1: AI command cohesion stability polish ----------
// Lightweight gameplay layer: suppresses near-identical command spam, lets coherent
// formations advance from actual readiness, and chooses the less congested enemy flank.

(() => {
  if (typeof aiOrderReg !== 'function' || typeof aiChooseState !== 'function' || typeof aiTransition !== 'function') return;

  const ORDER_TOLERANCE = 26;
  const FACING_TOLERANCE = 0.14;
  const ORDER_REFRESH_SECONDS = 3.5;
  const MASS_READY_DISTANCE = 165;
  const ADVANCE_READY_DISTANCE = 470;
  const ADVANCE_P75_DISTANCE = 520;
  const CACHE_STALE_SECONDS = 45;
  const CLEANUP_INTERVAL_SECONDS = 10;

  const stats = {
    issued: 0,
    suppressed: 0,
    earlyAdvance: 0,
    earlyAttack: 0,
    flankEvaluations: 0,
    cleanupRuns: 0,
    staleOrdersPruned: 0,
    lastReadiness: 0,
    lastAdvanceDistance: null,
    lastAdvanceP75: null,
    lastFlankPressure: null
  };
  const orderCache = new Map();
  let lastCleanupAt = -Infinity;

  function nowSeconds() {
    return Number.isFinite(elapsed) ? elapsed : 0;
  }

  function angleDelta(a, b) {
    let d = (a || 0) - (b || 0);
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d);
  }

  function usableRegiments(regs) {
    if (!Array.isArray(regs)) return [];
    return regs.filter(reg => reg && !reg.destroyed);
  }

  function regimentReadiness(regs, point, radius) {
    const active = usableRegiments(regs);
    if (!point || !active.length) return 0;
    let ready = 0;
    for (const reg of active) {
      const c = aiRegCenter(reg);
      if (Math.hypot(c.x - point.x, c.y - point.y) <= radius) ready++;
    }
    return ready / active.length;
  }

  function targetDistances(regs, target) {
    const active = usableRegiments(regs);
    if (!target || !active.length) return [];
    const distances = [];
    for (const reg of active) {
      const c = aiRegCenter(reg);
      const distance = Math.hypot(c.x - target.x, c.y - target.y);
      if (Number.isFinite(distance)) distances.push(distance);
    }
    return distances;
  }

  function meanDistanceToTarget(regs, target) {
    const distances = targetDistances(regs, target);
    if (!distances.length) return Infinity;
    let total = 0;
    for (const distance of distances) total += distance;
    return total / distances.length;
  }

  function percentileDistanceToTarget(regs, target, percentile = 0.75) {
    const distances = targetDistances(regs, target).sort((a, b) => a - b);
    if (!distances.length) return Infinity;
    const p = Math.min(1, Math.max(0, percentile));
    const index = Math.min(distances.length - 1, Math.ceil(p * distances.length) - 1);
    return distances[Math.max(0, index)];
  }

  function cleanupOrderCache(force = false) {
    const now = nowSeconds();
    if (!force && now - lastCleanupAt < CLEANUP_INTERVAL_SECONDS) return;
    lastCleanupAt = now;
    stats.cleanupRuns++;

    let alive = null;
    if (typeof activeRegiments === 'function') {
      try { alive = new Set(activeRegiments('britain').filter(reg => reg && !reg.destroyed).map(reg => reg.id)); }
      catch { alive = null; }
    }

    for (const [id, order] of orderCache) {
      const staleByAge = !order || now - order.at > CACHE_STALE_SECONDS;
      const staleByRoster = alive && !alive.has(id);
      if (staleByAge || staleByRoster) {
        orderCache.delete(id);
        stats.staleOrdersPruned++;
      }
    }
  }

  const baseOrderReg = aiOrderReg;
  aiOrderReg = function aiOrderRegV141(reg, p, formation = 'line', facing = null) {
    if (!reg || reg.destroyed || !p) return;
    cleanupOrderCache();
    const now = nowSeconds();
    const previous = orderCache.get(reg.id);
    const facingStable = facing == null || previous?.facing == null || angleDelta(facing, previous.facing) < FACING_TOLERANCE;
    const sameIntent = previous && previous.formation === formation && facingStable &&
      Math.hypot(p.x - previous.x, p.y - previous.y) < ORDER_TOLERANCE &&
      now - previous.at < ORDER_REFRESH_SECONDS;

    if (sameIntent) {
      stats.suppressed++;
      return;
    }

    orderCache.set(reg.id, { x:p.x, y:p.y, formation, facing, at:now });
    stats.issued++;
    return baseOrderReg(reg, p, formation, facing);
  };

  const baseChooseState = aiChooseState;
  aiChooseState = function aiChooseStateV141(regs) {
    cleanupOrderCache();
    const proposed = baseChooseState(regs);
    const state = AI_COMMANDER_V1.state;
    const age = nowSeconds() - AI_COMMANDER_V1.stateSince;

    if (state === 'MASS' && proposed === 'MASS' && age > 5 && AI_COMMANDER_V1.regroupPoint) {
      const readiness = regimentReadiness(regs, AI_COMMANDER_V1.regroupPoint, MASS_READY_DISTANCE);
      stats.lastReadiness = readiness;
      if (readiness >= 0.75) {
        stats.earlyAdvance++;
        return 'ADVANCE';
      }
    }

    if (state === 'ADVANCE' && proposed === 'ADVANCE' && age > 6 && AI_COMMANDER_V1.target) {
      const meanDistance = meanDistanceToTarget(regs, AI_COMMANDER_V1.target);
      const p75Distance = percentileDistanceToTarget(regs, AI_COMMANDER_V1.target, 0.75);
      stats.lastAdvanceDistance = Number.isFinite(meanDistance) ? meanDistance : null;
      stats.lastAdvanceP75 = Number.isFinite(p75Distance) ? p75Distance : null;
      // Mean distance preserves the existing behaviour; the p75 guard prevents a compact
      // leading element from dragging a badly stretched formation into ATTACK too early.
      if (meanDistance <= ADVANCE_READY_DISTANCE && p75Distance <= ADVANCE_P75_DISTANCE) {
        stats.earlyAttack++;
        return 'ATTACK';
      }
    }

    return proposed;
  };

  function chooseOpenFlank() {
    const tc = aiBritishTC();
    const target = AI_COMMANDER_V1.target;
    if (!tc || !target) return null;
    const d = aiDirection(tc, target);
    let left = 0;
    let right = 0;
    let samples = 0;

    for (const u of aiCombatUnits('france')) {
      if (!u || u.dead || u.routing) continue;
      const rx = u.x - target.x;
      const ry = u.y - target.y;
      const along = rx * d.x + ry * d.y;
      const lateral = -rx * d.y + ry * d.x;
      if (Math.abs(along) > 520 || Math.abs(lateral) > 520) continue;
      const typeWeight = u.type === 'artillery' ? 1.7 : u.type === 'cavalry' ? 1.35 : 1;
      const distance = Math.hypot(along, lateral);
      const proximityWeight = Math.max(0.35, 1 - distance / 700);
      const weight = typeWeight * proximityWeight;
      if (lateral >= 0) right += weight;
      else left += weight;
      samples++;
    }

    stats.flankEvaluations++;
    stats.lastFlankPressure = { left, right, samples };
    if (samples < 2 || Math.abs(left - right) < 0.6) return null;
    return right < left ? 1 : -1;
  }

  const baseTransition = aiTransition;
  aiTransition = function aiTransitionV141(next) {
    const before = AI_COMMANDER_V1.state;
    baseTransition(next);
    if (next === 'FLANK' && before !== 'FLANK') {
      const preferred = chooseOpenFlank();
      if (preferred) AI_COMMANDER_V1.flankSide = preferred;
    }
  };

  window.__AI_COHESION_V140__ = Object.freeze({
    stats: () => ({...stats, cachedOrders:orderCache.size}),
    readiness: (regs, point, radius=MASS_READY_DISTANCE) => regimentReadiness(regs, point, radius),
    meanDistanceToTarget: (regs, target) => meanDistanceToTarget(regs, target),
    percentileDistanceToTarget: (regs, target, percentile=0.75) => percentileDistanceToTarget(regs, target, percentile),
    chooseOpenFlank: () => chooseOpenFlank(),
    cleanupOrderCache: (force=true) => cleanupOrderCache(force),
    resetOrderCache: () => { orderCache.clear(); lastCleanupAt = -Infinity; }
  });

  if (window.NRTS?.subsystems?.register) {
    NRTS.subsystems.register('ai-command-cohesion-v140', window.__AI_COHESION_V140__, {
      phase:'gameplay-v141',
      legacyBridge:false,
      responsibility:'AI order hysteresis, readiness guards, bounded cache cleanup and pressure-aware flank selection'
    });
  }
})();
