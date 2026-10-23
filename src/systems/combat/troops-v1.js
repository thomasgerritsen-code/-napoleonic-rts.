'use strict';
// Troop kinds (open map only, NRTS_CONFIG.troops): musketeers and horsemen
// come in kinds with a strength and a weakness each. They are the game's own
// infantry and cavalry with a 'troop' tag, trained at the barracks and the
// stable for an extra price; the British field them too.
//   Grenadier  - elite: tougher, harder with the bayonet, steadier; slower, dearer.
//   Voltigeur  - light: shoots farther and at will, quicker; frailer, weak hand to hand.
//   Kurassier  - heavy horse: tough, armoured against musket balls, crushing charge; slow, costs iron.
//   Huzaar     - light horse: fast, sees far, quick to reload; frail, lighter charge.
(function installTroopsV1(root) {
  const cfg = root.NRTS_CONFIG?.troops;
  if (!cfg) return;
  if (document.readyState !== 'complete') { addEventListener('load', () => installTroopsV1(root), { once: true }); return; }
  if (root.__TROOPS_V1__ || typeof TRAINING === 'undefined') return;
  const T = cfg.kinds;
  const troopOf = u => (u && u.troop && T[u.troop]) || null;
  const stats = { trained: 0, british: 0, armour: 0 };

  function applyTroop(u, key) {
    const t = T[key]; if (!t || u.troop) return;
    u.troop = key;
    u.maxHp = Math.round((u.maxHp || TYPES[u.type].hp) * (t.hp || 1)); u.hp = u.maxHp;
  }

  // ---- training: barracks and stable get a button per kind ----
  const BUILDING_FOR = { infantry: 'barracks', cavalry: 'stable' };
  const costOf = key => { const t = T[key], base = TRAINING[t.base].cost, c = {}; for (const k of ['food', 'wood', 'iron']) { const v = (base[k] || 0) + (t.extra?.[k] || 0); if (v) c[k] = v; } return c; };
  const costText = c => [c.food ? `${c.food} 🍞` : '', c.wood ? `${c.wood} 🪵` : '', c.iron ? `${c.iron} ⛏️` : ''].filter(Boolean).join(' · ');
  function trainTroop(key, b = selectedBuilding) {
    const t = T[key];
    if (!b || b.dead || !b.complete || b.side !== 'france' || b.type !== BUILDING_FOR[t.base]) return false;
    const extra = t.extra || {};
    // The base price is paid by the game's own queue; the kind's extra on top.
    if (!canAfford('france', costOf(key))) { statusEl.textContent = `Niet genoeg grondstoffen voor een ${t.label}: ${costText(costOf(key))}.`; return false; }
    if (!queueUnitForBuilding('france', b, t.base)) { statusEl.textContent = 'Kan nu niet trainen (bevolkingsruimte of grondstoffen).'; return false; }
    pay('france', extra);
    const item = b.queue[b.queue.length - 1];
    item.troop = key; item.label = t.label; item.time *= t.time || 1;
    statusEl.textContent = `${t.label} toegevoegd aan productie.`;
    actionSignature = ''; updateHud(true);
    return true;
  }
  // Newly trained men get the kind of the order that made them.
  const baseUpdateBuildings = updateBuildings;
  updateBuildings = function updateBuildingsWithTroops(dt) {
    const heads = [];
    for (const b of buildings) if (!b.dead && b.queue?.length) heads.push([b, b.queue[0]]);
    const before = new Set(units.map(u => u.id));
    const r = baseUpdateBuildings(dt);
    if (units.length !== before.size) {
      const fresh = units.filter(u => !before.has(u.id) && !u.dead);
      for (const [b, head] of heads) {
        if (b.queue[0] === head || !head.troop) continue;
        const u = fresh.filter(q => q.type === head.type && q.side === b.side && !q.troop)
          .sort((p, q) => Math.hypot(p.x - b.x, p.y - b.y) - Math.hypot(q.x - b.x, q.y - b.y))[0];
        if (u) { applyTroop(u, head.troop); stats.trained++; }
      }
      // The British field the kinds as well: a share of their new men.
      for (const u of fresh) {
        if (u.side !== 'britain' || u.troop) continue;
        const roll = Math.random();
        if (u.type === 'infantry') { if (roll < cfg.britishShare) applyTroop(u, 'grenadier'); else if (roll < cfg.britishShare * 2) applyTroop(u, 'voltigeur'); }
        else if (u.type === 'cavalry') applyTroop(u, roll < 0.5 ? 'cuirassier' : 'hussar');
        if (u.troop) stats.british++;
      }
    }
    return r;
  };

  // ---- strengths and weaknesses ----
  if (typeof moveToward === 'function') {
    const base = moveToward;
    moveToward = function moveTowardByTroop(u, tx, ty, dt, speed) {
      const t = troopOf(u); if (t?.speed) dt *= t.speed;
      return arguments.length >= 5 ? base(u, tx, ty, dt, speed) : base(u, tx, ty, dt);
    };
  }
  if (typeof visionRadius === 'function') {
    const base = visionRadius;
    visionRadius = function visionRadiusByTroop(e) { const t = troopOf(e); return base(e) * (t?.vision || 1); };
  }
  let striker = null;
  const baseFire = fire;
  fire = function fireByTroop(unit, enemy) {
    const t = troopOf(unit), n = projectiles.length, before = striker; striker = unit;
    let r;
    try { r = baseFire(unit, enemy); } finally { striker = before; }
    if (t) {
      // A ball fired carries the shooter's kind (and its weight).
      // Point blank (bayonet reach) counts as hand to hand.
      const close = enemy && Math.hypot(enemy.x - unit.x, enemy.y - unit.y) < 40;
      for (let i = n; i < projectiles.length; i++) { projectiles[i].troop = unit.troop; projectiles[i].damage *= close ? (t.melee || 1) : (t.ranged || 1); }
      if (t.reload && Number.isFinite(unit.reload)) unit.reload *= t.reload;
    }
    return r;
  };
  const baseDamage = applyDamage;
  applyDamage = function applyDamageByTroop(victim, damage, shock = 8) {
    if (victim && victim.kind === 'unit' && !victim.dead) {
      // Hand to hand (no ball in flight): the striker's melee weight, a charge's weight.
      const s = striker && !striker.dead ? troopOf(striker) : null;
      if (s) damage *= striker.type === 'cavalry' ? (s.charge || 1) : (s.melee || 1);
      const v = troopOf(victim);
      if (v) {
        shock *= v.shock || 1;
        // Armour turns musket balls (not round shot, not sabres).
        if (v.armour && !striker) {
          const ball = projectiles.find(p => !p.dead && !p.artillery && p.target === victim && Math.hypot(p.x - victim.x, p.y - victim.y) < 14);
          if (ball) { damage *= 1 - v.armour; stats.armour++; }
        }
      }
    }
    return baseDamage(victim, damage, shock);
  };
  if (typeof updateUnit === 'function') {
    const base = updateUnit;
    updateUnit = function updateUnitByTroop(u, dt) {
      // Light troops shoot at will, and a little farther than the line.
      const t = troopOf(u);
      if (t?.range && !u.dead && !u.routing && u.reload - dt <= 0 && u.attackMode !== 'bayonet') {
        const enemy = nearestEnemyEntity(u, (TYPES[u.type].range || 0) * t.range);
        if (enemy) fire(u, enemy);
      }
      return base(u, dt);
    };
  }
  // A regiment mostly of one kind carries its name.
  const baseCreate = createRegiment;
  createRegiment = function createRegimentByTroop(side, candidateUnits, name = null) {
    const reg = baseCreate(side, candidateUnits, name);
    if (reg && !name) {
      const m = regimentMembers(reg).filter(u => u.type === 'infantry' || u.type === 'cavalry'), count = {};
      for (const u of m) if (u.troop) count[u.troop] = (count[u.troop] || 0) + 1;
      const [key, n] = Object.entries(count).sort((a, b) => b[1] - a[1])[0] || [];
      if (key && n >= m.length / 2) { reg.troop = key; reg.name = `${side === 'france' ? 'Franse' : 'Britse'} ${T[key].plural} ${reg.id}`; }
    }
    return reg;
  };

  // ---- buttons ----
  if (typeof renderDynamicActions === 'function' && typeof makeDynamicButton === 'function') {
    const base = renderDynamicActions;
    renderDynamicActions = function renderWithTroops(force = false) {
      base(force);
      const b = typeof selectedBuilding !== 'undefined' ? selectedBuilding : null;
      if (!b || b.dead || !b.complete || b.side !== 'france') return;
      for (const [key, t] of Object.entries(T)) {
        if (BUILDING_FOR[t.base] !== b.type || actionsEl.querySelector(`[data-action="train-${key}"]`)) continue;
        const c = costOf(key), btn = makeDynamicButton(`train-${key}`, `${t.label}<br><small>${costText(c)}</small>`, !canAfford('france', c));
        btn.title = `${t.label}: ${t.pro} — maar ${t.con}.`;
        actionsEl.appendChild(btn);
      }
    };
    actionsEl.addEventListener('click', e => {
      const btn = e.target.closest('button[data-action^="train-"]'); if (!btn || btn.disabled) return;
      const key = btn.dataset.action.slice(6); if (T[key]) trainTroop(key);
    });
  }
  // What a selected kind can do, in the selection line.
  const baseHud = updateHud;
  updateHud = function updateHudWithTroops(...args) {
    const r = baseHud.apply(this, args);
    const sel = [...selectedUnits].filter(u => !u.dead && troopOf(u));
    if (sel.length && typeof setSelectionDetails === 'function') {
      const counts = {};
      for (const u of sel) counts[u.troop] = (counts[u.troop] || 0) + 1;
      const [key] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      const det = typeof selectionDetailsEl !== 'undefined' ? selectionDetailsEl : document.getElementById('selectionDetails');
      if (det && !det.textContent.includes(T[key].label)) det.textContent = `${det.textContent} · ${T[key].plural}: ${T[key].pro}; ${T[key].con}`;
    }
    return r;
  };

  root.__TROOPS_V1__ = Object.freeze({ version: '1.0', kinds: T, applyTroop, trainTroop, costOf, troopOf, stats: () => ({ ...stats,
    french: Object.fromEntries(Object.keys(T).map(k => [k, units.filter(u => !u.dead && u.side === 'france' && u.troop === k).length])) }) });
})(window);
