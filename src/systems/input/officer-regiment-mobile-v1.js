'use strict';
// ---------- officer-led regiment creation + mobile officer selection ----------
(function installOfficerRegimentMobileV1(global) {
  if (global.__OFFICER_REGIMENT_MOBILE_V1__) return;

  const CONTRACT = Object.freeze({
    version: 'officer-regiment-mobile-v1',
    officerAsRegimentAnchor: true,
    autoFillMinimumInfantry: 12,
    autoAssignNearestDrummer: true,
    preserveExplicitSelection: true,
    mobile3dOfficerTap: true
  });

  const baseEligibility = regimentEligibility;
  const baseMakePlayerRegiment = makePlayerRegiment;
  const baseRenderDynamicActions = typeof renderDynamicActions === 'function' ? renderDynamicActions : null;
  const MIN_INFANTRY = 12;
  const MAX_INFANTRY = 36;

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

  function officerDraft(group, side = 'france') {
    const selected = (group || []).filter(unit => validLoose(unit, side));
    const officers = selected.filter(unit => unit.type === 'officer');
    if (officers.length !== 1) return null;

    const officer = officers[0];
    const selectedInfantry = selected.filter(unit => unit.type === 'infantry').slice(0, MAX_INFANTRY);
    const selectedIds = new Set(selectedInfantry.map(unit => unit.id));
    const needed = Math.max(0, MIN_INFANTRY - selectedInfantry.length);
    const nearbyInfantry = nearestTo(
      officer,
      freeUnits(side, 'infantry').filter(unit => !selectedIds.has(unit.id))
    ).slice(0, needed);
    const infantry = [...selectedInfantry, ...nearbyInfantry].slice(0, MAX_INFANTRY);

    const selectedDrummer = selected.find(unit => unit.type === 'drummer');
    const drummer = selectedDrummer || nearestTo(officer, freeUnits(side, 'drummer'))[0] || null;
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
            missingInfantry ? `${missingInfantry} vrije musketier${missingInfantry === 1 ? '' : 's'}` : '',
            needsDrummer ? '1 vrije drummer' : ''
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
      button.innerHTML = `Maak regiment<br><small>auto · ${draft.eligibility.infantry}/12 · D${draft.eligibility.drummers}</small>`;
      button.title = ready
        ? 'Vorm rond deze officier automatisch een regiment met minimaal 12 nabijgelegen musketiers en de dichtstbijzijnde vrije drummer.'
        : 'Er zijn nog niet genoeg vrije musketiers en/of geen vrije drummer beschikbaar.';
    };
  }

  const api = {
    contract: CONTRACT,
    threeDInstalled: false,
    threeDClaimedTaps: 0,
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
    },
    threeDReady() {
      return Boolean(api.threeDInstalled);
    },
    screenPointForOfficer() {
      return null;
    }
  };
  global.__OFFICER_REGIMENT_MOBILE_V1__ = api;

  async function install3DOfficerTap() {
    let THREE;
    try {
      THREE = await import('https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js');
    } catch (error) {
      console.warn('Mobile officer selection enhancement could not load Three.js.', error);
      return;
    }

    const source = global.NRTS_3D_SOURCE;
    const sceneHook = global.__NRTS_THREE_SCENE_HOOK_V1__;
    const canvas = document.getElementById('battlefield3d');
    if (!source || !sceneHook || !canvas) return;

    const staticWorld = source.staticWorld?.() || {};
    const hills = staticWorld.hills || [];
    const claimed = new Map();
    const point = new THREE.Vector3();
    const OFFICER_TOUCH_RADIUS_PX = 48;
    const TAP_DRAG_PX = 12;

    function hillHeightAt(x, z) {
      let height = Math.sin(x * 0.0041) * 2.4 + Math.sin(z * 0.0057 + 1.1) * 2.0;
      for (const hill of hills) {
        const rx = Math.max(1, hill.rx || hill.w / 2 || 1);
        const rz = Math.max(1, hill.ry || hill.h / 2 || 1);
        const dx = (x - hill.x) / rx;
        const dz = (z - hill.y) / rz;
        const q = dx * dx + dz * dz;
        if (q < 1) height += (1 - q) * (1 - q) * 34;
      }
      return height;
    }

    function screenPoint(unit) {
      const camera = sceneHook.camera?.();
      if (!camera) return null;
      const rect = canvas.getBoundingClientRect();
      point.set(unit.x, hillHeightAt(unit.x, unit.y) + 8, unit.y).project(camera);
      if (point.z < -1 || point.z > 1) return null;
      return {
        x: rect.left + (point.x + 1) * 0.5 * rect.width,
        y: rect.top + (1 - point.y) * 0.5 * rect.height
      };
    }

    function looseFrenchOfficers() {
      return (source.snapshot?.().units || []).filter(unit =>
        unit.side === 'france' && unit.type === 'officer' && !unit.dead && !unit.routing && !unit.regimentId
      );
    }

    function nearestOfficer(clientX, clientY) {
      let best = null;
      let bestDistance = OFFICER_TOUCH_RADIUS_PX;
      for (const officer of looseFrenchOfficers()) {
        const projected = screenPoint(officer);
        if (!projected) continue;
        const d = Math.hypot(projected.x - clientX, projected.y - clientY);
        if (d <= bestDistance) {
          best = officer;
          bestDistance = d;
        }
      }
      return best;
    }

    api.screenPointForOfficer = function screenPointForOfficer(id = null) {
      const officers = looseFrenchOfficers();
      const officer = id == null ? officers[0] : officers.find(unit => unit.id === id);
      const projected = officer ? screenPoint(officer) : null;
      return projected ? { id: officer.id, ...projected } : null;
    };

    canvas.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'touch') return;
      const officer = nearestOfficer(event.clientX, event.clientY);
      if (!officer) return;
      claimed.set(event.pointerId, { officerId: officer.id, sx: event.clientX, sy: event.clientY });
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);

    canvas.addEventListener('pointermove', event => {
      if (event.pointerType !== 'touch' || !claimed.has(event.pointerId)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);

    canvas.addEventListener('pointerup', event => {
      if (event.pointerType !== 'touch') return;
      const claim = claimed.get(event.pointerId);
      if (!claim) return;
      claimed.delete(event.pointerId);
      event.preventDefault();
      event.stopImmediatePropagation();
      if (Math.hypot(event.clientX - claim.sx, event.clientY - claim.sy) > TAP_DRAG_PX) return;
      const officer = looseFrenchOfficers().find(unit => unit.id === claim.officerId);
      if (!officer) return;
      if (source.dispatch({ type: 'select-point', x: officer.x, y: officer.y })) {
        api.threeDClaimedTaps++;
        source.setStatus('Officier geselecteerd · kies “Maak regiment” om automatisch manschappen toe te wijzen.');
      }
    }, true);

    canvas.addEventListener('pointercancel', event => {
      if (!claimed.has(event.pointerId)) return;
      claimed.delete(event.pointerId);
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);

    api.threeDInstalled = true;
  }

  function start3DEnhancement() {
    const tryInstall = () => {
      if (document.getElementById('battlefield3d') && global.__NRTS_THREE_SCENE_HOOK_V1__ && global.NRTS_3D_SOURCE) {
        install3DOfficerTap();
        return;
      }
      setTimeout(tryInstall, 50);
    };
    tryInstall();
  }

  if (document.readyState === 'loading') {
    global.addEventListener('DOMContentLoaded', start3DEnhancement, { once: true });
  } else {
    start3DEnhancement();
  }
})(window);
