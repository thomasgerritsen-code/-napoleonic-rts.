'use strict';
// ---------- Architecture v2: stateful AI commander ----------
(function installAICommander(global) {
  const nrts = global.NRTS;
  if (!nrts) throw new Error('NRTS foundation runtime must load before AI commander.');

  const commander = {
    state: 'DEFEND',
    previousState: null,
    stateSince: 0,
    cycle: 0,
    attackWave: 0,
    lastTarget: null,
    flankSide: 1,
    retreatUntil: 0,
    regroupPoint: null,
    objective: null
  };

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }
  function britishTC() { return livingBuildings('britain').find(b => b.type === 'towncenter' && b.complete); }
  function frenchTC() { return livingBuildings('france').find(b => b.type === 'towncenter' && b.complete); }
  function combatUnits(side) { return livingUnits(side).filter(u => u.type !== 'worker' && !u.routing); }
  function britishRegiments() { return activeRegiments('britain').filter(r => regimentMembers(r).length); }

  function regimentStrength(reg) {
    const members = regimentMembers(reg).filter(u => !u.dead);
    if (!members.length) return 0;
    return members.reduce((sum, u) => sum + clamp01(u.hp / Math.max(1, u.maxHp)) * clamp01((u.morale || 0) / 100), 0);
  }

  function sideStrength(side) {
    return combatUnits(side).reduce((sum, u) => {
      const weight = u.type === 'artillery' ? 3.0 : u.type === 'cavalry' ? 1.8 : u.type === 'officer' ? 1.35 : 1;
      return sum + weight * clamp01(u.hp / Math.max(1, u.maxHp)) * clamp01((u.morale || 0) / 100);
    }, 0);
  }

  function meanRegimentMorale(regs) {
    let total = 0, count = 0;
    for (const reg of regs) for (const u of regimentMembers(reg)) {
      if (u.dead) continue;
      total += Number.isFinite(u.morale) ? u.morale : 100;
      count++;
    }
    return count ? total / count : 100;
  }

  function formationCenter(reg) {
    const members = regimentMembers(reg);
    return members.length ? centroid(members) : { x:0, y:0 };
  }

  function orderRegiment(reg, x, y, formation = 'line', facing = null) {
    if (!reg || reg.destroyed) return;
    const normalized = groupKindV06(reg) === 'cavalry' && formation === 'square' ? 'line' : formation;
    if (typeof orderGroupPathV06 === 'function') orderGroupPathV06(reg, x, y, normalized, facing);
    else arrangeRegiment(reg, x, y, normalized);
  }

  function direction(from, to) {
    const dx = to.x - from.x, dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x:dx / len, y:dy / len, angle:Math.atan2(dy, dx) };
  }

  function offsetAlong(point, dir, forward, lateral = 0) {
    return {
      x: point.x + dir.x * forward - dir.y * lateral,
      y: point.y + dir.y * forward + dir.x * lateral
    };
  }

  function strategicTarget() {
    const frenchRegs = activeRegiments('france').filter(r => regimentMembers(r).length);
    if (frenchRegs.length) {
      // Prefer the nearest meaningful French formation instead of chasing isolated soldiers.
      const base = britishTC() || {x:2600,y:900};
      let best = null;
      for (const reg of frenchRegs) {
        const c = formationCenter(reg);
        const d = Math.hypot(c.x-base.x, c.y-base.y);
        if (!best || d < best.d) best = { ...c, d, kind:'regiment', id:reg.id };
      }
      if (best) return best;
    }
    const tc = frenchTC();
    return tc ? { x:tc.x, y:tc.y, kind:'towncenter', id:tc.id } : { x:650, y:900, kind:'fallback' };
  }

  function threatenedBase() {
    const tc = britishTC();
    if (!tc) return false;
    return combatUnits('france').some(u => Math.hypot(u.x-tc.x, u.y-tc.y) < 620);
  }

  function transition(next) {
    if (commander.state === next) return;
    commander.previousState = commander.state;
    commander.state = next;
    commander.stateSince = elapsed;
    if (next === 'ATTACK') commander.attackWave++;
    if (next === 'FLANK') commander.flankSide *= -1;
  }

  function chooseState(regs) {
    const own = sideStrength('britain');
    const enemy = sideStrength('france');
    const ratio = own / Math.max(1, enemy);
    const morale = meanRegimentMorale(regs);
    const age = elapsed - commander.stateSince;

    if (threatenedBase() && commander.state !== 'RETREAT') return 'DEFEND';
    if ((morale < 37 || (ratio < .48 && regs.length)) && commander.state !== 'RETREAT') {
      commander.retreatUntil = elapsed + 15;
      return 'RETREAT';
    }
    if (commander.state === 'RETREAT') return elapsed < commander.retreatUntil ? 'RETREAT' : 'REGROUP';
    if (commander.state === 'REGROUP') {
      if (morale > 62 && age > 8) return regs.length >= 2 ? 'MASS' : 'DEFEND';
      return 'REGROUP';
    }

    if (elapsed < 35 && regs.length < 2) return 'DEFEND';
    if (regs.length < 2) return 'DEFEND';
    if (commander.state === 'DEFEND') return 'MASS';
    if (commander.state === 'MASS') return age > 9 ? 'ADVANCE' : 'MASS';
    if (commander.state === 'ADVANCE') return age > 12 ? 'ATTACK' : 'ADVANCE';
    if (commander.state === 'ATTACK') {
      if (age > 18 && combatUnits('britain').some(u => u.type === 'cavalry')) return 'FLANK';
      if (age > 28) return 'REGROUP';
      return 'ATTACK';
    }
    if (commander.state === 'FLANK') return age > 13 ? 'ATTACK' : 'FLANK';
    return 'DEFEND';
  }

  function defend(regs, tc, target) {
    if (!tc) return;
    const dir = direction(tc, target);
    regs.forEach((reg, i) => {
      const lateral = (i - (regs.length - 1) / 2) * 125;
      const p = offsetAlong(tc, dir, -230, lateral);
      orderRegiment(reg, p.x, p.y, 'line', dir.angle);
    });
    const art = livingUnits('britain').filter(u => u.type === 'artillery' && !u.routing);
    if (art.length) commandLooseFormation(art, tc.x - dir.x*120, tc.y - dir.y*120, 'line');
    aiPlan = `Commandant: verdedigt basis (${regs.length} regimenten)`;
  }

  function mass(regs, tc, target) {
    if (!tc) return;
    const dir = direction(tc, target);
    const rally = offsetAlong(tc, dir, 300, 0);
    commander.regroupPoint = rally;
    regs.forEach((reg, i) => {
      const p = offsetAlong(rally, dir, 0, (i - (regs.length-1)/2) * 115);
      orderRegiment(reg, p.x, p.y, 'column', dir.angle);
    });
    const art = livingUnits('britain').filter(u => u.type === 'artillery' && !u.routing);
    if (art.length) commandLooseFormation(art, rally.x-dir.x*170, rally.y-dir.y*170, 'line');
    aiPlan = `Commandant: leger verzamelt voor aanvalsgolf ${commander.attackWave + 1}`;
  }

  function advance(regs, tc, target) {
    const origin = tc || formationCenter(regs[0]);
    const dir = direction(origin, target);
    const staging = offsetAlong(target, dir, -520, 0);
    regs.forEach((reg, i) => {
      const p = offsetAlong(staging, dir, -i*45, (i-(regs.length-1)/2)*120);
      orderRegiment(reg, p.x, p.y, 'column', dir.angle);
    });
    const art = livingUnits('britain').filter(u => u.type === 'artillery' && !u.routing);
    if (art.length) {
      const gunLine = offsetAlong(target, dir, -690, 130);
      commandLooseFormation(art, gunLine.x, gunLine.y, 'line');
    }
    aiPlan = 'Commandant: leger rukt in marsorde op';
  }

  function attack(regs, tc, target) {
    const origin = tc || formationCenter(regs[0]);
    const dir = direction(origin, target);
    regs.forEach((reg, i) => {
      const lateral = (i-(regs.length-1)/2)*135;
      const p = offsetAlong(target, dir, -125 - (i%2)*35, lateral);
      orderRegiment(reg, p.x, p.y, 'line', dir.angle);
    });

    const cavalry = livingUnits('britain').filter(u => u.type === 'cavalry' && !u.routing);
    if (cavalry.length) {
      const flank = offsetAlong(target, dir, -40, commander.flankSide * 280);
      commandLooseFormation(cavalry, flank.x, flank.y, 'column');
      cavalry.forEach(u => { u.chargeTimer = Math.max(u.chargeTimer || 0, 5); });
    }

    const art = livingUnits('britain').filter(u => u.type === 'artillery' && !u.routing);
    if (art.length) {
      const gunLine = offsetAlong(target, dir, -390, -commander.flankSide*80);
      commandLooseFormation(art, gunLine.x, gunLine.y, 'line');
    }
    aiPlan = `Commandant: aanvalsgolf ${commander.attackWave || 1} in linie`;
  }

  function flank(regs, tc, target) {
    const origin = tc || formationCenter(regs[0]);
    const dir = direction(origin, target);
    const main = regs.slice(0, Math.max(1, regs.length-1));
    const reserve = regs.slice(main.length);
    main.forEach((reg, i) => {
      const p = offsetAlong(target, dir, -165, (i-(main.length-1)/2)*130);
      orderRegiment(reg, p.x, p.y, 'line', dir.angle);
    });
    reserve.forEach(reg => {
      const p = offsetAlong(target, dir, -250, commander.flankSide*330);
      orderRegiment(reg, p.x, p.y, 'column', dir.angle + commander.flankSide*.55);
    });
    const cavalry = livingUnits('britain').filter(u => u.type === 'cavalry' && !u.routing);
    if (cavalry.length) {
      const p = offsetAlong(target, dir, 35, commander.flankSide*390);
      commandLooseFormation(cavalry, p.x, p.y, 'column');
      cavalry.forEach(u => { u.chargeTimer = Math.max(u.chargeTimer || 0, 8); });
    }
    aiPlan = `Commandant: ${commander.flankSide > 0 ? 'rechter' : 'linker'} flankaanval`;
  }

  function retreat(regs, tc, target) {
    if (!tc) return;
    const dir = direction(target, tc);
    const safe = offsetAlong(tc, dir, -120, 0);
    regs.forEach((reg, i) => {
      const p = offsetAlong(safe, dir, i*35, (i-(regs.length-1)/2)*100);
      orderRegiment(reg, p.x, p.y, 'column', dir.angle);
    });
    const mobile = livingUnits('britain').filter(u => ['cavalry','artillery'].includes(u.type) && !u.routing);
    if (mobile.length) commandLooseFormation(mobile, safe.x, safe.y + 150, 'column');
    aiPlan = 'Commandant: gecontroleerde terugtocht';
  }

  function regroup(regs, tc, target) {
    if (!tc) return;
    const dir = direction(tc, target);
    const rally = offsetAlong(tc, dir, 175, 0);
    commander.regroupPoint = rally;
    regs.forEach((reg, i) => {
      const p = offsetAlong(rally, dir, 0, (i-(regs.length-1)/2)*115);
      orderRegiment(reg, p.x, p.y, 'line', dir.angle);
    });
    aiPlan = 'Commandant: regimenten hergroeperen en reserves aansluiten';
  }

  // Replace only the tactical order cycle. aiDevelop() remains independent and continues producing.
  aiMilitaryOrder = function aiMilitaryOrderCommanderV1() {
    if (gameOver) return;
    commander.cycle++;
    const regs = britishRegiments();
    if (!regs.length) {
      transition('DEFEND');
      aiPlan = 'Commandant: wacht op eerste gevechtsgereed regiment';
      return;
    }

    const tc = britishTC();
    const target = strategicTarget();
    commander.lastTarget = target;
    commander.objective = target.kind;
    transition(chooseState(regs));

    if (commander.state === 'DEFEND') defend(regs, tc, target);
    else if (commander.state === 'MASS') mass(regs, tc, target);
    else if (commander.state === 'ADVANCE') advance(regs, tc, target);
    else if (commander.state === 'ATTACK') attack(regs, tc, target);
    else if (commander.state === 'FLANK') flank(regs, tc, target);
    else if (commander.state === 'RETREAT') retreat(regs, tc, target);
    else regroup(regs, tc, target);
  };

  const api = Object.freeze({
    tick: () => aiMilitaryOrder(),
    state: () => ({ ...commander, ownStrength:sideStrength('britain'), enemyStrength:sideStrength('france') }),
    forceState: state => { if (['DEFEND','MASS','ADVANCE','ATTACK','FLANK','RETREAT','REGROUP'].includes(state)) transition(state); }
  });

  nrts.subsystems.register('ai-commander', api, {
    phase: 'architecture-v2',
    legacyBridge: false,
    responsibility: 'stateful strategic and tactical command; production remains independently owned by ai/production'
  });
  global.__AI_COMMANDER_V1__ = api;
})(window);
