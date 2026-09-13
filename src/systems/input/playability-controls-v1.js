'use strict';
(function installPlayabilityControlsV1(root) {
  const CONTRACT = Object.freeze({
    version: 'playability-controls-v1',
    shiftBoxAdditiveSelection: true,
    formationHotkeys: true,
    focusSelectionHotkey: true,
    regimentCycleHotkey: true
  });

  const baseSelectBox = selectBox;
  selectBox = function selectBoxWithAdditiveSelection(x1, y1, x2, y2) {
    const additive = keys.has('shift');
    if (!additive) return baseSelectBox(x1, y1, x2, y2);

    const previous = [...selectedUnits].filter(u => u && !u.dead);
    baseSelectBox(x1, y1, x2, y2);
    previous.forEach(u => selectedUnits.add(u));
    actionSignature = '';
    updateHud(true);
  };

  function focusCurrentSelection() {
    let x = null;
    let y = null;
    const selected = [...selectedUnits].filter(u => u && !u.dead);
    if (selected.length) {
      const c = centroid(selected);
      x = c.x;
      y = c.y;
    } else if (selectedBuilding && !selectedBuilding.dead) {
      x = selectedBuilding.x;
      y = selectedBuilding.y;
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      statusEl.textContent = 'Selecteer eerst een regiment, eenheid of gebouw om erop te focussen.';
      return false;
    }
    camera.x = x;
    camera.y = y;
    clampCamera();
    statusEl.textContent = 'Camera gecentreerd op selectie.';
    return true;
  }

  function cyclePlayerRegiment(reverse = false) {
    const regs = activeRegiments('france');
    if (!regs.length) {
      statusEl.textContent = 'Geen actieve regimenten om doorheen te bladeren.';
      return false;
    }
    const currentIds = new Set(selectedRegiments().map(r => r.id));
    let index = regs.findIndex(r => currentIds.has(r.id));
    if (index < 0) index = reverse ? 0 : -1;
    index = (index + (reverse ? -1 : 1) + regs.length) % regs.length;
    const reg = regs[index];
    selectWholeRegiment(reg);
    currentFormation = reg.formation;
    actionSignature = '';
    updateHud(true);
    const c = centroid(regimentMembers(reg));
    camera.x = c.x;
    camera.y = c.y;
    clampCamera();
    statusEl.textContent = `${reg.name} geselecteerd · ${formationLabel(reg.formation)}.`;
    return true;
  }

  addEventListener('keydown', e => {
    if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const formationByKey = { '1': 'line', '2': 'column', '3': 'square' };
    if (formationByKey[k]) {
      e.preventDefault();
      applyFormationNow(formationByKey[k]);
      return;
    }
    if (k === 'f') {
      e.preventDefault();
      focusCurrentSelection();
      return;
    }
    if (k === 'tab') {
      e.preventDefault();
      cyclePlayerRegiment(e.shiftKey);
    }
  });

  root.__PLAYABILITY_CONTROLS_V1__ = Object.freeze({
    contract: CONTRACT,
    focusCurrentSelection,
    cyclePlayerRegiment
  });
})(window);
