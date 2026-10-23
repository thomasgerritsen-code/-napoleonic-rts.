'use strict';
// ---------- Regiment orders v1 (open map: ?view=iso) ----------
// Two orders for the player's regiments:
//   - Defend (button, or V): a regiment that stands still in line or square
//     braces after braceSeconds - kneeling ranks, prepared volleys. While braced
//     it takes defendDamage of the losses, defendShock of the morale shock, and
//     reloads in defendReload of the time. Moving loses the advantage; it builds
//     up again where the regiment halts. The British commander braces its
//     regiments while it defends or regroups.
//   - Trenches: a braced line goes on to dig a trench along its front (digSeconds,
//     slower under fire). A finished trench stays on the field; men standing in it
//     - of either side - take trenchDamage of the losses and trenchShock of the
//     morale shock. Any regiment that halts by an empty finished trench steps
//     into it - again each time it comes back - front the way the trench faces.
//   - Reinforce: loose musketiers selected together with one regiment join it,
//     up to maxInfantry men.
// Only on the open map (NRTS_CONFIG.regimentOrders); the normal game is unchanged.
// Installed once the page has loaded, so it wraps the final damage, fire and
// regiment-refresh functions (later scripts replace some of them).
(function installRegimentOrdersV1(global) {
  const cfg = global.NRTS_CONFIG?.regimentOrders;
  if (!cfg) return;
  if (document.readyState !== 'complete') { addEventListener('load', () => installRegimentOrdersV1(global), { once: true }); return; }
  if (global.__REGIMENT_ORDERS_V1__ || typeof applyDamage !== 'function' || typeof refreshRegiment !== 'function') return;
  const stats = { braced: 0, reduced: 0, inTrench: 0, reinforced: 0, toggles: 0, dug: 0, manned: 0 };
  // Longer musket reach on the open map: men open fire at the distance the range ring shows.
  if (cfg.infantryRange && TYPES.infantry) TYPES.infantry.range = cfg.infantryRange;
  const trenches = [];
  const isBraced = reg => !!(reg && !reg.destroyed && reg.defend && reg.bracedAt != null && elapsed - reg.bracedAt >= cfg.braceSeconds);
  const regOf = u => (u && u.kind === 'unit' && u.regimentId && typeof getRegiment === 'function') ? getRegiment(u.regimentId) : null;

  // ---- bracing: standing still in line or square ----
  const baseRefresh = refreshRegiment;
  refreshRegiment = function refreshRegimentWithStance(reg) {
    baseRefresh(reg);
    if (!reg || reg.destroyed) return;
    if (reg.side === 'britain' && typeof AI_COMMANDER_V1 !== 'undefined') reg.defend = AI_COMMANDER_V1.state === 'DEFEND' || AI_COMMANDER_V1.state === 'REGROUP';
    if (trenches.length) manTrenches(reg);
    if (!reg.defend) { reg.bracedAt = null; return; }
    // Once a second: has the regiment moved, and is it formed to receive?
    if (reg.stanceCheckAt != null && elapsed - reg.stanceCheckAt < 1) return;
    reg.stanceCheckAt = elapsed;
    const m = regimentMembers(reg); if (!m.length) return;
    const c = centroid(m), last = reg.stanceLast;
    reg.stanceLast = c;
    const still = last && Math.hypot(c.x - last.x, c.y - last.y) < 8 && !m.some(u => u.routing);
    const formed = reg.formation === 'line' || reg.formation === 'square';
    if (still && formed) { if (reg.bracedAt == null) reg.bracedAt = elapsed; }
    else reg.bracedAt = null;
    if (still && reg.formation === 'line') trenchWork(reg, m, c);
  };

  // ---- trenches ----
  // A trench lies along a line's front: centre, facing (towards the enemy, game
  // radians) and length; progress 0..1 while it is dug.
  const inTrench = (t, x, y) => {
    const dx = x - t.x, dy = y - t.y, ax = Math.cos(t.facing + Math.PI / 2), ay = Math.sin(t.facing + Math.PI / 2);
    return Math.abs(dx * ax + dy * ay) <= t.length / 2 && Math.abs(dx * Math.cos(t.facing) + dy * Math.sin(t.facing)) <= t.width / 2;
  };
  const trenchAt = (x, y) => trenches.find(t => t.progress >= 1 && inTrench(t, x, y)) || null;
  // A trench being dug right now (its regiment worked on it in the last second or two).
  const diggingAt = (x, y) => trenches.find(t => t.progress < 1 && elapsed - (t.dugAt ?? -99) < 2 && inTrench(t, x, y)) || null;
  const foeNear = (side, c, r) => units.some(e => !e.dead && !e.routing && e.side !== side && e.type !== 'worker' && Math.hypot(e.x - c.x, e.y - c.y) < r);
  function lineGeometry(reg, m) {
    const facing = Number.isFinite(reg.facing) ? reg.facing : -Math.PI / 2, ax = Math.cos(facing + Math.PI / 2), ay = Math.sin(facing + Math.PI / 2);
    const c = centroid(m);
    const nx = Math.cos(facing), ny = Math.sin(facing);
    let lo = Infinity, hi = -Infinity, back = Infinity, front = -Infinity;
    for (const u of m) {
      if (u.type !== 'infantry') continue;
      const p = (u.x - c.x) * ax + (u.y - c.y) * ay, q = (u.x - c.x) * nx + (u.y - c.y) * ny;
      lo = Math.min(lo, p); hi = Math.max(hi, p); back = Math.min(back, q); front = Math.max(front, q);
    }
    if (!Number.isFinite(lo)) { lo = hi = back = front = 0; }
    const mid = (lo + hi) / 2, depth = (back + front) / 2;
    // Long enough for every file, deep enough for every rank, with room to stand.
    return { x: c.x + ax * mid + nx * depth, y: c.y + ay * mid + ny * depth, facing, length: Math.max(60, hi - lo + 30), width: Math.max(cfg.trenchWidth, front - back + 26) };
  }
  // Manning, once a second for every regiment: one that has left its trench
  // lets go of it; one that halts by an empty finished trench - any regiment,
  // as often as it comes back - steps into it, front the way the trench faces,
  // and stands on the defensive.
  function manTrenches(reg) {
    if (reg.trenchCheckAt != null && elapsed - reg.trenchCheckAt < 1) return;
    reg.trenchCheckAt = elapsed;
    const m = regimentMembers(reg); if (!m.length) return;
    const c = centroid(m), last = reg.trenchLast;
    reg.trenchLast = c;
    reg.trenchStill = last && Math.hypot(c.x - last.x, c.y - last.y) < 8 && !m.some(u => u.routing) ? (reg.trenchStill || 0) + 1 : 0;
    const own = reg.trenchId ? trenches.find(t => t.id === reg.trenchId) : null;
    if (reg.trenchId && (!own || Math.hypot(own.x - c.x, own.y - c.y) > cfg.trenchSnap)) reg.trenchId = null;
    if (reg.trenchId && own && reg.trenchStill >= 1) drummerIntoTrench(reg, m, own);
    if (reg.trenchId || reg.trenchStill < 2) return;
    const t = trenches.filter(q => q.progress >= 1 && Math.hypot(q.x - c.x, q.y - c.y) < cfg.trenchSnap)
      .sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0];
    if (!t || regiments.some(r => r !== reg && !r.destroyed && r.trenchId === t.id)) return;
    reg.trenchId = t.id; t.side = reg.side; stats.manned++;
    if (reg.side === 'france') reg.defend = true;
    reg.formation = 'line';
    if (typeof arrangeFacingRegimentV146 === 'function') arrangeFacingRegimentV146(reg, t.x, t.y, 'line', t.facing);
    // The trench covers them as soon as they stand in it; bracing follows when they halt.
  }
  // The drummer goes down into the trench too, at one end behind the ranks,
  // instead of standing out in front on the open field.
  function drummerIntoTrench(reg, m, t) {
    const d = m.find(u => u.type === 'drummer' && !u.dead && !u.routing); if (!d) return;
    const w = t.width / 2, along = -(t.length / 2 - w * 0.45), across = -w * 0.2;
    const x = t.x + Math.cos(t.facing + Math.PI / 2) * along + Math.cos(t.facing) * across;
    const y = t.y + Math.sin(t.facing + Math.PI / 2) * along + Math.sin(t.facing) * across;
    if (Math.hypot((d.targetX ?? d.x) - x, (d.targetY ?? d.y) - y) > 3) { d.targetX = x; d.targetY = y; stats.drummers = (stats.drummers || 0) + 1; }
  }
  function trenchWork(reg, m, c) {
    // By a trench already: finish digging it, or (finished) nothing to dig here.
    const near = trenches.find(t => Math.hypot(t.x - c.x, t.y - c.y) < cfg.trenchSnap);
    if (near && near.progress >= 1) return;
    if (!isBraced(reg) || elapsed - reg.bracedAt < cfg.braceSeconds + cfg.digDelay) return;
    let t = near && near.progress < 1 ? near : null;
    if (!t && !near) {
      if (trenches.length >= cfg.maxTrenches) return;
      const g = lineGeometry(reg, m);
      t = { id: ++trenchSeq, side: reg.side, x: g.x, y: g.y, facing: g.facing, length: g.length, width: g.width, progress: 0, startedAt: elapsed };
      trenches.push(t); reg.trenchId = t.id; stats.dug++;
    }
    if (!t) return;
    // A second has passed since the last check (refresh runs the stance once a second).
    const rate = (foeNear(reg.side, c, 260) ? 0.4 : 1) / cfg.digSeconds;
    t.progress = Math.min(1, t.progress + rate);
    t.diggers = reg.id; t.dugAt = elapsed;
    if (t.progress >= 1) reg.trenchId = t.id;
  }
  let trenchSeq = 0;
  if (typeof resetGame === 'function') {
    const baseReset = resetGame;
    resetGame = function resetGameClearingTrenches(...args) { trenches.length = 0; return baseReset(...args); };
  }

  // ---- the advantage ----
  const baseDamage = applyDamage;
  applyDamage = function applyDamageWithStance(victim, damage, shock = 8) {
    if (victim && victim.kind === 'unit' && trenches.length && trenchAt(victim.x, victim.y)) {
      stats.inTrench++; return baseDamage(victim, damage * cfg.trenchDamage, shock * cfg.trenchShock);
    }
    const reg = regOf(victim);
    if (isBraced(reg)) { stats.reduced++; return baseDamage(victim, damage * cfg.defendDamage, shock * cfg.defendShock); }
    return baseDamage(victim, damage, shock);
  };
  if (typeof fire === 'function') {
    const baseFire = fire;
    fire = function fireWithStance(unit, enemy) {
      const r = baseFire(unit, enemy);
      if (isBraced(regOf(unit)) && Number.isFinite(unit.reload)) unit.reload *= cfg.defendReload;
      return r;
    };
  }

  // Fire at will from a trench or a braced line: a man there shoots as soon as
  // he is loaded and an enemy is inside his reach, instead of waiting for the
  // army-wide volley beat (up to 3 s), so an enemy entering the shown range is
  // met at once.
  if (typeof updateUnit === 'function') {
    const baseUpdateUnit = updateUnit;
    updateUnit = function updateUnitFiringAtWill(u, dt) {
      if (u && !u.dead && !u.routing && u.type === 'infantry' && u.attackMode !== 'bayonet' && u.reload - dt <= 0 &&
          ((trenches.length && trenchAt(u.x, u.y)) || isBraced(regOf(u)))) {
        const enemy = nearestEnemyEntity(u, TYPES.infantry.range);
        if (enemy) { fire(u, enemy); stats.atWill = (stats.atWill || 0) + 1; }
      }
      return baseUpdateUnit(u, dt);
    };
  }

  // ---- orders ----
  const selectedRegs = () => (typeof selectedRegiments === 'function' ? selectedRegiments() : []).filter(r => r.side === 'france' && !r.destroyed);
  function toggleDefend(regs = selectedRegs()) {
    if (!regs.length) return false;
    const on = regs.some(r => !r.defend);
    for (const r of regs) { r.defend = on; r.bracedAt = null; r.stanceLast = null; r.stanceCheckAt = null; }
    stats.toggles++;
    statusEl.textContent = on
      ? `${regs.length > 1 ? regs.length + ' regimenten verdedigen' : regs[0].name + ' verdedigt'}: in linie of carré stilstaand na ${cfg.braceSeconds} s ingegraven - ${Math.round((1 - cfg.defendDamage) * 100)}% minder verlies, minder moraalverlies, sneller herladen.`
      : `Verdedigende houding opgeheven.`;
    actionSignature = ''; updateHud(true);
    return on;
  }
  const looseInfantry = () => [...selectedUnits].filter(u => !u.dead && !u.routing && !u.regimentId && u.side === 'france' && u.type === 'infantry');
  function reinforce() {
    const regs = selectedRegs(); if (regs.length !== 1) return 0;
    const reg = regs[0], members = regimentMembers(reg);
    const room = cfg.maxInfantry - members.filter(u => u.type === 'infantry').length;
    const joining = looseInfantry().slice(0, Math.max(0, room));
    if (!joining.length) { statusEl.textContent = `${reg.name} is al op volle sterkte (${cfg.maxInfantry} musketiers).`; return 0; }
    for (const u of joining) { reg.memberIds.push(u.id); u.regimentId = reg.id; u.morale = Math.max(u.morale || 0, reg.morale || 80); }
    reg.formedInfantryCount = (reg.formedInfantryCount || 0) + joining.length;
    const c = centroid(regimentMembers(reg));
    if (typeof arrangeFacingRegimentV146 === 'function') arrangeFacingRegimentV146(reg, c.x, c.y, reg.formation || 'line', reg.facing);
    else arrangeRegiment(reg, c.x, c.y, reg.formation || 'line');
    stats.reinforced += joining.length;
    selectWholeRegiment(reg);
    statusEl.textContent = `${reg.name} versterkt met ${joining.length} musketier${joining.length === 1 ? '' : 's'} - nu ${regimentMembers(reg).filter(u => u.type === 'infantry').length} musketiers.`;
    actionSignature = ''; updateHud(true);
    return joining.length;
  }

  // ---- buttons and key ----
  if (typeof renderDynamicActions === 'function' && typeof makeDynamicButton === 'function') {
    const baseRender = renderDynamicActions;
    renderDynamicActions = function renderRegimentOrders(force = false) {
      baseRender(force);
      const regs = selectedRegs();
      if (!regs.length) return;
      if (!actionsEl.querySelector('[data-action="defend-stance"]')) {
        const on = regs.every(r => r.defend);
        const b = makeDynamicButton('defend-stance', on ? '🛡 Verdedigt<br><small>uit · V</small>' : '🛡 Verdedig<br><small>houding · V</small>');
        b.title = 'Verdedigende houding: in linie of carré stilstaand graaft het regiment zich in - minder verlies, minder moraalverlies, sneller herladen.';
        actionsEl.appendChild(b);
      }
      const loose = looseInfantry().length;
      if (regs.length === 1 && loose && !actionsEl.querySelector('[data-action="reinforce-regiment"]')) {
        const have = regimentMembers(regs[0]).filter(u => u.type === 'infantry').length;
        const b = makeDynamicButton('reinforce-regiment', `Versterk regiment<br><small>+${Math.min(loose, Math.max(0, cfg.maxInfantry - have))} · ${have}/${cfg.maxInfantry}</small>`, have >= cfg.maxInfantry);
        b.title = `Voeg de geselecteerde losse musketiers toe aan het regiment (tot ${cfg.maxInfantry}).`;
        actionsEl.prepend(b);
      }
    };
    actionsEl.addEventListener('click', e => {
      const b = e.target.closest('button[data-action]');
      if (!b || b.disabled) return;
      if (b.dataset.action === 'defend-stance') toggleDefend();
      else if (b.dataset.action === 'reinforce-regiment') reinforce();
    });
  }
  addEventListener('keydown', e => {
    if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (e.key.toLowerCase() === 'v' && selectedRegs().length) { e.preventDefault(); toggleDefend(); }
  });

  global.__REGIMENT_ORDERS_V1__ = Object.freeze({
    version: 'regiment-orders-v1', config: cfg, isBraced, toggleDefend, reinforce,
    trenches: () => trenches, trenchAt, diggingAt,
    stats: () => ({ ...stats, trenches: trenches.length, finished: trenches.filter(t => t.progress >= 1).length, braced: regiments.filter(isBraced).length, defending: regiments.filter(r => !r.destroyed && r.defend).length })
  });
})(window);
