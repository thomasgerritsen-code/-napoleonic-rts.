'use strict';
// ---------- AI campaign pressure v1 (open map: ?view=iso) ----------
// The British commander (src/ai/tactics.js) attacked once and then waited for a
// second full regiment that its economy never produced: workers stayed on food
// (wood ran dry), the queue waited on a stable it could not afford, and loose
// infantry never made up a regiment. This layer keeps the AI's own commander and
// its MASS -> ADVANCE -> ATTACK -> FLANK cycle, and adds:
//   - attack waves on a clock (first after firstWave seconds, then every
//     interval +- jitter), with one regiment or more;
//   - a fight that lasts while it goes well (up to maxAttack seconds), then a
//     regroup at home and the next wave;
//   - engaged regiments keep their line instead of re-forming for every small
//     shift the commander orders;
//   - workers moved between food and wood to what the AI is short of;
//   - infantry, officers and drummers trained while it saves for a building,
//     so loose men make up regiments; farmers put on the grain fields it builds;
//   - a retreat only when morale is low and the local fight is being lost;
//   - routed men sent home - over a bridge when home lies across the river -
//     instead of standing among the enemy, and rallied there (both sides);
//   - an undefended town center besieged until it falls, and buildings that can
//     be shot at again (the spatial target search of large-army-v1 skipped them,
//     so a headquarters - and with it the battle - could never be taken).
// Both sides get the last one.
// Only on the open map (NRTS_CONFIG.ai.pressure); the normal game is unchanged.
(function installCampaignPressureV1(global) {
  const cfg = global.NRTS_CONFIG?.ai?.pressure;
  if (!cfg || typeof aiChooseState !== 'function' || typeof AI_COMMANDER_V1 === 'undefined') return;
  const C = AI_COMMANDER_V1;
  const ATTACKING = new Set(['MASS', 'ADVANCE', 'ATTACK', 'FLANK']);
  const freshState = () => ({ losingSince: null, nextWaveAt: cfg.firstWave, waves: 0, attackStarted: null,
    rebalanced: 0, trained: 0, lastBalanceAt: -99, farmers: 0, sentHome: 0, heldOrders: 0, keptLines: 0, rallied: 0, log: [] });
  const state = freshState();
  // These function wrappers are installed once for the page, not once per
  // battle. Keep them separate from the attack clocks and economy counters.
  let buildingTargetsInstalled = false, steadyLinesInstalled = false;
  global.NRTS.events.on('game:reset', () => Object.assign(state, freshState()));
  const jitter = () => (Math.random() * 2 - 1) * cfg.jitter;
  const fighting = side => livingUnits(side).filter(u => u.type !== 'worker' && !u.routing);
  const armySize = regs => regs.reduce((n, r) => n + regimentMembers(r).filter(u => !u.dead && !u.routing).length, 0);
  // Strength of each side near a point (the battle the wave is fighting).
  const localStrength = (side, p, r) => fighting(side).filter(u => Math.hypot(u.x - p.x, u.y - p.y) < r)
    .reduce((s, u) => s + (u.type === 'artillery' ? 3 : u.type === 'cavalry' ? 1.8 : 1) * Math.max(0, u.hp / Math.max(1, u.maxHp)), 0);
  function note(text) { state.log.push({ t: Math.round(elapsed), text }); if (state.log.length > 40) state.log.shift(); }
  function scheduleNext(from) { state.nextWaveAt = from + cfg.interval + jitter(); note(`volgende golf om ${Math.round(state.nextWaveAt)}s`); }

  // A besieged headquarters: aim short of its middle, so the line forms within
  // musket range of its walls (the commander stands its line 145 back from the aim).
  if (typeof aiStrategicTarget === 'function') {
    const baseTarget = aiStrategicTarget;
    aiStrategicTarget = function aiStrategicTargetInReach() {
      const t = baseTarget();
      if (!t || t.kind !== 'towncenter') return t;
      const home = aiBritishTC() || { x: WORLD.width, y: t.y }, d = Math.hypot(home.x - t.x, home.y - t.y) || 1;
      return { ...t, x: t.x + (home.x - t.x) / d * 80, y: t.y + (home.y - t.y) / d * 80 };
    };
  }
  const baseChoose = aiChooseState;
  aiChooseState = function aiChooseStateWithPressure(regs) {
    const S = C.state, age = elapsed - C.stateSince;
    const own = aiSideStrength('britain'), enemy = aiSideStrength('france'), ratio = own / Math.max(1, enemy);
    const morale = aiMeanMorale(regs);
    // Defence of the base and a beaten army's retreat stay as the commander had them.
    if (aiBaseThreatened() && S !== 'RETREAT') return 'DEFEND';
    // Retreat only when spirits are low AND the fight on the spot is being lost:
    // a column turning its back on an enemy it is beating only gets shot down.
    if (morale < 37 && S !== 'RETREAT' && C.target) {
      const ours = localStrength('britain', C.target, 900), theirs = localStrength('france', C.target, 900);
      if (theirs > 0 && ours / theirs < 0.9) { C.retreatUntil = elapsed + 15; note(`terugtocht (${ours.toFixed(0)} tegen ${theirs.toFixed(0)})`); scheduleNext(elapsed); return 'RETREAT'; }
    }
    if (S === 'RETREAT') return elapsed < C.retreatUntil ? 'RETREAT' : 'REGROUP';
    if (S === 'REGROUP') return morale > 60 && age > 8 ? 'DEFEND' : 'REGROUP';
    if (S === 'DEFEND') {
      // Strong enough: at least minRatio of the enemy's army - or the wave is
      // already maxDelay late, and the pressure must come anyway.
      const late = elapsed >= state.nextWaveAt + cfg.maxDelay;
      const ready = regs.length >= 1 && armySize(regs) >= cfg.minWaveUnits && (ratio >= cfg.minRatio || late);
      if (elapsed >= state.nextWaveAt && ready) {
        state.waves++; state.attackStarted = null;
        note(`aanvalsgolf ${state.waves}: ${regs.length} regiment(en), ${armySize(regs)} man`);
        return 'MASS';
      }
      return 'DEFEND';
    }
    if (S === 'MASS') return age > 9 ? 'ADVANCE' : 'MASS';
    if (S === 'ADVANCE') {
      if (age <= 12 || !C.target) return 'ADVANCE';
      // Count only the regiments already on the march: new ones formed at home
      // follow as reinforcements and must not hold the assault back.
      const home = aiBritishTC(), out = regs.filter(r => { const p = aiRegCenter(r); return !home || Math.hypot(p.x - home.x, p.y - home.y) > 1500; });
      if (!out.length) return age > cfg.maxMarch ? 'REGROUP' : 'ADVANCE';
      const near = out.filter(r => { const p = aiRegCenter(r); return Math.hypot(p.x - C.target.x, p.y - C.target.y) <= 760; }).length;
      return near >= Math.ceil(out.length * 0.6) || (near && age > cfg.maxMarch) ? 'ATTACK' : 'ADVANCE';
    }
    if (S === 'ATTACK' || S === 'FLANK') {
      if (state.attackStarted === null) state.attackStarted = elapsed;
      const fightAge = elapsed - state.attackStarted, t = C.target;
      const ours = t ? localStrength('britain', t, 900) : 0, theirs = t ? localStrength('france', t, 900) : 0;
      // Break off when the fight is lost, has gone on long enough, or the army is spent.
      // Losing only counts once it has lasted: men who break often rally.
      if (theirs > 0 && ours / theirs < cfg.breakRatio) state.losingSince ??= elapsed; else state.losingSince = null;
      const losing = state.losingSince !== null && elapsed - state.losingSince > cfg.breakAfter && fightAge > cfg.minFight;
      // An undefended headquarters is besieged until it falls.
      const siege = t && t.kind === 'towncenter' && theirs < 1 && ours > 0;
      if ((fightAge > cfg.maxAttack && !siege) || losing || ratio < 0.45 || !regs.length) {
        note(`golf ${state.waves} afgebroken: ${losing ? 'verliest' : fightAge > cfg.maxAttack ? 'tijd' : 'uitgeput'} (${ours.toFixed(0)} tegen ${theirs.toFixed(0)})`);
        state.attackStarted = null; state.losingSince = null; scheduleNext(elapsed);
        return 'REGROUP';
      }
      // Cavalry swings round a flank now and then; then back to the main assault.
      if (S === 'ATTACK') return age > 18 && fighting('britain').some(u => u.type === 'cavalry') ? 'FLANK' : 'ATTACK';
      return age > 13 ? 'ATTACK' : 'FLANK';
    }
    return baseChoose(regs);
  };

  // ---- economy: workers to what is short, and recruits while saving ----
  function rebalanceWorkers() {
    if (elapsed - state.lastBalanceAt < 6) return;
    state.lastBalanceAt = elapsed;
    const e = economies.britain;
    const gatherers = livingUnits('britain').filter(u => u.type === 'worker' && u.task === 'gather' && u.preferredResourceType !== 'iron');
    if (gatherers.length < 2) return;
    const on = type => gatherers.filter(u => u.preferredResourceType === type);
    // Aim for wood workers in proportion to how short wood is against food.
    const want = e.wood < 150 && e.food > 400 ? 0.6 : e.food < 200 && e.wood > 400 ? 0.25 : 0.45;
    const wood = on('wood').length, target = Math.round(gatherers.length * want);
    const from = wood < target ? on('food') : wood > target + 1 ? on('wood') : [];
    const to = wood < target ? 'wood' : 'food';
    for (const u of from.filter(w => !w.carry).slice(0, Math.abs(target - wood))) {
      const r = nearestResource(to, u.x, u.y);
      if (r) { assignWorkerToResource(u, r); state.rebalanced++; }
    }
  }
  function trainWhileSaving() {
    if (!/^middelen verzamelen voor|reserves aanvullen/.test(aiPlan || '')) return;
    const free = t => freeUnits('britain', t).length;
    const queued = t => livingBuildings('britain').reduce((n, b) => n + (b.queue || []).filter(q => q.type === t).length, 0);
    const need = free('officer') + queued('officer') < 1 ? 'officer' : free('drummer') + queued('drummer') < 1 ? 'drummer'
      : free('infantry') + queued('infantry') < 12 ? 'infantry' : null;
    if (need && aiQueue(need, 'barracks')) { state.trained++; aiPlan = `${TYPES[need].label} trainen voor de volgende golf`; }
  }
  // Men who broke run for home: a routing man left standing where he broke
  // (his flight target on his own feet, in the middle of the enemy) is sent to
  // his town center; once there and out of danger he rallies and can be formed
  // into a new regiment. Both sides.
  function fleeHome() {
    for (const u of units) {
      if (u.dead || !u.routing || u.type === 'worker') continue;
      const home = livingBuildings(u.side).find(b => b.type === 'towncenter'); if (!home) continue;
      const dHome = Math.hypot(u.x - home.x, u.y - home.y);
      const foeWithin = r => fighting(u.side === 'france' ? 'britain' : 'france').some(e => Math.hypot(e.x - u.x, e.y - u.y) < r);
      // Stuck on the way (no path round a house or along a bank): a man who has
      // not got anywhere for a few seconds, out of musket shot, rallies where he is.
      const last = u.fleeLast, moved = last ? Math.hypot(u.x - last.x, u.y - last.y) : 99;
      u.fleeLast = { x: u.x, y: u.y, still: moved < 12 ? (last?.still || 0) + 1 : 0 };
      if (dHome < 420 || (u.fleeLast.still >= 3 && !foeWithin(300))) {
        if (!foeWithin(dHome < 420 ? 520 : 300)) { u.routing = false; u.morale = Math.max(u.morale || 0, 60); u.targetX = u.x; u.targetY = u.y; u.fleeLast = null; state.rallied = (state.rallied || 0) + 1; }
        continue;
      }
      // Home lies across the river: over the nearest bridge first (a routed
      // man does not look for one himself and ends up against the bank).
      const bu = bankOf(u.x, u.y), bh = bankOf(home.x, home.y);
      if (bu && bh && bu !== bh) {
        const br = bridgeFor(u, home);
        if (br) {
          const near = { x: br.x + bu * (br.length / 2 + 50), y: br.y }, far = { x: br.x - bu * (br.length / 2 + 160), y: br.y };
          const t = Math.hypot(u.x - near.x, u.y - near.y) > 60 && Math.abs(u.x - br.x) > br.length / 2 ? near : far;
          u.targetX = t.x; u.targetY = t.y; u.fleeBridge = br.id;
          continue;
        }
      }
      if (u.fleeBridge || Math.hypot(u.targetX - u.x, u.targetY - u.y) < 80) {
        u.fleeBridge = null;
        u.targetX = home.x + (hash01(u.id) - 0.5) * 300; u.targetY = home.y + (hash01(u.id * 7) - 0.5) * 300;
        state.sentHome = (state.sentHome || 0) + 1;
      }
    }
  }
  // Which side of the river a point lies on (-1 west, 1 east), from the river's
  // centreline; 0 when there is no river.
  function bankOf(x, y) {
    const pts = typeof RIVER_SMOOTH_POINTS_V296 !== 'undefined' ? RIVER_SMOOTH_POINTS_V296 : null;
    if (!pts || !pts.length) return 0;
    let best = pts[0], bd = Infinity;
    for (const p of pts) { const d = Math.abs(p.y - y); if (d < bd) { bd = d; best = p; } }
    return x < best.x ? -1 : 1;
  }
  function bridgeFor(u, home) {
    const list = typeof WATER_CROSSINGS_V067 !== 'undefined' ? WATER_CROSSINGS_V067 : [];
    let best = null, bd = Infinity;
    for (const b of list) { const d = Math.hypot(u.x - b.x, u.y - b.y) + Math.hypot(home.x - b.x, home.y - b.y); if (d < bd) { bd = d; best = b; } }
    return best;
  }
  const hash01 = n => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };
  // Farmers onto the grain fields (three each) while food is short.
  function staffFarms() {
    const F = global.__FARMING_V314__; if (!F || economies.britain.food > 600) return;
    const fields = buildings.filter(b => !b.dead && b.complete && b.type === 'farm' && b.side === 'britain');
    for (const f of fields) {
      const working = units.filter(u => !u.dead && u.farmId === f.id && (u.task === 'farm' || u.task === 'farm-deliver')).length;
      const spare = livingUnits('britain').filter(u => u.type === 'worker' && !u.carry && (!u.task || (u.task === 'gather' && u.preferredResourceType === 'food')))
        .sort((a, b) => Math.hypot(a.x - f.x, a.y - f.y) - Math.hypot(b.x - f.x, b.y - f.y));
      for (const u of spare.slice(0, Math.max(0, 3 - working))) if (F.assignWorker(u, f)) state.farmers = (state.farmers || 0) + 1;
    }
  }
  // Buildings as targets again: when no enemy soldier is in reach, the nearest
  // enemy building in reach (complete, in sight) is. Installed on the first AI
  // tick, after every later script has put its own target search in place.
  function installBuildingTargets() {
    if (buildingTargetsInstalled || typeof nearestEnemyEntity !== 'function') return;
    buildingTargetsInstalled = true;
    const baseNearest = nearestEnemyEntity;
    nearestEnemyEntity = function nearestEnemyEntityWithBuildings(unit, maxRange) {
      const hit = baseNearest(unit, maxRange);
      if (hit || !unit || unit.type === 'worker') return hit;
      // Measured to the walls, not the middle: a big headquarters keeps men
      // further from its middle than a musket carries.
      let best = null, bd = maxRange * maxRange;
      for (const b of buildings) {
        if (b.dead || !b.complete || b.side === unit.side) continue;
        const dx = Math.max(0, Math.abs(b.x - unit.x) - (b.w || 0) / 2), dy = Math.max(0, Math.abs(b.y - unit.y) - (b.h || 0) / 2), d2 = dx * dx + dy * dy;
        if (d2 < bd && (typeof lineOfSight !== 'function' || lineOfSight(unit, b))) { bd = d2; best = b; }
      }
      return best;
    };
  }
  // In contact a regiment keeps its line: the commander re-issues positions every
  // few seconds, and each small shift sent the men into march column and back.
  // An engaged regiment ignores shifts of less than holdShift and moves larger
  // distances in line - except in a retreat.
  function installSteadyLines() {
    if (steadyLinesInstalled || typeof orderGroupPathV06 !== 'function') return;
    steadyLinesInstalled = true;
    const baseOrder = orderGroupPathV06;
    orderGroupPathV06 = function orderGroupPathSteady(reg, x, y, formation, facing) {
      if (reg && !reg.destroyed && reg.side === 'britain' && C.state !== 'RETREAT') {
        const m = regimentMembers(reg);
        if (m.length) {
          const c = centroid(m);
          const engaged = fighting('france').some(e => Math.hypot(e.x - c.x, e.y - c.y) < cfg.contactRange);
          if (engaged) {
            if (Math.hypot(x - c.x, y - c.y) < cfg.holdShift) { state.heldOrders = (state.heldOrders || 0) + 1; return false; }
            if (formation === 'column' && reg.formation !== 'column') { formation = reg.formation === 'square' ? 'square' : 'line'; state.keptLines = (state.keptLines || 0) + 1; }
          }
        }
      }
      return baseOrder(reg, x, y, formation, facing);
    };
  }
  const baseDevelop = aiDevelop;
  aiDevelop = function aiDevelopWithPressure() {
    installBuildingTargets();
    installSteadyLines();
    baseDevelop();
    if (gameOver) return;
    fleeHome();
    staffFarms();
    rebalanceWorkers();
    trainWhileSaving();
    if (typeof aiTryFormRegiment === 'function') aiTryFormRegiment();
  };

  global.__AI_PRESSURE_V1__ = Object.freeze({
    version: 'ai-campaign-pressure-v1', config: cfg,
    stats: () => ({ waves: state.waves, nextWaveAt: Math.round(state.nextWaveAt), state: C.state, rebalanced: state.rebalanced,
      trained: state.trained, farmers: state.farmers || 0, sentHome: state.sentHome || 0, heldOrders: state.heldOrders || 0, keptLines: state.keptLines || 0, rallied: state.rallied || 0, buildingTargets: buildingTargetsInstalled, log: state.log.slice() })
  });
})(window);
