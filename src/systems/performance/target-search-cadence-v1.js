'use strict';
// Target search at ten times a second instead of sixty. Every man asked for the
// nearest enemy (morale threat, firing, rank volley, regiment orders) on every
// 1/60 s step, through the whole chain of target layers - sight lines through the
// woods, cavalry contact, rallies, buildings. That alone kept a battle of a few
// hundred men from running in real time. An answer now holds for 0.1 s of game
// time (deterministic), per man and reach. It is asked again sooner when the
// target falls, breaks or leaves the reach, or the man has moved a few paces.
// Close contact (bayonet and sabre reach) is still asked every step.
(function installTargetSearchCadence(root) {
  const HOLD = 0.1, MOVED = 6, CONTACT = 40;
  if (document.readyState !== 'complete') { addEventListener('load', () => setTimeout(() => installTargetSearchCadence(root)), { once: true }); return; }
  if (root.__TARGET_SEARCH_CADENCE_V1__ || typeof nearestEnemyEntity !== 'function') return;
  const stats = { asked: 0, held: 0 };
  let memo = new WeakMap();
  const inner = nearestEnemyEntity;
  const valid = (u, e, range) => {
    if (!e) return true;
    if (e.dead || e.routing) return false;
    // Buildings are measured to their walls by the building layer: allow their size.
    const slack = e.kind === 'building' ? Math.max(e.w || 0, e.h || 0) / 2 : 0;
    return Math.hypot(e.x - u.x, e.y - u.y) <= range + slack;
  };
  function nearestOnCadence(unit, range) {
    if (!unit || !Number.isFinite(range) || range < CONTACT) return inner(unit, range);
    stats.asked++;
    let byRange = memo.get(unit);
    if (!byRange) memo.set(unit, byRange = new Map());
    const hit = byRange.get(range);
    if (hit && elapsed >= hit.at && elapsed - hit.at < HOLD && Math.abs(hit.x - unit.x) + Math.abs(hit.y - unit.y) <= MOVED && valid(unit, hit.e, range)) {
      stats.held++; return hit.e;
    }
    const e = inner(unit, range);
    byRange.set(range, { e, at: elapsed, x: unit.x, y: unit.y });
    return e;
  }
  nearestEnemyEntity = nearestOnCadence;
  root.NRTS?.events?.on?.('game:reset', () => { memo = new WeakMap(); });
  root.__TARGET_SEARCH_CADENCE_V1__ = Object.freeze({ version: '1.0', hold: HOLD, stats: () => ({ ...stats }) });
})(window);
