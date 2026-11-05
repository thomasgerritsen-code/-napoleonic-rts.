'use strict';
// Battle depth (open map only, NRTS_CONFIG.battleDepth):
// - flank and rear: a regiment hit from the side or behind (not in square)
//   takes more damage and loses more morale;
// - artillery: round shot leaves craters, knocks down the works it falls on
//   (a trench loses a level, at the first level its parapet is breached) and
//   damages a tower beside it; the men in a trench repair it while they stand;
// - tirailleurs: a regiment can fight in open order - spread out, firing at
//   will a little farther, hard to hit (harder still among trees), but easy
//   prey for horsemen.
// Morale per regiment is read by the iso view (bar over each regiment).
(function installBattleDepthV1(root) {
  const cfg = root.NRTS_CONFIG?.battleDepth;
  if (!cfg) return;
  if (document.readyState !== 'complete') { addEventListener('load', () => installBattleDepthV1(root), { once: true }); return; }
  if (root.__BATTLE_DEPTH_V1__ || typeof applyDamage !== 'function') return;
  const O = root.__REGIMENT_ORDERS_V1__;
  const stats = { flank: 0, rear: 0, shells: 0, trenchHits: 0, levelsLost: 0, breaches: 0, repairs: 0, towerHits: 0, skirmishCover: 0, skirmishRidden: 0, skirmishShots: 0 };
  const craters = [];
  const regOf = u => (u && u.kind === 'unit' && u.regimentId && typeof getRegiment === 'function') ? getRegiment(u.regimentId) : null;

  // ---- morale ----
  function regimentMorale(reg) {
    const m = regimentMembers(reg).filter(u => !u.dead);
    if (!m.length) return null;
    const avg = m.reduce((s, u) => s + (u.morale ?? 100), 0) / m.length;
    const routing = m.filter(u => u.routing).length / m.length;
    return { morale: avg, routing, wavering: avg < cfg.waverAt && routing < 0.5,
      officer: m.some(u => u.id === reg.officerId), drummer: m.some(u => u.id === reg.drummerId) };
  }

  // ---- where a hit comes from ----
  let striker = null;
  if (typeof fire === 'function') {
    const baseFire = fire;
    fire = function fireWithSource(unit, enemy) {
      const before = striker; striker = unit;
      try { return baseFire(unit, enemy); } finally { striker = before; }
    };
  }
  function hitSource(victim) {
    if (striker && !striker.dead) return striker;
    let best = null, bd = 50 * 50;
    for (const p of projectiles) {
      if (p.dead) continue;
      const d = (p.x - victim.x) ** 2 + (p.y - victim.y) ** 2;
      if (d < bd && (d > 0.01 || p.target === victim)) { bd = d; best = p; }
    }
    return best;
  }
  // Side the blow lands on, against the way the regiment faces: front, flank or rear.
  function sideOf(reg, victim, src) {
    const dx = src.x - victim.x, dy = src.y - victim.y, d = Math.hypot(dx, dy);
    if (d < 0.5) return 'front';
    const c = (dx * Math.cos(reg.facing || 0) + dy * Math.sin(reg.facing || 0)) / d;
    return c > 0.5 ? 'front' : c < -0.5 ? 'rear' : 'flank';
  }
  const inWood = u => { try { const t = terrainAtV06(u.x, u.y); return String(typeof t === 'string' ? t : t?.type || t?.kind || '').toLowerCase().includes('wood'); } catch { return false; } };
  const nearTrees = u => inWood(u) || resources.some(r => r.type === 'wood' && !r.dead && r.amount > 0 && Math.hypot(r.x - u.x, r.y - u.y) < 46);

  const baseDamage = applyDamage;
  applyDamage = function applyDamageWithDepth(victim, damage, shock = 8) {
    if (victim && victim.kind === 'unit' && !victim.dead) {
      const reg = regOf(victim), src = hitSource(victim);
      const horse = striker && striker.type === 'cavalry';
      if (reg && src && reg.formation !== 'square') {
        const side = sideOf(reg, victim, src);
        if (side !== 'front') {
          stats[side]++;
          // Charges already weigh the flank themselves; their morale blow still grows.
          if (!horse) damage *= side === 'rear' ? cfg.rearDamage : cfg.flankDamage;
          shock *= side === 'rear' ? cfg.rearShock : cfg.flankShock;
        }
      }
      if (reg?.skirmish) {
        if (horse) { damage *= cfg.skirmishVsCavalry; shock *= cfg.skirmishVsCavalry; stats.skirmishRidden++; }
        else { damage *= nearTrees(victim) ? cfg.skirmishWoodCover : cfg.skirmishCover; stats.skirmishCover++; }
      }
      // A breached parapet covers little (the trench's own cover was given inside).
      const t = O?.trenchAt?.(victim.x, victim.y);
      if (t && t.breached && !horse) damage *= cfg.breachedCover / (O.config.trenchDamage || 0.5);
    }
    return baseDamage(victim, damage, shock);
  };

  // ---- artillery: craters, works knocked down, towers hit ----
  function shellLands(x, y, dx, dy, troop) {
    stats.shells++;
    // Howitzer shells (troops-v1 'works') tear up earthworks and towers harder.
    const works = root.NRTS_CONFIG?.troops?.kinds?.[troop]?.works || 1;
    const d = Math.hypot(dx, dy) || 1;
    craters.push({ x, y, dx: dx / d, dy: dy / d, t: elapsed });
    if (craters.length > cfg.maxCraters) craters.splice(0, craters.length - cfg.maxCraters);
    for (const t of O?.trenches?.() || []) {
      if (t.progress < 1) continue;
      const ax = Math.cos(t.facing + Math.PI / 2), ay = Math.sin(t.facing + Math.PI / 2), along = (x - t.x) * ax + (y - t.y) * ay;
      const across = (x - t.x) * Math.cos(t.facing) + (y - t.y) * Math.sin(t.facing);
      if (Math.abs(along) > t.length / 2 + 8 || across < -t.width / 2 - 8 || across > t.width / 2 + 34) continue;
      stats.trenchHits++;
      t.integrity = (t.integrity ?? 100) - cfg.shellDamage * works;
      if (t.integrity <= 0) {
        if ((t.level || 1) > 1) { t.level--; t.integrity = 100; stats.levelsLost++; }
        else { t.integrity = 0; if (!t.breached) stats.breaches++; t.breached = true; }
      }
    }
    for (const b of buildings) {
      if (b.dead || b.type !== 'tower' || Math.hypot(b.x - x, b.y - y) > cfg.towerSplash) continue;
      stats.towerHits++; baseDamage(b, cfg.towerShellDamage * works, 0);
    }
  }
  if (typeof updateProjectiles === 'function') {
    const base = updateProjectiles;
    updateProjectiles = function updateProjectilesWithShells(dt) {
      const flying = [];
      for (const p of projectiles) if (p.artillery && !p.dead && p.target && !p.target.dead) flying.push([p, p.x, p.y, p.target.x, p.target.y]);
      const r = base(dt);
      for (const [p, x0, y0, tx, ty] of flying) if (p.dead && Math.hypot(p.x - tx, p.y - ty) < 14) shellLands(tx, ty, tx - x0, ty - y0, p.troop);
      return r;
    };
  }
  // Repairs: the men in a damaged trench mend it while they stand there.
  let repairClock = 0;
  if (typeof updateBuildings === 'function') {
    const base = updateBuildings;
    updateBuildings = function updateBuildingsWithRepairs(dt) {
      const r = base(dt);
      repairClock += dt;
      if (repairClock >= 1) {
        const step = repairClock; repairClock = 0;
        for (const t of O?.trenches?.() || []) {
          if (t.progress < 1 || (t.integrity ?? 100) >= 100) continue;
          // Whoever stands in it (at least a few men, not routing) digs it back up.
          let men = 0, sappers = 0;
          for (const u of units) if (!u.dead && !u.routing && u.type === 'infantry' && O.trenchAt(u.x, u.y) === t) { men++; if (u.troop === 'sapper') sappers++; }
          if (men < 3) continue;
          // Sappers (troops-v1) repair faster.
          const work = 1 + (root.NRTS_CONFIG?.troops?.kinds?.sapper?.work || 0) * sappers / men;
          t.integrity = Math.min(100, t.integrity + cfg.repairPerSecond * work * step); stats.repairs++;
          if (t.breached && t.integrity >= 50) t.breached = false;
        }
      }
      return r;
    };
  }

  // ---- tirailleurs: open order ----
  function spread(reg, x, y) {
    if (!reg?.skirmish) return;
    for (const u of regimentMembers(reg)) {
      if (!Number.isFinite(u.targetX)) continue;
      const j = (u.id * 9301 + 49297) % 233280 / 233280;
      u.targetX = Math.max(20, Math.min(WORLD.width - 20, x + (u.targetX - x) * cfg.skirmishSpread + (j - 0.5) * 18));
      u.targetY = Math.max(20, Math.min(WORLD.height - 20, y + (u.targetY - y) * cfg.skirmishSpread + ((j * 7) % 1 - 0.5) * 18));
    }
  }
  if (typeof arrangeFacingRegimentV146 === 'function') {
    const base = arrangeFacingRegimentV146, alias = root.arrangeRegiment === base;
    const wrapped = function arrangeWithOpenOrder(reg, x, y, mode, facing) {
      if (reg && mode === 'square') reg.skirmish = false;
      const r = base.apply(this, arguments);
      spread(reg, x, y);
      return r;
    };
    arrangeFacingRegimentV146 = wrapped;
    if (alias) root.arrangeRegiment = wrapped;
  }
  if (typeof updateUnit === 'function') {
    const base = updateUnit;
    updateUnit = function updateUnitSkirmishing(u, dt) {
      if (u && !u.dead && !u.routing && u.type === 'infantry' && u.reload - dt <= 0 && u.attackMode !== 'bayonet') {
        const reg = regOf(u);
        if (reg?.skirmish) {
          const enemy = nearestEnemyEntity(u, TYPES.infantry.range * cfg.skirmishRange);
          if (enemy) { fire(u, enemy); stats.skirmishShots++; }
        }
      }
      return base(u, dt);
    };
  }
  const selectedRegs = () => (typeof selectedRegiments === 'function' ? selectedRegiments() : []).filter(r => r.side === 'france' && !r.destroyed);
  function toggleSkirmish(regs = selectedRegs()) {
    if (!regs.length) return false;
    const on = regs.some(r => !r.skirmish);
    for (const reg of regs) {
      reg.skirmish = on;
      const m = regimentMembers(reg).filter(u => !u.dead); if (!m.length) continue;
      const c = centroid(m), mode = reg.formation === 'square' || on ? 'line' : reg.formation || 'line';
      arrangeFacingRegimentV146(reg, reg.targetX ?? c.x, reg.targetY ?? c.y, mode, reg.facing);
    }
    statusEl.textContent = on ? 'Tirailleurs: verspreid opgesteld - vuren naar believen en verder, moeilijk te raken (zeker tussen bomen), maar kwetsbaar voor ruiterij.'
      : 'Gesloten orde: het regiment sluit de gelederen.';
    actionSignature = ''; updateHud(true);
    return on;
  }
  if (typeof renderDynamicActions === 'function' && typeof makeDynamicButton === 'function') {
    const base = renderDynamicActions;
    renderDynamicActions = function renderWithSkirmish(force = false) {
      base(force);
      const regs = selectedRegs();
      if (!regs.length || regs.some(r => regimentMembers(r).some(u => u.type === 'cavalry' || u.type === 'artillery'))) return;
      if (actionsEl.querySelector('[data-action="skirmish"]')) return;
      const on = regs.every(r => r.skirmish);
      const b = makeDynamicButton('skirmish', on ? 'Tirailleurs<br><small>→ gesloten</small>' : 'Tirailleurs<br><small>verspreid</small>');
      if (on) b.classList.add('active');
      b.title = 'Open orde: verspreid, vuren naar believen en iets verder, moeilijk te raken (vooral tussen bomen), maar kwetsbaar voor ruiterij.';
      actionsEl.appendChild(b);
    };
    actionsEl.addEventListener('click', e => {
      const b = e.target.closest('button[data-action="skirmish"]');
      if (b && !b.disabled) toggleSkirmish();
    });
  }
  if (typeof resetGame === 'function') {
    const base = resetGame;
    resetGame = function resetGameClearingCraters(...args) { craters.length = 0; return base(...args); };
  }

  root.__BATTLE_DEPTH_V1__ = Object.freeze({
    version: '1.0', config: cfg, regimentMorale, toggleSkirmish, craters: () => craters, sideOf,
    stats: () => ({ ...stats, craters: craters.length, skirmishing: regiments.filter(r => !r.destroyed && r.skirmish).length })
  });
})(window);
