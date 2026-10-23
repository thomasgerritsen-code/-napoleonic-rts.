'use strict';
// Gun crews (open map only, NRTS_CONFIG.gunCrew): a cannon needs two musketeers
// to serve it. The game's own 'Kanonbemanning' takes only loose men, and on the
// open map new men soon stand in a regiment, so this makes crewing easy again:
//   - a cannon selected: 'Kanon bemannen' fetches two men - loose ones first,
//     else from the nearest regiment that can spare them;
//   - soldiers (loose or a regiment) selected: click or tap one of your own
//     uncrewed cannons and two of them go and serve it;
//   - a battery that lost a man gets him replaced the same way.
(function installGunCrewV1(root) {
  const cfg = root.NRTS_CONFIG?.gunCrew;
  if (!cfg) return;
  if (document.readyState !== 'complete') { addEventListener('load', () => installGunCrewV1(root), { once: true }); return; }
  if (root.__GUN_CREW_V1__ || typeof createArtilleryBatteryV06 !== 'function') return;
  const stats = { crewed: 0, refilled: 0, fromRegiments: 0, clicks: 0 };
  const CREW = 2;
  const regOf = u => (u && u.regimentId ? getRegiment(u.regimentId) : null);
  const ok = u => u && !u.dead && !u.routing && u.side === 'france';
  const byDistance = (list, p) => list.slice().sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
  const crewOf = gun => { const reg = regOf(gun); return reg && groupKindV06(reg) === 'artillery' ? artilleryCrewV06(reg) : []; };
  const needs = gun => ok(gun) && gun.type === 'artillery' && crewOf(gun).length < CREW;
  // A man may leave an infantry regiment if it keeps enough men (officer and drummer stay);
  // 'taken' are the men already picked.
  function spare(u, taken) {
    if (!ok(u) || u.type !== 'infantry') return false;
    const reg = regOf(u); if (!reg) return true;
    if (groupKindV06(reg) !== 'infantry' || reg.destroyed) return false;
    const left = regimentMembers(reg).filter(m => m.type === 'infantry' && !m.dead).length - taken.filter(m => m.regimentId === reg.id).length;
    return left > cfg.keepInRegiment;
  }
  function detach(u) {
    const reg = regOf(u); if (!reg) return;
    reg.memberIds = reg.memberIds.filter(id => id !== u.id);
    reg.formedInfantryCount = Math.max(0, (reg.formedInfantryCount || 1) - 1);
    u.regimentId = null; stats.fromRegiments++;
    const m = regimentMembers(reg);
    if (m.length && typeof arrangeFacingRegimentV146 === 'function') { const c = centroid(m); arrangeFacingRegimentV146(reg, c.x, c.y, reg.formation || 'line', reg.facing); }
  }
  // Who serves this gun: the given men first, then loose men near it, then men a nearby regiment can spare.
  function pickCrew(gun, chosen, n) {
    const picked = [], take = list => { for (const u of list) { if (picked.length >= n) break; if (!picked.includes(u) && spare(u, picked)) picked.push(u); } };
    take(byDistance(chosen.filter(u => !u.regimentId), gun));
    take(byDistance(chosen.filter(u => u.regimentId), gun));
    if (!chosen.length) {
      const near = units.filter(u => ok(u) && u.type === 'infantry' && Math.hypot(u.x - gun.x, u.y - gun.y) <= cfg.reach);
      take(byDistance(near.filter(u => !u.regimentId), gun));
      take(byDistance(near.filter(u => u.regimentId), gun));
    }
    return picked;
  }
  function crewGun(gun, chosen = []) {
    if (!needs(gun)) return 0;
    const reg = regOf(gun), have = crewOf(gun).length;
    const men = pickCrew(gun, chosen, CREW - have);
    if (men.length < CREW - have) return 0;
    men.forEach(detach);
    if (reg && groupKindV06(reg) === 'artillery') {
      // A battery short of hands: the new men join it.
      for (const u of men) { reg.memberIds.push(u.id); reg.crewIds = [...(reg.crewIds || []), u.id]; u.regimentId = reg.id; u.morale = Math.max(u.morale || 0, 85); }
      gun.crewIds = [...reg.crewIds];
      arrangeRegiment(reg, gun.x, gun.y, 'line');
      stats.refilled++;
      return men.length;
    }
    return createArtilleryBatteryV06('france', gun, men) ? (stats.crewed++, men.length) : 0;
  }
  const selected = () => [...selectedUnits].filter(ok);
  function crewSelected() {
    const sel = selected(), guns = sel.filter(needs), men = sel.filter(u => u.type === 'infantry');
    let done = 0, last = null;
    for (const gun of guns) { if (crewGun(gun, men.filter(u => !u.regimentId || regOf(u)?.kind !== 'artillery'))) { done++; last = regOf(gun); } }
    if (!done) { statusEl.textContent = guns.length ? `Geen ${CREW} musketiers in de buurt die het kanon kunnen bemannen.` : 'Selecteer een kanon zonder (volledige) bemanning.'; return 0; }
    if (last) selectWholeRegiment(last);
    statusEl.textContent = done === 1 ? `${last.name}: ${CREW} musketiers bedienen het kanon.` : `${done} kanonnen bemand.`;
    actionSignature = ''; updateHud(true);
    return done;
  }
  // Soldiers selected, a click on an uncrewed cannon of ours: two of them go and serve it.
  const gunAt = (x, y) => byDistance(units.filter(u => needs(u) && Math.hypot(u.x - x, u.y - y) <= cfg.clickRadius), { x, y })[0] || null;
  function crewByClick(x, y) {
    const men = selected().filter(u => u.type === 'infantry' && regOf(u)?.kind !== 'artillery');
    const gun = men.length ? gunAt(x, y) : null;
    if (!gun || !crewGun(gun, men)) return false;
    stats.clicks++;
    statusEl.textContent = `${regOf(gun).name}: ${CREW} musketiers lopen naar het kanon.`;
    actionSignature = ''; updateHud(true);
    return true;
  }
  function ensureHook() {
    if (typeof issueMove !== 'function' || issueMove.gunCrewV1) return;
    const base = issueMove;
    const hooked = function issueMoveToGun(x, y) { if (crewByClick(x, y)) return; return base(x, y); };
    hooked.gunCrewV1 = true;
    issueMove = hooked;
  }
  ensureHook();
  setInterval(ensureHook, 1000);

  if (typeof renderDynamicActions === 'function' && typeof makeDynamicButton === 'function') {
    const base = renderDynamicActions;
    renderDynamicActions = function renderWithGunCrew(force = false) {
      base(force);
      const guns = selected().filter(needs);
      if (!guns.length || actionsEl.querySelector('[data-action="crew-gun"]')) return;
      const men = selected().filter(u => u.type === 'infantry');
      const can = guns.some(g => pickCrew(g, men, CREW - crewOf(g).length).length >= CREW - crewOf(g).length);
      const btn = makeDynamicButton('crew-gun', `Kanon bemannen<br><small>${guns.length > 1 ? guns.length + ' kanonnen · ' : ''}${men.length ? 'met de selectie' : 'haalt 2 man'}</small>`, !can);
      btn.title = 'Twee musketiers bedienen het kanon: losse mannen eerst, anders uit het dichtstbijzijnde regiment.';
      actionsEl.prepend(btn);
      // This one button replaces the game's own (loose men only) crew button.
      actionsEl.querySelector('[data-action="create-battery"]')?.remove();
    };
    actionsEl.addEventListener('click', e => {
      const btn = e.target.closest('button[data-action="crew-gun"]'); if (!btn || btn.disabled) return;
      crewSelected();
    });
  }

  root.__GUN_CREW_V1__ = Object.freeze({ version: '1.0', crewGun, crewSelected, crewByClick, needs, stats: () => ({ ...stats }) });
})(window);
