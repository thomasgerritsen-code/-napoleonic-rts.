'use strict';
// ---------- v1.4.3: front ordering and reserve support ----------
// Keeps attacking regiments in a stable lateral order and turns the held regiment
// into an active reserve that shadows the weakest front sector without per-frame work.

(() => {
  if (typeof aiAttack !== 'function' || typeof aiFlank !== 'function' || typeof aiRegCenter !== 'function') return;

  const RESERVE_BACK_NORMAL = 215;
  const RESERVE_BACK_PRESSURED = 125;
  const WEAK_FRONT_THRESHOLD = 0.52;
  const FRONT_SPACING = 138;
  const FLANK_SPACING = 134;

  const stats = {
    attackCalls: 0,
    flankCalls: 0,
    orderedFronts: 0,
    reserveSelections: 0,
    reserveSupports: 0,
    pressuredSupports: 0,
    lastReserveId: null,
    lastWeakFrontId: null,
    lastWeakFrontCondition: null
  };

  function activeMembers(reg) {
    try { return regimentMembers(reg).filter(u => u && !u.dead && !u.routing); }
    catch { return []; }
  }

  function regimentCondition(reg) {
    const members = activeMembers(reg);
    if (!members.length) return 0;
    let total = 0;
    for (const u of members) {
      const hp = Math.max(0, Math.min(1, (u.hp ?? 0) / Math.max(1, u.maxHp ?? 1)));
      const morale = Math.max(0, Math.min(1, (u.morale ?? 100) / 100));
      total += hp * 0.6 + morale * 0.4;
    }
    return total / members.length;
  }

  function lateralCoordinate(reg, origin, d) {
    const c = aiRegCenter(reg);
    const rx = c.x - origin.x;
    const ry = c.y - origin.y;
    return -rx * d.y + ry * d.x;
  }

  function stableFrontOrder(regs, origin, d) {
    const ordered = regs.slice().sort((a, b) => {
      const lateralDelta = lateralCoordinate(a, origin, d) - lateralCoordinate(b, origin, d);
      if (Math.abs(lateralDelta) > 1) return lateralDelta;
      return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
    });
    if (ordered.length > 1) stats.orderedFronts++;
    return ordered;
  }

  function chooseFreshReserve(regs) {
    if (!Array.isArray(regs) || regs.length < 3) return null;
    let best = null;
    for (const reg of regs) {
      if (!reg || reg.destroyed) continue;
      const condition = regimentCondition(reg);
      if (!best || condition > best.condition + 0.02 ||
          (Math.abs(condition - best.condition) <= 0.02 && String(reg.id).localeCompare(String(best.reg.id)) < 0)) {
        best = { reg, condition };
      }
    }
    if (best) {
      stats.reserveSelections++;
      stats.lastReserveId = best.reg.id;
    }
    return best?.reg ?? null;
  }

  function weakestFrontRegiment(regs) {
    let weakest = null;
    for (const reg of regs) {
      const condition = regimentCondition(reg);
      if (!weakest || condition < weakest.condition) weakest = { reg, condition };
    }
    stats.lastWeakFrontId = weakest?.reg?.id ?? null;
    stats.lastWeakFrontCondition = weakest ? weakest.condition : null;
    return weakest;
  }

  const baseAttack = aiAttack;
  aiAttack = function aiAttackV143(regs, tc, target) {
    stats.attackCalls++;
    if (!Array.isArray(regs) || regs.length < 3 || !target) return baseAttack(regs, tc, target);

    const origin = tc || aiRegCenter(regs[0]);
    const d = aiDirection(origin, target);
    const reserve = chooseFreshReserve(regs);
    if (!reserve) return baseAttack(regs, tc, target);

    const lineRegs = stableFrontOrder(regs.filter(r => r !== reserve), target, d);
    AI_COMMANDER_V1.reserveRegimentId = reserve.id;

    lineRegs.forEach((reg, index) => {
      const lateral = (index - (lineRegs.length - 1) / 2) * FRONT_SPACING;
      aiOrderReg(reg, aiOffset(target, d, -145, lateral), 'line', d.angle);
    });

    const weak = weakestFrontRegiment(lineRegs);
    const weakCenter = weak?.reg ? aiRegCenter(weak.reg) : target;
    const pressured = Boolean(weak && weak.condition < WEAK_FRONT_THRESHOLD);
    const back = pressured ? RESERVE_BACK_PRESSURED : RESERVE_BACK_NORMAL;
    const support = {
      x: weakCenter.x - d.x * back,
      y: weakCenter.y - d.y * back
    };
    aiOrderReg(reserve, support, pressured ? 'line' : 'column', d.angle);
    stats.reserveSupports++;
    if (pressured) stats.pressuredSupports++;

    const cav = livingUnits('britain').filter(u => u.type === 'cavalry' && !u.routing);
    if (cav.length) {
      const p = aiOffset(target, d, -35, AI_COMMANDER_V1.flankSide * 280);
      commandLooseFormation(cav, p.x, p.y, 'column');
      cav.forEach(u => u.chargeTimer = Math.max(u.chargeTimer || 0, 5));
    }
    const art = livingUnits('britain').filter(u => u.type === 'artillery' && !u.routing);
    if (art.length) {
      const p = aiOffset(target, d, -390, -AI_COMMANDER_V1.flankSide * 80);
      commandLooseFormation(art, p.x, p.y, 'line');
    }
    aiPlan = `Commandant: aanvalsgolf ${Math.max(1, AI_COMMANDER_V1.wave)} · reserve ondersteunt ${pressured ? 'zwakke sector' : 'frontlijn'}`;
  };

  const baseFlank = aiFlank;
  aiFlank = function aiFlankV143(regs, tc, target) {
    stats.flankCalls++;
    if (!Array.isArray(regs) || regs.length < 2 || !target) return baseFlank(regs, tc, target);

    const origin = tc || aiRegCenter(regs[0]);
    const d = aiDirection(origin, target);
    const reserveId = AI_COMMANDER_V1.reserveRegimentId;
    let reserve = reserveId ? regs.find(r => r.id === reserveId) : null;
    if (!reserve && regs.length >= 3) reserve = chooseFreshReserve(regs);
    const main = reserve ? regs.filter(r => r !== reserve) : regs;
    const orderedMain = stableFrontOrder(main, target, d);

    orderedMain.forEach((reg, index) => {
      const lateral = (index - (orderedMain.length - 1) / 2) * FLANK_SPACING;
      aiOrderReg(reg, aiOffset(target, d, -165, lateral), 'line', d.angle);
    });
    if (reserve) aiOrderReg(reserve, aiOffset(target, d, -250, AI_COMMANDER_V1.flankSide * 330), 'column', d.angle + AI_COMMANDER_V1.flankSide * .55);

    const cav = livingUnits('britain').filter(u => u.type === 'cavalry' && !u.routing);
    if (cav.length) {
      const p = aiOffset(target, d, 35, AI_COMMANDER_V1.flankSide * 390);
      commandLooseFormation(cav, p.x, p.y, 'column');
      cav.forEach(u => u.chargeTimer = Math.max(u.chargeTimer || 0, 8));
    }
    aiPlan = `Commandant: ${AI_COMMANDER_V1.flankSide > 0 ? 'rechter' : 'linker'} flankaanval${reserve ? ' met verse reserve' : ''}`;
  };

  window.__AI_FRONT_RESERVE_V143__ = Object.freeze({
    stats: () => ({ ...stats }),
    regimentCondition,
    chooseFreshReserve,
    stableFrontOrder: (regs, origin, d) => stableFrontOrder(regs, origin, d),
    config: Object.freeze({
      reserveBackNormal: RESERVE_BACK_NORMAL,
      reserveBackPressured: RESERVE_BACK_PRESSURED,
      weakFrontThreshold: WEAK_FRONT_THRESHOLD,
      frontSpacing: FRONT_SPACING,
      flankSpacing: FLANK_SPACING
    })
  });

  if (window.NRTS?.subsystems?.register) {
    NRTS.subsystems.register('ai-front-reserve-v143', window.__AI_FRONT_RESERVE_V143__, {
      phase: 'gameplay-v143',
      legacyBridge: false,
      responsibility: 'stable lateral front assignment, fresh reserve selection and weak-sector reserve support'
    });
  }
})();
