'use strict';
// ---------- officer-led regiment creation + mobile officer selection ----------
(function installOfficerRegimentMobileV1(global) {
  if (global.__OFFICER_REGIMENT_MOBILE_V1__) return;

  const CONTRACT = Object.freeze({
    version: 'officer-regiment-mobile-v1',
    officerAsRegimentAnchor: true,
    autoFillMinimumInfantry: 12,
    autoFillRadius: 320,
    autoAssignNearestDrummer: true,
    preserveExplicitSelection: true
  });

  const baseEligibility = regimentEligibility;
  const baseMakePlayerRegiment = makePlayerRegiment;
  const baseRenderDynamicActions = typeof renderDynamicActions === 'function' ? renderDynamicActions : null;
  const MIN_INFANTRY = 12;
  const MAX_INFANTRY = 36;
  const AUTO_FILL_RADIUS = CONTRACT.autoFillRadius;
  const AUTO_FILL_RADIUS_SQ = AUTO_FILL_RADIUS * AUTO_FILL_RADIUS;

  function distanceSq(a, b) {
    const dx = (a?.x || 0) - (b?.x || 0);
    const dy = (a?.y || 0) - (b?.y || 0);
    return dx * dx + dy * dy;
  }

  function validLoose(unit, side) {
    return Boolean(unit && !unit.dead && !unit.routing && !unit.regimentId && unit.side === side);
  }

  function nearestTo(anchor, candidates) {
    return [...candidates].sort((a, b) => distanceSq(anchor, a) - distanceSq(anchor, b));
  }

  function withinAutoFillRadius(anchor, unit) {
    return distanceSq(anchor, unit) <= AUTO_FILL_RADIUS_SQ;
  }

  const countLabel = n => global.NRTS_CONFIG?.regimentOrders?.maxInfantry ? `${n} man` : `${n}/12`;

  function officerDraft(group, side = 'france') {
    const selected = (group || []).filter(unit => validLoose(unit, side));
    const officers = selected.filter(unit => officerCanLead(unit, 'infantry'));
    if (officers.length !== 1) return null;

    const officer = officers[0];
    const selectedInfantry = selected.filter(unit => unit.type === 'infantry').slice(0, MAX_INFANTRY);
    const selectedIds = new Set(selectedInfantry.map(unit => unit.id));
    // On the open map the officer gathers every free musketier near him, up to a full
    // regiment (regimentOrders.maxInfantry); otherwise the 12 it needs.
    const fill = global.NRTS_CONFIG?.regimentOrders?.maxInfantry || MIN_INFANTRY;
    const needed = Math.max(0, fill - selectedInfantry.length);
    const nearbyInfantry = nearestTo(
      officer,
      freeUnits(side, 'infantry').filter(unit =>
        !selectedIds.has(unit.id) && withinAutoFillRadius(officer, unit)
      )
    ).slice(0, needed);
    const infantry = [...selectedInfantry, ...nearbyInfantry].slice(0, MAX_INFANTRY);

    const selectedDrummer = selected.find(unit => unit.type === 'drummer');
    const drummer = selectedDrummer || nearestTo(
      officer,
      freeUnits(side, 'drummer').filter(unit => withinAutoFillRadius(officer, unit))
    )[0] || null;
    const candidates = [...infantry, officer];
    if (drummer) candidates.push(drummer);

    const eligibility = baseEligibility(candidates);
    return {
      officer,
      drummer,
      infantry,
      candidates,
      eligibility,
      autoAddedInfantry: nearbyInfantry.length,
      autoAddedDrummer: Boolean(drummer && !selectedDrummer)
    };
  }

  regimentEligibility = function officerAwareRegimentEligibility(group) {
    const direct = baseEligibility(group || []);
    if (direct.canCreate) return direct;
    const draft = officerDraft(group || []);
    return draft ? draft.eligibility : direct;
  };

  makePlayerRegiment = function makePlayerRegimentFromOfficer() {
    const group = [...selectedUnits];
    const direct = baseEligibility(group);
    let candidates = group;
    let draft = null;

    if (!direct.canCreate) {
      draft = officerDraft(group, 'france');
      if (!draft || !draft.eligibility.canCreate) {
        if (!draft) {
          statusEl.textContent = 'Selecteer één vrije officier om een regiment te vormen.';
        } else {
          const missingInfantry = Math.max(0, MIN_INFANTRY - draft.eligibility.infantry);
          const needsDrummer = draft.eligibility.drummers < 1;
          const missing = [
            missingInfantry ? `${missingInfantry} nabije vrije musketier${missingInfantry === 1 ? '' : 's'}` : '',
            needsDrummer ? '1 nabije vrije drummer' : ''
          ].filter(Boolean).join(' en ');
          statusEl.textContent = `Kan nog geen regiment vormen: ${missing || 'onvoldoende vrije manschappen'}.`;
        }
        return;
      }
      candidates = draft.candidates;
    }

    const reg = createRegiment('france', candidates);
    if (!reg) {
      baseMakePlayerRegiment();
      return;
    }
    selectWholeRegiment(reg);
    currentFormation = 'line';
    actionSignature = '';
    statusEl.textContent = draft
      ? `${reg.name} gevormd rond de officier: ${reg.formedInfantryCount} musketiers + drummer automatisch toegewezen.`
      : `${reg.name} gevormd: officier en drummer toegewezen.`;
    updateHud(true);
  };

  if (baseRenderDynamicActions) {
    renderDynamicActions = function renderOfficerAwareDynamicActions() {
      baseRenderDynamicActions();
      const button = document.querySelector('#actions [data-action="create-regiment"]');
      if (!button) return;
      const group = [...selectedUnits].filter(unit => !unit.dead && !unit.routing);
      const direct = baseEligibility(group);
      if (direct.canCreate) return;
      const draft = officerDraft(group, 'france');
      if (!draft) return;
      const ready = draft.eligibility.canCreate;
      button.innerHTML = ready
        ? `Maak regiment<br><small>auto · ${countLabel(draft.eligibility.infantry)} · D${draft.eligibility.drummers}</small>`
        : `Maak regiment<br><small>binnen ${AUTO_FILL_RADIUS} m · ${countLabel(draft.eligibility.infantry)} · D${draft.eligibility.drummers}</small>`;
      button.title = ready
        ? 'Vorm rond deze officier automatisch een regiment met minimaal 12 nabijgelegen musketiers en de dichtstbijzijnde vrije drummer.'
        : `Binnen ${AUTO_FILL_RADIUS} meter zijn nog niet genoeg vrije musketiers en/of geen vrije drummer beschikbaar.`;
    };
  }

  const api = {
    contract: CONTRACT,
    draft() {
      const draft = officerDraft([...selectedUnits], 'france');
      if (!draft) return null;
      return {
        officerId: draft.officer.id,
        drummerId: draft.drummer?.id || null,
        infantryIds: draft.infantry.map(unit => unit.id),
        canCreate: draft.eligibility.canCreate,
        autoAddedInfantry: draft.autoAddedInfantry,
        autoAddedDrummer: draft.autoAddedDrummer
      };
    }
  };
  global.__OFFICER_REGIMENT_MOBILE_V1__ = api;
})(window);
