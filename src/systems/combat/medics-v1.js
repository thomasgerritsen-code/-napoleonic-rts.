'use strict';
// Wounded, stretcher-bearers and the field hospital (open map only,
// NRTS_CONFIG.medics). Of the men who fall, a share is wounded rather than
// killed: they lie where they fell. A field hospital (an ambulance, after
// Larrey) sends out its stretcher teams - two bearers and a stretcher - to bring
// in the wounded of its own side, nearest first. At the hospital they mend, and
// once well they march back to the regiment they came from (when it still
// stands and has room), or wait free near the hospital. Wounded nobody fetches
// bleed to death after a while. The bearers do not fight and are not shot at.
(function installMedicsV1(root) {
  const cfg = root.NRTS_CONFIG?.medics;
  if (!cfg) return;
  if (document.readyState !== 'complete') { addEventListener('load', () => installMedicsV1(root), { once: true }); return; }
  if (root.__MEDICS_V1__ || typeof BUILDINGS === 'undefined' || typeof applyDamage !== 'function') return;
  BUILDINGS.hospital = { w: cfg.hospital.w, h: cfg.hospital.h, hp: cfg.hospital.hp, label: 'Veldhospitaal', cost: { ...cfg.hospital.cost } };
  const stats = { wounded: 0, fetched: 0, healed: 0, rejoined: 0, bledOut: 0, aiBuilt: 0 };
  // Each wounded man: { id, u (the fallen unit), x, y, side, type, troop, regId, at, state:
  //   'lying' | 'carried' | 'healing' | 'healed' | 'dead', team, until, healedAs }
  const wounded = [], byId = new Map();
  const hospitals = side => buildings.filter(b => !b.dead && b.type === 'hospital' && b.complete && (!side || b.side === side));
  const costText = c => [c.food ? `${c.food} 🍞` : '', c.wood ? `${c.wood} 🪵` : ''].filter(Boolean).join(' · ');

  // ---- falling: killed or wounded ----
  const baseDamage = applyDamage;
  applyDamage = function applyDamageWithWounded(victim, damage, shock) {
    const alive = victim && victim.kind === 'unit' && !victim.dead;
    const r = baseDamage.apply(this, arguments);
    if (alive && victim.dead && cfg.types.includes(victim.type) && Math.random() < cfg.woundedShare) wound(victim);
    return r;
  };
  function wound(u) {
    const w = { id: u.id, u, x: u.x, y: u.y, side: u.side, type: u.type, troop: u.troop || null, regId: u.regimentId || null,
      at: elapsed, state: 'lying', team: null, until: 0 };
    wounded.push(w); byId.set(u.id, w); stats.wounded++;
    return w;
  }

  // ---- stretcher teams ----
  function teamsOf(h) {
    if (!h.medTeams) h.medTeams = Array.from({ length: cfg.teams }, (_, i) => ({ id: h.id * 10 + i, x: h.x, y: h.y + h.h * 0.4, state: 'idle', target: null, facing: 0, moving: false }));
    return h.medTeams;
  }
  function step(t, tx, ty, dt) {
    const dx = tx - t.x, dy = ty - t.y, d = Math.hypot(dx, dy), s = cfg.teamSpeed * dt;
    t.moving = d > 1; if (d > 0.01) t.facing = Math.atan2(dy, dx);
    if (d <= s) { t.x = tx; t.y = ty; return true; }
    t.x += dx / d * s; t.y += dy / d * s; return false;
  }
  function pick(h) {
    let best = null, bd = cfg.reach;
    for (const w of wounded) {
      if (w.state !== 'lying' || w.team || w.side !== h.side) continue;
      const d = Math.hypot(w.x - h.x, w.y - h.y);
      if (d < bd) { best = w; bd = d; }
    }
    return best;
  }
  function updateTeams(h, dt) {
    const home = { x: h.x, y: h.y + h.h * 0.4 };
    for (const t of teamsOf(h)) {
      if (t.state === 'idle') {
        const w = pick(h);
        if (w) { w.team = t.id; t.target = w; t.state = 'out'; }
        else { step(t, home.x, home.y, dt); continue; }
      }
      const w = t.target;
      if (t.state === 'out') {
        if (!w || w.state !== 'lying') { t.state = 'idle'; t.target = null; continue; }
        if (step(t, w.x, w.y, dt)) { w.state = 'carried'; t.state = 'carry'; stats.fetched++; }
      } else if (t.state === 'carry') {
        if (step(t, home.x, home.y, dt)) {
          w.state = 'healing'; w.until = elapsed + cfg.healSeconds; w.hospital = h.id; w.team = null;
          t.state = 'idle'; t.target = null;
        } else { w.x = t.x; w.y = t.y; }
      }
    }
  }
  // ---- mending and going back ----
  function regimentKind(reg) { const m = regimentMembers(reg).find(u => u.type === 'infantry'); return (m && m.troop) || ''; }
  function discharge(w, h) {
    if (typeof populationUsed === 'function' && populationUsed(w.side) + (TYPES[w.type]?.pop || 1) > economies[w.side].popCap) return false;
    const a = Math.random() * Math.PI * 2;
    const u = createUnit(w.side, w.type, h.x + Math.cos(a) * h.w * 0.6, h.y + h.h * 0.5 + Math.sin(a) * 10);
    if (w.troop) root.__TROOPS_V1__?.applyTroop?.(u, w.troop);
    w.state = 'healed'; w.healedAs = u.id; stats.healed++;
    // Back to his own regiment, if it still stands, is of his kind and has room.
    const reg = w.regId != null && typeof getRegiment === 'function' ? getRegiment(w.regId) : null;
    const max = root.NRTS_CONFIG?.regimentOrders?.maxInfantry || 36;
    const room = reg && !reg.destroyed && (w.type !== 'infantry' || (regimentKind(reg) === (w.troop || '') && regimentMembers(reg).filter(m => m.type === 'infantry').length < max));
    const roleFree = reg && (w.type === 'officer' ? !regimentMembers(reg).some(m => m.type === 'officer') : w.type === 'drummer' ? !regimentMembers(reg).some(m => m.type === 'drummer') : true);
    if (room && roleFree) {
      reg.memberIds.push(u.id); u.regimentId = reg.id; u.morale = Math.max(u.morale || 0, reg.morale || 70);
      if (w.type === 'infantry') reg.formedInfantryCount = (reg.formedInfantryCount || 0) + 1;
      if (w.type === 'officer') reg.officerId = u.id;
      if (w.type === 'drummer') reg.drummerId = u.id;
      const c = centroid(regimentMembers(reg));
      if (typeof arrangeFacingRegimentV146 === 'function') arrangeFacingRegimentV146(reg, c.x, c.y, reg.formation || 'line', reg.facing);
      stats.rejoined++;
      if (w.side === 'france' && typeof statusEl !== 'undefined') statusEl.textContent = `Hersteld uit het veldhospitaal: terug naar ${reg.name}.`;
    }
    return true;
  }

  const baseUpdateBuildings = updateBuildings;
  updateBuildings = function updateBuildingsWithMedics(dt) {
    const r = baseUpdateBuildings(dt);
    for (const h of hospitals()) updateTeams(h, dt);
    for (const w of wounded) {
      if (w.state === 'lying' && !w.team && elapsed - w.at > cfg.bleedOutSeconds) { w.state = 'dead'; stats.bledOut++; }
      else if (w.state === 'carried' || (w.state === 'lying' && w.team)) {
        // A team whose hospital fell: the man is put down where he is.
        const t = w.team != null && hospitals(w.side).flatMap(teamsOf).find(q => q.id === w.team);
        if (!t) { w.state = 'lying'; w.team = null; }
      } else if (w.state === 'healing') {
        const h = buildings.find(b => b.id === w.hospital && !b.dead);
        if (!h) { w.state = 'dead'; stats.bledOut++; }
        else if (elapsed >= w.until) discharge(w, h);
      }
    }
    // Forget the long settled (the healed are units again; the dead are corpses).
    for (let i = wounded.length - 1; i >= 0; i--) if ((wounded[i].state === 'healed' || wounded[i].state === 'dead') && elapsed - wounded[i].at > cfg.bleedOutSeconds * 3) { byId.delete(wounded[i].id); wounded.splice(i, 1); }
    aiHospital();
    return r;
  };

  // ---- building it ----
  function ensureButton() {
    if (typeof actionsEl === 'undefined' || actionsEl.querySelector('[data-action="build-hospital"]')) return;
    if (!actionsEl.querySelector('[data-action="build-farm"]')) return;   // the peasants' build menu
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.action = 'build-hospital';
    b.innerHTML = `Veldhospitaal<br><small>${costText(cfg.hospital.cost)}</small>`;
    b.title = 'Brancardiers halen gewonden op; in het hospitaal herstellen ze en gaan terug naar hun regiment';
    const tower = actionsEl.querySelector('[data-action="build-tower"]') || actionsEl.querySelector('[data-action="build-farm"]');
    tower.after(b);
  }
  ensureButton();
  if (typeof renderDynamicActions === 'function') {
    const base = renderDynamicActions;
    renderDynamicActions = function renderDynamicActionsWithHospital(...args) { const r = base.apply(this, args); ensureButton(); return r; };
  }
  actionsEl?.addEventListener('click', e => {
    const btn = e.target.closest('button[data-action="build-hospital"]');
    if (!btn || btn.disabled) return;
    startBuild('hospital');
    if (buildMode === 'hospital') statusEl.textContent = `Plaats een veldhospitaal (${costText(cfg.hospital.cost)}): brancardiers halen de gewonden op.`;
  });
  // The British put theirs behind their town centre, away from the French.
  if (typeof findBuildLocation === 'function') {
    const base = findBuildLocation;
    findBuildLocation = function findBuildLocationWithHospital(side, type, index = 0) {
      if (type !== 'hospital') return base(side, type, index);
      const tc = livingBuildings(side).find(b => b.type === 'towncenter'); if (!tc) return null;
      const a = (sideDir(side) > 0 ? Math.PI : 0) + (index % 5 - 2) * 0.4, r = 170 + 30 * Math.floor(index / 5);
      const x = tc.x + Math.cos(a) * r, y = tc.y + Math.sin(a) * r;
      for (let ring = 0; ring <= 8; ring++) for (let k = 0; k < (ring ? 16 : 1); k++) {
        const px = x + Math.cos(k / 16 * Math.PI * 2) * ring * 24, py = y + Math.sin(k / 16 * Math.PI * 2) * ring * 24;
        if (validBuildingSpot('hospital', px, py)) return { x: px, y: py };
      }
      return { x, y };
    };
  }
  let aiCheckAt = 0;
  function aiHospital() {
    if (gameOver || elapsed < cfg.aiAfter || elapsed < aiCheckAt) return;
    aiCheckAt = elapsed + 7;
    if (buildings.some(b => !b.dead && b.side === 'britain' && b.type === 'hospital')) return;
    if (economies.britain.wood < (cfg.hospital.cost.wood || 0) + 100 || economies.britain.food < (cfg.hospital.cost.food || 0) + 100) return;
    if (typeof aiBuild === 'function' && aiBuild('hospital')) stats.aiBuilt++;
  }
  if (typeof resetGame === 'function') {
    const base = resetGame;
    resetGame = function resetGameWithMedics(...args) { wounded.length = 0; byId.clear(); return base(...args); };
  }

  root.__MEDICS_V1__ = Object.freeze({ version: '1.0', config: cfg, wounded: () => wounded, isWounded: id => byId.has(id), byId: id => byId.get(id) || null,
    teams: () => hospitals().flatMap(h => teamsOf(h).map(t => ({ ...t, side: h.side, hospital: h.id }))), hospitals, wound,
    stats: () => ({ ...stats, lying: wounded.filter(w => w.state === 'lying').length, carried: wounded.filter(w => w.state === 'carried').length,
      healing: wounded.filter(w => w.state === 'healing').length }) });
})(window);
