'use strict';
// ---------- Regiment orders v1 (open map: ?view=iso) ----------
// Two orders for the player's regiments:
//   - Defend (button, or V): a regiment that stands still in line or square
//     braces after braceSeconds - kneeling ranks, prepared volleys. While braced
//     it takes defendDamage of the losses, defendShock of the morale shock, and
//     reloads in defendReload of the time. Moving loses the advantage; it builds
//     up again where the regiment halts. The British commander braces its
//     regiments while it defends or regroups.
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
  const stats = { braced: 0, reduced: 0, reinforced: 0, toggles: 0 };
  const isBraced = reg => !!(reg && !reg.destroyed && reg.defend && reg.bracedAt != null && elapsed - reg.bracedAt >= cfg.braceSeconds);
  const regOf = u => (u && u.kind === 'unit' && u.regimentId && typeof getRegiment === 'function') ? getRegiment(u.regimentId) : null;

  // ---- bracing: standing still in line or square ----
  const baseRefresh = refreshRegiment;
  refreshRegiment = function refreshRegimentWithStance(reg) {
    baseRefresh(reg);
    if (!reg || reg.destroyed) return;
    if (reg.side === 'britain' && typeof AI_COMMANDER_V1 !== 'undefined') reg.defend = AI_COMMANDER_V1.state === 'DEFEND' || AI_COMMANDER_V1.state === 'REGROUP';
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
  };

  // ---- the advantage ----
  const baseDamage = applyDamage;
  applyDamage = function applyDamageWithStance(victim, damage, shock = 8) {
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
    stats: () => ({ ...stats, braced: regiments.filter(isBraced).length, defending: regiments.filter(r => !r.destroyed && r.defend).length })
  });
})(window);
