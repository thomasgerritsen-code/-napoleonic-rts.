'use strict';
// Quick regiments (open map only, NRTS_CONFIG.quickRegiment): one button forms
// a regiment from what is at hand. With loose soldiers selected it takes them
// and fills up with the nearest free musketeers (to 12, or up to the maximum
// if more are selected), an officer and a drummer; with the barracks selected
// it gathers the free men around it. What is missing is named, and the
// barracks can train it straight away; with 'Auto-regiment' on, a barracks
// forms a regiment by itself at its rally point whenever enough men are free.
(function installQuickRegimentV1(root) {
  const cfg = root.NRTS_CONFIG?.quickRegiment;
  if (!cfg) return;
  if (document.readyState !== 'complete') { addEventListener('load', () => installQuickRegimentV1(root), { once: true }); return; }
  if (root.__QUICK_REGIMENT_V1__ || typeof createRegiment !== 'function') return;
  const MAX = root.NRTS_CONFIG?.regimentOrders?.maxInfantry || 36;
  const stats = { formed: 0, auto: 0, trained: 0 };
  const free = (side, type) => units.filter(u => !u.dead && !u.routing && !u.regimentId && u.side === side && u.type === type);
  const byDistance = (list, p) => list.slice().sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
  const barracksSelected = () => (typeof selectedBuilding !== 'undefined' && selectedBuilding && !selectedBuilding.dead &&
    selectedBuilding.side === 'france' && selectedBuilding.type === 'barracks' && selectedBuilding.complete) ? selectedBuilding : null;
  // One kind to a regiment (troops-v1): the chosen men's kind, else the kind most
  // free men around are; '' is the line.
  const kindOf = u => root.__TROOPS_V1__?.kindOf(u) ?? '';
  const kindName = (kind, n) => !kind ? `musketier${n === 1 ? '' : 's'}` : (n === 1 ? root.__TROOPS_V1__.kinds[kind].label : root.__TROOPS_V1__.kinds[kind].plural).toLowerCase();
  // Who would make up the regiment now, around a point (and with the given men first).
  function plan(side, anchor, chosen = [], reach = cfg.reach) {
    const near = list => byDistance(list, anchor).filter(u => Math.hypot(u.x - anchor.x, u.y - anchor.y) <= reach);
    const chosenInf = chosen.filter(u => u.type === 'infantry' && !u.regimentId && !u.dead && !u.routing);
    const around = near(free(side, 'infantry'));
    const kind = root.__TROOPS_V1__ ? root.__TROOPS_V1__.mainKind(chosenInf.length ? chosenInf : around) : '';
    const pickInf = chosenInf.filter(u => kindOf(u) === kind);
    const want = Math.max(12, Math.min(MAX, pickInf.length));
    const inf = [...pickInf, ...around.filter(u => kindOf(u) === kind && !pickInf.includes(u))].slice(0, want);
    const officer = chosen.find(u => officerCanLead(u, 'infantry') && u.side === side && !u.dead && !u.routing && !u.regimentId) || near(free(side, 'officer').filter(u => officerCanLead(u, 'infantry')))[0] || null;
    const drummer = chosen.find(u => u.type === 'drummer' && !u.regimentId) || near(free(side, 'drummer'))[0] || null;
    const missing = { infantry: Math.max(0, 12 - inf.length), officer: officer ? 0 : 1, drummer: drummer ? 0 : 1 };
    return { inf, officer, drummer, missing, kind, ok: !missing.infantry && !missing.officer && !missing.drummer };
  }
  const enemyFacing = (side, p) => {
    const foe = buildings.find(b => !b.dead && b.side !== side && b.type === 'towncenter');
    return foe ? Math.atan2(foe.y - p.y, foe.x - p.x) : (side === 'france' ? 0 : Math.PI);
  };
  function form(side, p, where) {
    const reg = createRegiment(side, [...p.inf, p.officer, p.drummer]);
    if (!reg) return null;
    const at = where || centroid(regimentMembers(reg));
    arrangeFacingRegimentV146(reg, at.x, at.y, 'line', enemyFacing(side, at));
    stats.formed++;
    return reg;
  }
  function missingText(m, kind = '') {
    return [m.infantry ? `${m.infantry} ${kindName(kind, m.infantry)}` : '', m.officer ? 'een officier te voet' : '', m.drummer ? 'een tamboer' : ''].filter(Boolean).join(', ');
  }
  function context() {
    const b = barracksSelected();
    if (b) return { anchor: { x: b.rallyX ?? b.x, y: b.rallyY ?? (b.y + b.h) }, chosen: [], barracks: b, reach: cfg.barracksReach };
    const sel = [...selectedUnits].filter(u => !u.dead && u.side === 'france' && !u.regimentId && ['infantry', 'officer', 'drummer'].includes(u.type) && (u.type !== 'officer' || officerCanLead(u, 'infantry')));
    if (!sel.length) return null;
    return { anchor: centroid(sel), chosen: sel, barracks: null, reach: cfg.reach };
  }
  function quickRegiment() {
    const c = context(); if (!c) return null;
    const p = plan('france', c.anchor, c.chosen, c.reach);
    if (!p.ok) {
      statusEl.textContent = `Nog nodig voor een regiment: ${missingText(p.missing, p.kind)}. ${c.barracks ? 'Tik "Train ontbrekende".' : 'Train ze in de kazerne.'}`;
      return null;
    }
    const reg = form('france', p, c.barracks ? c.anchor : null);
    if (reg) {
      selectedUnits.clear(); if (typeof selectedBuilding !== 'undefined') selectedBuilding = null;
      selectWholeRegiment(reg);
      statusEl.textContent = `${reg.name} gevormd: ${p.inf.length} ${kindName(p.kind, p.inf.length)}, officier en tamboer.`;
      actionSignature = ''; updateHud(true);
    }
    return reg;
  }
  function trainMissing() {
    const b = barracksSelected(); if (!b) return 0;
    const p = plan('france', { x: b.rallyX ?? b.x, y: b.rallyY ?? b.y }, [], cfg.barracksReach);
    // Men already queued count too.
    const queued = t => b.queue.filter(q => q.type === t && (t !== 'infantry' || (q.troop || '') === p.kind)).length;
    let n = 0;
    const order = [['officer', p.missing.officer - queued('officer')], ['drummer', p.missing.drummer - queued('drummer')], ['infantry', p.missing.infantry - queued('infantry')]];
    // Men of the regiment's own kind: grenadiers are made up with grenadiers.
    const train = type => type === 'infantry' && p.kind ? root.__TROOPS_V1__.trainTroop(p.kind, b) : queueUnitForBuilding('france', b, type);
    for (const [type, count] of order) for (let i = 0; i < count; i++) if (train(type)) n++;
    stats.trained += n;
    b.autoRegiment = true;
    statusEl.textContent = n ? `${n} man in opleiding; de kazerne vormt het regiment zodra ze klaar zijn (Auto-regiment aan).` : 'Niets te trainen (of niet genoeg grondstoffen / bevolkingsruimte).';
    actionSignature = ''; updateHud(true);
    return n;
  }
  // Auto-regiment: a barracks forms one by itself when enough men are free near it.
  let autoAt = 0;
  function autoForm() {
    if (elapsed < autoAt) return; autoAt = elapsed + 2;
    for (const b of buildings) {
      if (b.dead || !b.complete || b.type !== 'barracks' || (b.side !== 'france' && !root.__NRTS_HUMAN_BRITAIN__) || !b.autoRegiment) continue;
      const at = { x: b.rallyX ?? b.x, y: b.rallyY ?? (b.y + b.h) };
      const p = plan(b.side, at, [], cfg.barracksReach);
      if (!p.ok) continue;
      const reg = form(b.side, p, at);
      if (reg) { stats.auto++; statusEl.textContent = `${reg.name} gevormd bij de kazerne (Auto-regiment).`; actionSignature = ''; updateHud(true); }
    }
  }
  const baseUpdateBuildings = updateBuildings;
  updateBuildings = function updateBuildingsWithAutoRegiment(dt) { const r = baseUpdateBuildings(dt); autoForm(); return r; };

  // ---- buttons ----
  if (typeof renderDynamicActions === 'function' && typeof makeDynamicButton === 'function') {
    const base = renderDynamicActions;
    renderDynamicActions = function renderWithQuickRegiment(force = false) {
      base(force);
      const c = context(); if (!c) return;
      actionsEl.querySelector('[data-action="create-regiment"]')?.remove();
      const p = plan('france', c.anchor, c.chosen, c.reach);
      const small = `${p.inf.length}/12 · O${p.officer ? '✓' : '✗'} · T${p.drummer ? '✓' : '✗'}`;
      const id = c.barracks ? 'quick-regiment-barracks' : 'quick-regiment';
      if (!actionsEl.querySelector(`[data-action="${id}"]`)) {
        const b = makeDynamicButton(id, `Regiment maken<br><small>${small}</small>`, !p.ok);
        b.title = p.ok ? 'Vormt een regiment: de gekozen mannen plus de dichtstbijzijnde vrije musketiers, een officier en een tamboer.' : `Nog nodig: ${missingText(p.missing, p.kind)}.`;
        actionsEl.appendChild(b);
      }
      if (c.barracks) {
        if (!p.ok && !actionsEl.querySelector('[data-action="train-missing"]')) {
          const b = makeDynamicButton('train-missing', `Train ontbrekende<br><small>${missingText(p.missing, p.kind)}</small>`);
          b.title = 'Zet wat ontbreekt in de wachtrij; het regiment vormt zich vanzelf zodra ze klaar zijn.';
          actionsEl.appendChild(b);
        }
        if (!actionsEl.querySelector('[data-action="auto-regiment"]')) {
          const on = !!c.barracks.autoRegiment;
          const b = makeDynamicButton('auto-regiment', `Auto-regiment<br><small>${on ? 'aan' : 'uit'}</small>`);
          if (on) b.classList.add('active');
          b.title = 'Aan: de kazerne vormt zelf een regiment bij het verzamelpunt zodra er 12 vrije musketiers, een officier en een tamboer zijn.';
          actionsEl.appendChild(b);
        }
      }
    };
    actionsEl.addEventListener('click', e => {
      const b = e.target.closest('button[data-action]'); if (!b || b.disabled) return;
      const a = b.dataset.action;
      if (a === 'quick-regiment' || a === 'quick-regiment-barracks') quickRegiment();
      else if (a === 'train-missing') trainMissing();
      else if (a === 'auto-regiment') { const k = barracksSelected(); if (k) { k.autoRegiment = !k.autoRegiment; statusEl.textContent = `Auto-regiment ${k.autoRegiment ? 'aan' : 'uit'}.`; actionSignature = ''; updateHud(true); } }
    });
  }
  // The signature-cached action bar must refresh as men come and go.
  let sigAt = 0;
  const baseHud = updateHud;
  updateHud = function updateHudWithQuickRegiment(...args) { if (elapsed - sigAt > 1 || elapsed < sigAt) { sigAt = elapsed; if (context()) actionSignature = ''; } return baseHud.apply(this, args); };

  root.__QUICK_REGIMENT_V1__ = Object.freeze({ version: '1.0', plan, quickRegiment, trainMissing, stats: () => ({ ...stats }) });
})(window);
