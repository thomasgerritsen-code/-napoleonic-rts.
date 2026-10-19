'use strict';
// v289: infantry with wavering morale withdraw in good order instead of
// standing in fire until dissolved. Uses the existing path/formation authority;
// never rewrites marching, bridge routing or road navigation.
(function installOrderlyFallbackV289(root) {
  if (root.__ORDERLY_FALLBACK_V289__ || typeof refreshRegiment !== 'function') return;
  const FALLBACK_DISTANCE = 180;
  const START_MORALE = 46;
  const RECOVER_MORALE = 62;
  const stats = { withdrawals: 0, blockedCrossings: 0, blockedTerrain: 0 };
  const originalRefresh = refreshRegiment;

  function liveMembers(reg) {
    return regimentMembers(reg).filter(u => !u.dead && !u.routing);
  }

  function eligible(reg) {
    if (!reg || reg.destroyed || groupKindV06(reg) !== 'infantry' ||
        v05PeaceMode || gameOver) return false;
    const prior = reg.orderlyFallbackV289;
    // Do not endlessly re-issue orders. After rallying, a later collapse
    // can trigger a fresh withdrawal.
    if (prior) {
      if (reg.morale >= RECOVER_MORALE &&
          elapsed >= prior.startedAt + 8) delete reg.orderlyFallbackV289;
      else return false;
    }
    if (reg.morale <= GROUP_BREAK_MORALE || reg.morale >= START_MORALE) return false;
    if (reg.engagementV069?.mode !== 'fire') return false;
    if (reg.manualDisengageUntilV070 > elapsed) return false;
    const members = liveMembers(reg);
    if (members.length < 5 ||
        !members.some(u => u.id === reg.officerId)) return false;
    // Existing traffic/navigation owns bridge, road and active march orders.
    const crossing = reg.crossingTrafficV068;
    if (crossing?.forcedColumn ||
        ['waiting','approach','crossing','clearing'].includes(crossing?.state)) {
      stats.blockedCrossings++; return false;
    }
    if (reg.movementPhaseV063 && reg.movementPhaseV063 !== 'combat-halt' &&
        reg.movementPhaseV063 !== 'formed' && reg.movementPhaseV063 !== 'close-combat')
      return false;
    const c = centroid(members);
    if (typeof roadAtV064 === 'function' && roadAtV064(c.x, c.y)) return false;
    if (typeof waterAtV067 === 'function' && waterAtV067(c.x, c.y)) return false;
    return true;
  }

  function fallBack(reg) {
    const members = liveMembers(reg);
    const center = centroid(members);
    const heading = reg.engagementV069?.heading;
    if (!Number.isFinite(heading)) return false;
    const goal = {
      x: Math.max(90, Math.min(WORLD.width - 90, center.x - Math.cos(heading) * FALLBACK_DISTANCE)),
      y: Math.max(90, Math.min(WORLD.height - 90, center.y - Math.sin(heading) * FALLBACK_DISTANCE))
    };
    if (Math.hypot(goal.x-center.x, goal.y-center.y) < 110 ||
        (typeof waterAtV067 === 'function' && waterAtV067(goal.x,goal.y)) ||
        (typeof segmentCrossesBlockedWaterV067 === 'function' &&
         segmentCrossesBlockedWaterV067(center.x,center.y,goal.x,goal.y))) {
      stats.blockedTerrain++; return false;
    }
    // Reuse the already tested group path planner and field formation. Clear
    // only combat locks; no changes to unit coordinates or movement internals.
    reg.engagementV069 = null;
    reg.engagementLockV070 = null;
    reg.manualDisengageUntilV070 = elapsed + 5;
    orderGroupPathV06(reg, goal.x, goal.y, 'line', heading);
    reg.orderlyFallbackV289 = {
      startedAt: elapsed, goal, moraleAtOrder: Math.round(reg.morale)
    };
    stats.withdrawals++;
    return true;
  }

  refreshRegiment = function refreshRegimentWithFallbackV289(reg) {
    originalRefresh(reg);
    if (eligible(reg)) fallBack(reg);
  };

  const api = Object.freeze({
    version: '289.0',
    eligible, fallback: fallBack,
    stats: () => ({...stats}),
    state: reg => reg?.orderlyFallbackV289 || null
  });
  root.__ORDERLY_FALLBACK_V289__ = api;
  root.NRTS?.subsystems?.register?.('orderly-fallback-v289', api, {
    phase: 'gameplay-morale', legacyBridge: false,
    responsibility: 'orderly infantry battlefield withdrawal on wavering morale without bridge/march takeover'
  });
})(window);
