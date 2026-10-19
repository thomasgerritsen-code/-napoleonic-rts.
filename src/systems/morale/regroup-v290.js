'use strict';
// v290: only restore cohesion after a genuine safe, settled battlefield withdrawal.
// Never changes unit positions, route planning, bridge reservations or group orders.
(function installRegroupV290(root) {
  if (root.__REGROUP_V290__ || typeof refreshRegiment !== 'function') return;

  const RALLY_RADIUS = 78;
  const DANGER_RADIUS = 235;
  const READY_MORALE = 62;
  const MIN_RALLY_SECONDS = 5;
  const stats = { rallies: 0, completed: 0, interrupted: 0, unsafeFrames: 0, restoredMorale: 0 };
  const previousRefresh = refreshRegiment;

  const distance = (a,b) => Math.hypot(a.x-b.x, a.y-b.y);
  const living = reg => regimentMembers(reg).filter(u => !u.dead && !u.routing);
  const bridgeReserved = reg => {
    const crossing = reg?.crossingTrafficV068;
    return Boolean(crossing?.forcedColumn ||
      ['waiting','approach','crossing','clearing'].includes(crossing?.state));
  };
  function threatened(reg, center) {
    if (bridgeReserved(reg)) return true;
    if (typeof waterAtV067 === 'function' && waterAtV067(center.x,center.y)) return true;
    return units.some(u => !u.dead && !u.routing && u.side !== reg.side &&
      u.type !== 'worker' && distance(u,center) < DANGER_RADIUS);
  }
  function arrived(reg,goal,members) {
    if (!members.length) return false;
    const center = centroid(members);
    if (distance(center,goal) > RALLY_RADIUS) return false;
    // Soldiers must reach their formation slots, not just have their
    // regimental anchor pass through the rally point.
    const inSlots = members.filter(u =>
      Number.isFinite(u.targetX) && Number.isFinite(u.targetY) &&
      distance(u,{x:u.targetX,y:u.targetY}) < 42).length;
    return inSlots >= Math.ceil(members.length * .75);
  }
  function updateRegroup(reg) {
    if (!reg || reg.destroyed || groupKindV06(reg) !== 'infantry') return;
    const retreat = reg.orderlyFallbackV289;
    let state = reg.regroupV290;
    if (!retreat) return;
    const now = Number(elapsed) || 0;
    if (!state || state.retreatAt !== retreat.startedAt) {
      state = {
        retreatAt:retreat.startedAt, lastAt:now, phase:'withdrawing',
        rallyAt:null, goal:{...retreat.goal}
      };
      reg.regroupV290 = state;
    }
    if (state.phase === 'ready' || state.phase === 'interrupted') return;
    const dt = Math.max(0,Math.min(.25,now - state.lastAt));
    state.lastAt = now;

    const intended = reg.finalTarget;
    // Explicit user or commander commands take priority over regrouping.
    if (intended && distance(intended,state.goal) > 95) {
      state.phase = 'interrupted';
      stats.interrupted++;
      delete reg.orderlyFallbackV289;
      return;
    }
    const members = living(reg);
    if (!members.length) return;
    const center = centroid(members);
    if (threatened(reg,center)) {
      stats.unsafeFrames++;
      if (state.phase === 'regrouping') {
        state.phase = 'threatened';
        state.rallyAt = null;
      }
      return;
    }
    const settled = arrived(reg,state.goal,members);
    if (!settled) {
      if (state.phase === 'regrouping' || state.phase === 'threatened') {
        state.phase = 'withdrawing';
        state.rallyAt = null;
      }
      return;
    }
    if (state.phase !== 'regrouping') {
      state.phase = 'regrouping';
      state.rallyAt = now;
      stats.rallies++;
    }

    // A local officer can gather men; the drummer adds a smaller bonus.
    const officer = members.some(u => u.id === reg.officerId);
    if (!officer) return;
    const drummer = members.some(u => u.id === reg.drummerId);
    const boost = dt * (1.1 + (drummer ? .35 : 0));
    for (const u of members) {
      const before = u.morale ?? 100;
      u.morale = Math.min(100,before + boost);
      stats.restoredMorale += u.morale-before;
    }
    if (now-state.rallyAt >= MIN_RALLY_SECONDS && reg.morale >= READY_MORALE) {
      state.phase = 'ready';
      state.readyAt = now;
      stats.completed++;
      // v289 clears its cooldown on the following refresh. The squad may
      // receive normal player or AI orders already; no new order is issued.
    }
  }

  refreshRegiment = function refreshRegimentWithRegroupV290(reg) {
    previousRefresh(reg);
    updateRegroup(reg);
  };
  const api = Object.freeze({
    version:'290.0', readyMorale:READY_MORALE,
    arrived, threatened,
    state:reg => reg?.regroupV290 ? {...reg.regroupV290} : null,
    stats:()=>({...stats})
  });
  root.__REGROUP_V290__ = api;
  root.NRTS?.subsystems?.register?.('regroup-v290',api,{
    phase:'gameplay-morale',legacyBridge:false,
    responsibility:'actual rally arrival, safe morale restoration and reactivation of retreating infantry'
  });
})(window);
