'use strict';
// Tactical HUD v148: lightweight cohesion/arrival feedback with shared per-regiment snapshots.
(function installTacticalHudV148(global) {
  if (typeof global.regimentOrderState !== 'function' ||
      typeof global.regimentTacticalMetrics !== 'function' ||
      !global.__TACTICAL_HUD_V147__) return;

  const baseOrderState = global.regimentOrderState;
  const baseMetrics = global.regimentTacticalMetrics;
  const baseReformLabel = global.regimentReformLabel;

  function regimentSnapshot(reg) {
    const members = regimentMembers(reg).filter(u => !u.dead);
    return {
      reg,
      members,
      infantry: members.filter(u => u.type === 'infantry').length,
      officerAlive: members.some(u => u.id === reg.officerId),
      drummerAlive: members.some(u => u.id === reg.drummerId),
      metrics: baseMetrics(reg),
      order: baseOrderState(reg)
    };
  }

  function selectionTacticalStateV148(regs = selectedRegiments()) {
    if (!regs.length) {
      return {
        state: 'neutral', strength: 0, morale: 0, routing: 0, reforming: 0,
        moving: 0, arrived: 0, averageDistance: 0, distanceSpread: 0,
        cohesionState: 'steady', pressureReasons: [], orderStates: [], snapshots: [],
        officerLosses: 0, drummerLosses: 0
      };
    }

    const snapshots = regs.map(regimentSnapshot);
    const metrics = snapshots.map(s => s.metrics);
    const orderStates = snapshots.map(s => s.order);
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
    const arrived = regs.length - moving;
    const averageDistance = moving
      ? Math.round(movingStates.reduce((sum, order) => sum + order.distance, 0) / moving)
      : 0;
    const movingDistances = movingStates.map(order => Math.max(0, Number(order.distance) || 0));
    const distanceSpread = movingDistances.length > 1
      ? Math.round(Math.max(...movingDistances) - Math.min(...movingDistances))
      : 0;
    const cohesionState = movingDistances.length > 1 && distanceSpread >= 120 ? 'stretched' : 'steady';
    const officerLosses = snapshots.filter(s => !s.officerAlive).length;
    const drummerLosses = snapshots.filter(s => !s.drummerAlive).length;

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
      state, strength, morale, routing, reforming, moving, arrived, averageDistance,
      distanceSpread, cohesionState, pressureReasons, orderStates, snapshots,
      officerLosses, drummerLosses
    };
  }

  function regimentOrderLabelV148(reg, order = baseOrderState(reg)) {
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

  function selectionRegimentSummaryV148(regs = selectedRegiments(), tactical = selectionTacticalStateV148(regs)) {
    if (regs.length === 1) {
      const snap = tactical.snapshots[0] || regimentSnapshot(regs[0]);
      const pressure = tactical.state === 'pressured' && tactical.pressureReasons.length
        ? ` · onder druk (${tactical.pressureReasons.join(', ')})`
        : '';
      return `${snap.reg.name} · ${snap.infantry} musketiers · O:${snap.officerAlive ? '✓' : '✗'} D:${snap.drummerAlive ? '✓' : '✗'} · sterkte ${tactical.strength}% · morale ${tactical.morale}%${pressure} · ${regimentOrderLabelV148(snap.reg, snap.order)}`;
    }

    if (regs.length > 1) {
      const formations = [...new Set(regs.map(reg => formationLabel(reg.formation || 'line')))];
      const formationText = formations.length === 1 ? formations[0] : 'gemengde formaties';
      const pressure = tactical.state === 'pressured' && tactical.pressureReasons.length
        ? ` · onder druk (${tactical.pressureReasons.join(', ')})`
        : '';
      const reformText = tactical.reforming ? ` · ${tactical.reforming} hergroepeert` : '';
      const arrivalText = tactical.arrived > 0 && tactical.moving > 0 ? ` · ${tactical.arrived} aangekomen` : '';
      const cohesionText = tactical.cohesionState === 'stretched'
        ? ` · formatie rekt uit (${tactical.distanceSpread} m verschil)`
        : '';
      const moveText = tactical.moving
        ? `${tactical.moving}/${regs.length} marcheert · gem. ${Math.max(1, tactical.averageDistance)} m te gaan`
        : 'positie ingenomen';
      return `${regs.length} regimenten geselecteerd · ${formationText} · sterkte ${tactical.strength}% · morale ${tactical.morale}%${pressure}${commandLossSummary(tactical)}${reformText} · ${moveText}${arrivalText}${cohesionText}`;
    }

    return null;
  }

  global.selectionTacticalState = selectionTacticalStateV148;
  global.regimentOrderLabel = regimentOrderLabelV148;
  global.selectionRegimentSummaryV144 = selectionRegimentSummaryV148;
  global.selectionRegimentSummaryV147 = selectionRegimentSummaryV148;
  global.selectionRegimentSummaryV148 = selectionRegimentSummaryV148;
  global.__TACTICAL_HUD_V148__ = Object.freeze({
    selectionTacticalState: selectionTacticalStateV148,
    regimentOrderLabel: regimentOrderLabelV148,
    selectionRegimentSummary: selectionRegimentSummaryV148
  });
})(window);
