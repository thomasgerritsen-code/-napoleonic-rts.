'use strict';
// Troop kinds (open map only, NRTS_CONFIG.troops): the regiments of the
// Napoleonic wars, each with a strength and a weakness. They are the game's
// own infantry and cavalry with a 'troop' tag, trained at the barracks and
// the stable for an extra price; the British AI recruits its own.
//   Grenadier      - elite: tougher, harder with the bayonet, steadier; slower, dearer.
//   Voltigeur      - light (British: Light Company): shoots farther and at will; frail.
//   Oude Garde     - the Emperor's veterans: very tough and steady; very dear, capped.
//   Sapeur         - engineers: their regiment digs, upgrades and repairs works faster.
//   95th Rifles    - (British) Baker rifle: far and accurate; slow to load.
//   Kurassier      - heavy horse: armoured against musket balls, crushing charge; slow.
//   Poolse Lansier - lance: deadly against infantry out of square and fugitives; weak against horse.
//   Huzaar         - light horse (British: Light Dragoon): fast, sees far; frail.
//   Scots Grey     - (British) heavy dragoons on greys: tough, heavy charge; slower.
(function installTroopsV1(root) {
  const cfg = root.NRTS_CONFIG?.troops;
  if (!cfg) return;
  if (document.readyState !== 'complete') { addEventListener('load', () => installTroopsV1(root), { once: true }); return; }
  if (root.__TROOPS_V1__ || typeof TRAINING === 'undefined') return;
  const T = cfg.kinds;
  const troopOf = u => (u && u.troop && T[u.troop]) || null;
  // A kind's name in the given army ([label, plural]).
  const nameOf = (key, side = 'france') => T[key].names?.[side] || [T[key].label, T[key].plural];
  const fields = (key, side) => (T[key].sides || ['france', 'britain']).includes(side);
  const regOf = u => (u && u.regimentId && typeof getRegiment === 'function') ? getRegiment(u.regimentId) : null;
  const stats = { trained: 0, british: 0, armour: 0, lance: 0, leftOut: 0 };

  function applyTroop(u, key) {
    const t = T[key]; if (!t || u.troop) return;
    u.troop = key;
    u.maxHp = Math.round((u.maxHp || TYPES[u.type].hp) * (t.hp || 1)); u.hp = u.maxHp;
  }
  // Change a man's kind (or make him line, key ''), keeping his share of health.
  function setTroop(u, key) {
    if ((u.troop || '') === (key || '')) return;
    const share = u.maxHp ? u.hp / u.maxHp : 1, old = T[u.troop];
    u.maxHp = Math.round((u.maxHp || TYPES[u.type].hp) / (old?.hp || 1));
    u.troop = null; if (key) applyTroop(u, key);
    u.hp = Math.max(1, Math.round(u.maxHp * share));
  }

  // ---- one kind to a regiment: grenadiers stand with grenadiers, the line with the line ----
  const kindOf = u => (u && u.troop) || '';
  // The kind most of these men are (ties: the first one's).
  function mainKind(list) {
    const count = new Map();
    for (const u of list) count.set(kindOf(u), (count.get(kindOf(u)) || 0) + 1);
    let best = null; for (const [k, n] of count) if (best === null || n > count.get(best)) best = k;
    return best ?? '';
  }
  // Candidates for a regiment, of one kind for the soldiers of 'type'; France tops a
  // short list up with free men of that kind nearby.
  function oneKind(side, list, type, min) {
    const men = list.filter(u => u && u.type === type && !u.dead && !u.regimentId);
    if (!men.length) return { list, kind: null };
    const kind = mainKind(men);
    const keep = list.filter(u => u && (u.type !== type || kindOf(u) === kind));
    let n = keep.filter(u => u.type === type && !u.dead && !u.regimentId).length;
    stats.leftOut += men.length - n;
    if (side === 'france' && n < min) {
      const c = centroid(men);
      const more = units.filter(u => !u.dead && !u.routing && !u.regimentId && u.side === side && u.type === type && kindOf(u) === kind && !keep.includes(u) && Math.hypot(u.x - c.x, u.y - c.y) <= cfg.fillReach)
        .sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y)).slice(0, min - n);
      keep.push(...more);
    }
    return { list: keep, kind };
  }
  // The British AI raises whole regiments of a kind: one roll per regiment.
  function rollBritish(type) {
    let roll = Math.random();
    for (const [key, share] of Object.entries(cfg.britishShare)) {
      if (T[key]?.base !== type || !fields(key, 'britain')) continue;
      if ((roll -= share) < 0) return key;
    }
    return '';
  }
  function settle(reg, type, kind) {
    if (!reg) return reg;
    const m = regimentMembers(reg).filter(u => u.type === type);
    if (reg.side === 'britain') { kind = rollBritish(type); for (const u of m) setTroop(u, kind); if (kind) stats.british++; }
    reg.troop = kind || null;
    if (kind && !reg.customName) reg.name = `${reg.side === 'france' ? 'Franse' : 'Britse'} ${nameOf(kind, reg.side)[1]} ${reg.id}`;
    return reg;
  }

  // ---- training: barracks and stable get a button per kind ----
  const BUILDING_FOR = { infantry: 'barracks', cavalry: 'stable' };
  const costOf = key => { const t = T[key], base = TRAINING[t.base].cost, c = {}; for (const k of ['food', 'wood', 'iron']) { const v = (base[k] || 0) + (t.extra?.[k] || 0); if (v) c[k] = v; } return c; };
  const costText = c => [c.food ? `${c.food} 🍞` : '', c.wood ? `${c.wood} 🪵` : '', c.iron ? `${c.iron} ⛏️` : ''].filter(Boolean).join(' · ');
  function trainTroop(key, b = selectedBuilding) {
    const t = T[key];
    if (!b || b.dead || !b.complete || b.side !== 'france' || b.type !== BUILDING_FOR[t.base] || !fields(key, 'france')) return false;
    if (t.max && strength('france', key) >= t.max) { statusEl.textContent = `Hooguit ${t.max} ${t.plural}.`; return false; }
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
  // Men of a kind in the field and in the queues.
  function strength(side, key) {
    let n = units.filter(u => !u.dead && u.side === side && u.troop === key).length;
    for (const b of buildings) if (!b.dead && b.side === side) for (const q of b.queue || []) if (q.troop === key) n++;
    return n;
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
      // The lance: deadly against foot out of square and men in flight, weaker against horse.
      if (s?.vsInfantry && victim.type !== 'cavalry' && (victim.routing || regOf(victim)?.formation !== 'square')) { damage *= s.vsInfantry; stats.lance++; }
      else if (s?.vsCavalry && victim.type === 'cavalry') damage *= s.vsCavalry;
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
  // Every regiment is of one kind, and carries its name.
  const baseCreate = createRegiment;
  createRegiment = function createRegimentOfOneKind(side, candidateUnits, name = null) {
    const { list, kind } = side === 'france' ? oneKind(side, candidateUnits || [], 'infantry', 12) : { list: candidateUnits, kind: null };
    const reg = baseCreate(side, list, name);
    if (reg && name) reg.customName = true;
    return settle(reg, 'infantry', kind);
  };
  if (typeof createCavalryRegimentV06 === 'function') {
    const baseCav = createCavalryRegimentV06;
    createCavalryRegimentV06 = function createCavalryRegimentOfOneKind(side, candidateUnits, name = null) {
      const { list, kind } = side === 'france' ? oneKind(side, candidateUnits || [], 'cavalry', 4) : { list: candidateUnits, kind: null };
      const reg = baseCav(side, list, name);
      if (reg && name) reg.customName = true;
      return settle(reg, 'cavalry', kind);
    };
  }

  // ---- buttons ----
  if (typeof renderDynamicActions === 'function' && typeof makeDynamicButton === 'function') {
    const base = renderDynamicActions;
    renderDynamicActions = function renderWithTroops(force = false) {
      base(force);
      const b = typeof selectedBuilding !== 'undefined' ? selectedBuilding : null;
      if (!b || b.dead || !b.complete || b.side !== 'france') return;
      for (const [key, t] of Object.entries(T)) {
        if (BUILDING_FOR[t.base] !== b.type || !fields(key, 'france') || actionsEl.querySelector(`[data-action="train-${key}"]`)) continue;
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
      const [label, plural] = nameOf(key, sel[0].side);
      const det = typeof selectionDetailsEl !== 'undefined' ? selectionDetailsEl : document.getElementById('selectionDetails');
      if (det && !det.textContent.includes(label)) det.textContent = `${det.textContent} · ${plural}: ${T[key].pro}; ${T[key].con}`;
    }
    return r;
  };

  // Sappers speed up their regiment's spade work: 1 + work x their share.
  function workFactor(reg) {
    const k = T.sapper; if (!k?.work || !reg) return 1;
    const m = regimentMembers(reg).filter(u => !u.dead && u.type === 'infantry');
    return m.length ? 1 + k.work * m.filter(u => u.troop === 'sapper').length / m.length : 1;
  }

  root.__TROOPS_V1__ = Object.freeze({ version: '1.2', kinds: T, applyTroop, setTroop, trainTroop, costOf, troopOf, nameOf, workFactor, strength, kindOf, mainKind, stats: () => ({ ...stats,
    french: Object.fromEntries(Object.keys(T).map(k => [k, units.filter(u => !u.dead && u.side === 'france' && u.troop === k).length])) }) });
})(window);
