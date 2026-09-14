'use strict';
// Tactical HUD v149: lower-allocation cohesion metrics with clearer grouped-order feedback.
(function installTacticalHudV149(global) {
  const base = global.__TACTICAL_HUD_V148__;
  if (!base || typeof base.selectionTacticalState !== 'function') return;

  const baseSelectionTacticalState = base.selectionTacticalState;
  const baseSingleSummary = base.selectionRegimentSummary;

  function movementCohesion(orderStates, regimentCount) {
    let moving = 0;
    let distanceTotal = 0;
    let minDistance = Infinity;
    let maxDistance = 0;

    for (let i = 0; i < orderStates.length; i += 1) {
      const order = orderStates[i];
      if (!order?.moving) continue;
      const distance = Math.max(0, Number(order.distance) || 0);
      moving += 1;
      distanceTotal += distance;
      if (distance < minDistance) minDistance = distance;
      if (distance > maxDistance) maxDistance = distance;
    }

    const arrived = Math.max(0, regimentCount - moving);
    const averageDistance = moving ? Math.round(distanceTotal / moving) : 0;
    const distanceSpread = moving > 1 ? Math.round(maxDistance - minDistance) : 0;
    let cohesionState = 'steady';
    if (moving > 1 && distanceSpread >= 250) cohesionState = 'critical';
    else if (moving > 1 && distanceSpread >= 120) cohesionState = 'stretched';

    return {
      moving,
      arrived,
      averageDistance,
      distanceSpread,
      arrivalRatio: regimentCount ? arrived / regimentCount : 0,
      cohesionState
    };
  }

  function selectionTacticalStateV149(regs = selectedRegiments()) {
    const tactical = baseSelectionTacticalState(regs);
    const movement = movementCohesion(tactical.orderStates || [], regs.length);
    return { ...tactical, ...movement };
  }

  function cohesionSummary(tactical) {
    if (tactical.cohesionState === 'critical') {
      return ` · cohesie kritiek (${tactical.distanceSpread} m verschil) · hergroeperen aanbevolen`;
    }
    if (tactical.cohesionState === 'stretched') {
      return ` · formatie rekt uit (${tactical.distanceSpread} m verschil)`;
    }
    return '';
  }

  function commandLossSummary(tactical) {
    const parts = [];
    if (tactical.officerLosses) parts.push(`${tactical.officerLosses} zonder officier`);
    if (tactical.drummerLosses) parts.push(`${tactical.drummerLosses} zonder drummer`);
    return parts.length ? ` · commando: ${parts.join(', ')}` : '';
  }

  function selectionRegimentSummaryV149(regs = selectedRegiments(), tactical = selectionTacticalStateV149(regs)) {
    if (regs.length <= 1) return baseSingleSummary(regs, tactical);

    const formations = [...new Set(regs.map(reg => formationLabel(reg.formation || 'line')))];
    const formationText = formations.length === 1 ? formations[0] : 'gemengde formaties';
    const pressure = tactical.state === 'pressured' && tactical.pressureReasons.length
      ? ` · onder druk (${tactical.pressureReasons.join(', ')})`
      : '';
    const reformText = tactical.reforming ? ` · ${tactical.reforming} hergroepeert` : '';
    const arrivalText = tactical.arrived > 0 && tactical.moving > 0
      ? ` · ${tactical.arrived}/${regs.length} aangekomen`
      : '';
    const moveText = tactical.moving
      ? `${tactical.moving}/${regs.length} marcheert · gem. ${Math.max(1, tactical.averageDistance)} m te gaan`
      : `${regs.length}/${regs.length} aangekomen · positie ingenomen`;

    return `${regs.length} regimenten geselecteerd · ${formationText} · sterkte ${tactical.strength}% · morale ${tactical.morale}%${pressure}${commandLossSummary(tactical)}${reformText} · ${moveText}${arrivalText}${cohesionSummary(tactical)}`;
  }

  global.selectionTacticalState = selectionTacticalStateV149;
  global.selectionRegimentSummaryV144 = selectionRegimentSummaryV149;
  global.selectionRegimentSummaryV147 = selectionRegimentSummaryV149;
  global.selectionRegimentSummaryV148 = selectionRegimentSummaryV149;
  global.selectionRegimentSummaryV149 = selectionRegimentSummaryV149;
  global.__TACTICAL_HUD_V149__ = Object.freeze({
    movementCohesion,
    selectionTacticalState: selectionTacticalStateV149,
    selectionRegimentSummary: selectionRegimentSummaryV149
  });
})(window);
