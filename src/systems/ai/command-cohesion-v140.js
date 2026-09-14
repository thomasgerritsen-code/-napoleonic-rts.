'use strict';
// ---------- v1.4.0: AI command cohesion ----------
// Lightweight gameplay layer: suppresses near-identical command spam, lets coherent
// formations advance a little earlier, and chooses the less congested enemy flank.

(() => {
  if (typeof aiOrderReg !== 'function' || typeof aiChooseState !== 'function' || typeof aiTransition !== 'function') return;

  const ORDER_TOLERANCE = 26;
  const FACING_TOLERANCE = 0.14;
  const ORDER_REFRESH_SECONDS = 3.5;
  const MASS_READY_DISTANCE = 165;
  const ADVANCE_READY_DISTANCE = 470;

  const stats = {
    issued: 0,
    suppressed: 0,
    earlyAdvance: 0,
    earlyAttack: 0,
    flankEvaluations: 0,
    lastReadiness: 0,
    lastAdvanceDistance: null,
    lastFlankPressure: null
  };
  const orderCache = new Map();

  function angleDelta(a, b) {
    let d = (a || 0) - (b || 0);
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d);
  }

  function regimentReadiness(regs, point, radius) {
    if (!point || !regs?.length) return 0;
    let ready = 0;
    for (const reg of regs) {
      const c = aiRegCenter(reg);
      if (Math.hypot(c.x - point.x, c.y - point.y) <= radius) ready++;
    }
    return ready / Math.max(1, regs.length);
  }

  function meanDistanceToTarget(regs, target) {
    if (!target || !regs?.length) return Infinity;
    let total = 0;
    for (const reg of regs) {
      const c = aiRegCenter(reg);
      total += Math.hypot(c.x - target.x, c.y - target.y);
    }
    return total / Math.max(1, regs.length);
  }

  const baseOrderReg = aiOrderReg;
  aiOrderReg = function aiOrderRegV140(reg, p, formation = 'line', facing = null) {
    if (!reg || reg.destroyed || !p) return;
    const now = Number.isFinite(elapsed) ? elapsed : 0;
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
  aiChooseState = function aiChooseStateV140(regs) {
    const proposed = baseChooseState(regs);
    const state = AI_COMMANDER_V1.state;
    const age = (Number.isFinite(elapsed) ? elapsed : 0) - AI_COMMANDER_V1.stateSince;

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
      stats.lastAdvanceDistance = Number.isFinite(meanDistance) ? meanDistance : null;
      if (meanDistance <= ADVANCE_READY_DISTANCE) {
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
      const rx = u.x - target.x;
      const ry = u.y - target.y;
      const along = rx * d.x + ry * d.y;
      const lateral = -rx * d.y + ry * d.x;
      if (Math.abs(along) > 520 || Math.abs(lateral) > 520) continue;
      const weight = u.type === 'artillery' ? 1.7 : u.type === 'cavalry' ? 1.35 : 1;
      if (lateral >= 0) right += weight;
      else left += weight;
      samples++;
    }

    stats.flankEvaluations++;
    stats.lastFlankPressure = { left, right, samples };
    if (samples < 2 || Math.abs(left - right) < 0.75) return null;
    return right < left ? 1 : -1;
  }

  const baseTransition = aiTransition;
  aiTransition = function aiTransitionV140(next) {
    const before = AI_COMMANDER_V1.state;
    baseTransition(next);
    if (next === 'FLANK' && before !== 'FLANK') {
      const preferred = chooseOpenFlank();
      if (preferred) AI_COMMANDER_V1.flankSide = preferred;
    }
  };

  // Prevent stale cache entries from growing across long sessions or destroyed regiments.
  const cleanupTimer = setInterval(() => {
    if (typeof activeRegiments !== 'function') return;
    const alive = new Set(activeRegiments('britain').map(r => r.id));
    for (const id of orderCache.keys()) if (!alive.has(id)) orderCache.delete(id);
  }, 10000);
  if (typeof cleanupTimer?.unref === 'function') cleanupTimer.unref();

  window.__AI_COHESION_V140__ = Object.freeze({
    stats: () => ({...stats, cachedOrders:orderCache.size}),
    readiness: (regs, point, radius=MASS_READY_DISTANCE) => regimentReadiness(regs, point, radius),
    meanDistanceToTarget: (regs, target) => meanDistanceToTarget(regs, target),
    chooseOpenFlank: () => chooseOpenFlank(),
    resetOrderCache: () => orderCache.clear()
  });

  if (window.NRTS?.subsystems?.register) {
    NRTS.subsystems.register('ai-command-cohesion-v140', window.__AI_COHESION_V140__, {
      phase:'gameplay-v140',
      legacyBridge:false,
      responsibility:'AI order hysteresis, formation readiness and pressure-aware flank selection'
    });
  }
})();
