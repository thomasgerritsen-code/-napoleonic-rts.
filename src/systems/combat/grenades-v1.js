'use strict';
// Grenades (open map only, NRTS_CONFIG.grenades): grenadiers (and the Old Guard)
// within throwing distance of the enemy light a hand grenade and lob it. It
// flies in an arc, bursts where it lands and hurts every enemy near the burst -
// men in a trench as much as men in the open, for it drops in. Each man throws
// now and then, not with every volley.
(function installGrenadesV1(root) {
  const cfg = root.NRTS_CONFIG?.grenades;
  if (!cfg) return;
  if (document.readyState !== 'complete') { addEventListener('load', () => installGrenadesV1(root), { once: true }); return; }
  if (root.__GRENADES_V1__ || typeof updateUnit !== 'function') return;
  const stats = { thrown: 0, burst: 0, hits: 0 };
  // In flight; bursts (for the flash and smoke) and the scorched ground they leave.
  const flying = [], bursts = [], scorches = [];
  const throws = u => u && u.type === 'infantry' && cfg.kinds.includes(u.troop);

  function enemyNear(u) {
    let best = null, bd = cfg.maxRange;
    for (const e of units) {
      if (e.dead || e.side === u.side || e.type === 'worker') continue;
      const d = Math.hypot(e.x - u.x, e.y - u.y);
      if (d < bd && d >= cfg.minRange) { best = e; bd = d; }
    }
    return best;
  }
  function throwAt(u, e) {
    // A grenade thrown at a man lands near him, not on him.
    const a = Math.random() * Math.PI * 2, miss = Math.random() * cfg.spread;
    const x1 = e.x + Math.cos(a) * miss, y1 = e.y + Math.sin(a) * miss, d = Math.hypot(x1 - u.x, y1 - u.y);
    flying.push({ x0: u.x, y0: u.y, x1, y1, t0: elapsed, flight: cfg.flightMin + d / cfg.maxRange * (cfg.flightMax - cfg.flightMin), side: u.side, by: u.id, source:combatSourceFor(u) });
    u.grenadeAt = elapsed + cfg.cooldown * (0.8 + Math.random() * 0.4);
    u.threwAt = elapsed;
    stats.thrown++;
  }
  function burst(g) {
    stats.burst++;
    bursts.push({ x: g.x1, y: g.y1, t: elapsed });
    scorches.push({ x: g.x1, y: g.y1, t: elapsed });
    if (bursts.length > 40) bursts.splice(0, bursts.length - 40);
    if (scorches.length > cfg.maxScorches) scorches.splice(0, scorches.length - cfg.maxScorches);
    // Lobbed: it falls into a trench as into the open (regiment-orders reads this).
    root.__GRENADE_BLAST__ = true;
    try {
      for (const v of units) {
        if (v.dead || v.side === g.side) continue;
        const d = Math.hypot(v.x - g.x1, v.y - g.y1);
        if (d > cfg.radius) continue;
        const f = 1 - d / cfg.radius * 0.7;
        dealCombatDamage(g.source, v, cfg.damage * f, cfg.shock * f);
        stats.hits++;
      }
    } finally { root.__GRENADE_BLAST__ = false; }
  }

  const baseUpdateUnit = updateUnit;
  updateUnit = function updateUnitThrowingGrenades(u, dt) {
    if (throws(u) && !u.dead && !u.routing) {
      if (u.grenadeAt == null) u.grenadeAt = elapsed + Math.random() * cfg.cooldown;
      if (elapsed >= u.grenadeAt) {
        const e = enemyNear(u);
        if (e) throwAt(u, e); else u.grenadeAt = elapsed + 1;
      }
    }
    return baseUpdateUnit(u, dt);
  };
  // Grenades in flight land on the game's own clock.
  const baseUpdateProjectiles = updateProjectiles;
  updateProjectiles = function updateProjectilesWithGrenades(dt) {
    const r = baseUpdateProjectiles(dt);
    for (let i = flying.length - 1; i >= 0; i--) if (elapsed - flying[i].t0 >= flying[i].flight) { const g = flying.splice(i, 1)[0]; burst(g); }
    return r;
  };
  if (typeof resetGame === 'function') {
    const base = resetGame;
    resetGame = function resetGameWithGrenades(...args) { flying.length = bursts.length = scorches.length = 0; return base(...args); };
  }

  root.__GRENADES_V1__ = Object.freeze({ version: '1.0', config: cfg, flying: () => flying, bursts: () => bursts, scorches: () => scorches,
    throwAt, stats: () => ({ ...stats, flying: flying.length }) });
})(window);
