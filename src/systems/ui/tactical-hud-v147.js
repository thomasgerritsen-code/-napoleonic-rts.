'use strict';
// Tactical HUD v147: clearer movement/readiness feedback with one order-state scan per regiment.
(function installTacticalHudV147(global) {
  if (typeof global.selectionTacticalState !== 'function' ||
      typeof global.regimentOrderState !== 'function' ||
      typeof global.regimentTacticalMetrics !== 'function') return;

  const baseOrderState = global.regimentOrderState;
  const baseMetrics = global.regimentTacticalMetrics;
  const baseReformLabel = global.regimentReformLabel;

  function commandState(reg) {
    const members = regimentMembers(reg).filter(u => !u.dead);
    return {
      officerAlive: members.some(u => u.id === reg.officerId),
      drummerAlive: members.some(u => u.id === reg.drummerId)
    };
  }

  function selectionTacticalStateV147(regs = selectedRegiments()) {
    if (!regs.length) {
      return {
        state: 'neutral', strength: 0, morale: 0, routing: 0, reforming: 0,
        moving: 0, averageDistance: 0, pressureReasons: [], orderStates: [],
        officerLosses: 0, drummerLosses: 0
      };
    }

    const metrics = regs.map(baseMetrics);
    const orderStates = regs.map(baseOrderState);
    const commands = regs.map(commandState);
    const totalHp = metrics.reduce((sum, m) => sum + m.hp, 0);
    const totalMaxHp = metrics.reduce((sum, m) => sum + m.maxHp, 0);
    const totalMembers = metrics.reduce((sum, m) => sum + m.members, 0);
    const strength = totalMaxHp ? Math.round((totalHp / totalMaxHp) * 100) : 0;
    const morale = totalMembers
      ? Math.round(metrics.reduce((sum, m) => sum + (m.morale * m.members), 0) / totalMembers)
      : Math.round(metrics.reduce((sum, m) => sum + m.morale, 0) / metrics.length);
    const routing = metrics.reduce((sum, m) => sum + m.routing, 0);
    const reforming = regs.filter(reg => reg?.postCrossingReformV1322).length;
    const movingStates = orderStates.filter(order => order.moving);
    const moving = movingStates.length;
    const averageDistance = moving
      ? Math.round(movingStates.reduce((sum, order) => sum + order.distance, 0) / moving)
      : 0;
    const officerLosses = commands.filter(c => !c.officerAlive).length;
    const drummerLosses = commands.filter(c => !c.drummerAlive).length;

    const pressureReasons = [];
    if (strength < 55) pressureReasons.push('lage sterkte');
    if (morale < 45) pressureReasons.push('lage morale');
    if (routing) pressureReasons.push(`${routing} op de vlucht`);
    if (officerLosses) pressureReasons.push(`${officerLosses} officier${officerLosses > 1 ? 'en' : ''} verloren`);

    let state = 'steady';
    if (pressureReasons.length) state = 'pressured';
    else if (reforming) state = 'reforming';
    else if (moving) state = 'moving';

    return {
      state, strength, morale, routing, reforming, moving, averageDistance,
      pressureReasons, orderStates, officerLosses, drummerLosses
    };
  }

  function regimentOrderLabelV147(reg, order = baseOrderState(reg)) {
    const formation = formationLabel(reg.formation || 'line');
    const reform = baseReformLabel(reg);
    if (!order.moving) return `${formation} · ${reform || 'positie ingenomen'}`;
    return `${formation} · ${reform ? `${reform} · ` : ''}marcheert · ${Math.max(1, Math.round(order.distance))} m te gaan`;
  }

  function commandLossSummary(tactical) {
    const parts = [];
    if (tactical.officerLosses) parts.push(`${tactical.officerLosses} zonder officier`);
    if (tactical.drummerLosses) parts.push(`${tactical.drummerLosses} zonder drummer`);
    return parts.length ? ` · commando: ${parts.join(', ')}` : '';
  }

  function selectionRegimentSummaryV147(regs = selectedRegiments(), tactical = selectionTacticalStateV147(regs)) {
    if (regs.length === 1) {
      const reg = regs[0];
      const members = regimentMembers(reg).filter(u => !u.dead);
      const officerAlive = members.some(u => u.id === reg.officerId);
      const drummerAlive = members.some(u => u.id === reg.drummerId);
      const pressure = tactical.state === 'pressured' && tactical.pressureReasons.length
        ? ` · onder druk (${tactical.pressureReasons.join(', ')})`
        : '';
      return `${reg.name} · ${members.filter(u => u.type === 'infantry').length} musketiers · O:${officerAlive ? '✓' : '✗'} D:${drummerAlive ? '✓' : '✗'} · sterkte ${tactical.strength}% · morale ${tactical.morale}%${pressure} · ${regimentOrderLabelV147(reg, tactical.orderStates[0])}`;
    }

    if (regs.length > 1) {
      const formations = [...new Set(regs.map(reg => formationLabel(reg.formation || 'line')))];
      const formationText = formations.length === 1 ? formations[0] : 'gemengde formaties';
      const pressure = tactical.state === 'pressured' && tactical.pressureReasons.length
        ? ` · onder druk (${tactical.pressureReasons.join(', ')})`
        : '';
      const reformText = tactical.reforming ? ` · ${tactical.reforming} hergroepeert` : '';
      const moveText = tactical.moving
        ? `${tactical.moving}/${regs.length} marcheert · gem. ${Math.max(1, tactical.averageDistance)} m te gaan`
        : 'positie ingenomen';
      return `${regs.length} regimenten geselecteerd · ${formationText} · sterkte ${tactical.strength}% · morale ${tactical.morale}%${pressure}${commandLossSummary(tactical)}${reformText} · ${moveText}`;
    }

    return null;
  }

  global.selectionTacticalState = selectionTacticalStateV147;
  global.regimentOrderLabel = regimentOrderLabelV147;
  global.selectionRegimentSummaryV144 = selectionRegimentSummaryV147;
  global.selectionRegimentSummaryV147 = selectionRegimentSummaryV147;
  global.__TACTICAL_HUD_V147__ = Object.freeze({
    selectionTacticalState: selectionTacticalStateV147,
    regimentOrderLabel: regimentOrderLabelV147,
    selectionRegimentSummary: selectionRegimentSummaryV147
  });
})(window);
