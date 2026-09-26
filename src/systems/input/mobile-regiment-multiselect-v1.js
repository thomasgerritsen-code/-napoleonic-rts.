'use strict';
// ---------- mobile regiment multi-selection ----------
(function installMobileRegimentMultiselectV1(global) {
  if (global.__MOBILE_REGIMENT_MULTISELECT_V1__) return;
  if (typeof renderDynamicActions !== 'function') return;

  const baseRenderDynamicActions = renderDynamicActions;
  let tapSelectionMode = false;

  function selectedFrenchRegiments() {
    return selectedRegiments().filter(regiment => regiment.side === 'france' && !regiment.destroyed);
  }

  function regimentCenter(regiment) {
    const members = regimentMembers(regiment).filter(unit => !unit.dead && !unit.routing);
    return members.length ? centroid(members) : { x: regiment.targetX || 0, y: regiment.targetY || 0 };
  }

  function nearestUnselectedRegiment(selected) {
    if (!selected.length) return null;
    const selectedIds = new Set(selected.map(regiment => regiment.id));
    const anchor = centroid(selected.map(regimentCenter));
    let nearest = null;
    let nearestDistance = Infinity;
    for (const regiment of activeRegiments('france')) {
      if (selectedIds.has(regiment.id)) continue;
      const center = regimentCenter(regiment);
      const distance = Math.hypot(center.x - anchor.x, center.y - anchor.y);
      if (distance < nearestDistance) {
        nearest = regiment;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  function addNearestRegiment() {
    const selected = selectedFrenchRegiments();
    const nearest = nearestUnselectedRegiment(selected);
    if (!nearest) return false;
    regimentMembers(nearest).filter(unit => !unit.dead).forEach(unit => selectedUnits.add(unit));
    selectedBuilding = null;
    actionSignature = '';
    updateHud(true);
    statusEl.textContent = `${selected.length + 1} regimenten geselecteerd · gezamenlijke bevelen zijn actief.`;
    return true;
  }

  function toggleTappedRegiment(unit) {
    if (!tapSelectionMode || !unit?.regimentId || unit.side !== 'france') return false;
    const regiment = getRegiment(unit.regimentId);
    if (!regiment || regiment.destroyed) return false;

    const selected = selectedFrenchRegiments();
    const isSelected = selected.some(candidate => candidate.id === regiment.id);
    if (isSelected && selected.length === 1) {
      statusEl.textContent = 'Minstens één regiment blijft geselecteerd · tik een ander regiment om het toe te voegen.';
      return true;
    }

    const members = regimentMembers(regiment).filter(member => !member.dead);
    if (isSelected) members.forEach(member => selectedUnits.delete(member));
    else members.forEach(member => selectedUnits.add(member));
    selectedBuilding = null;
    actionSignature = '';
    updateHud(true);
    const count = selectedFrenchRegiments().length;
    statusEl.textContent = `${regiment.name} ${isSelected ? 'verwijderd uit' : 'toegevoegd aan'} selectie · ${count} regiment${count === 1 ? '' : 'en'} geselecteerd.`;
    return true;
  }

  renderDynamicActions = function renderMobileRegimentMultiselectActions(force = false) {
    baseRenderDynamicActions(force);
    const selected = selectedFrenchRegiments();
    if (!selected.length) {
      tapSelectionMode = false;
      return;
    }
    if (!actionsEl.querySelector('[data-action="toggle-regiment-tap-selection"]')) {
      const toggle = makeDynamicButton(
        'toggle-regiment-tap-selection',
        `Tik regimenten<br><small>${tapSelectionMode ? 'aan · tik om te wisselen' : 'uit'}</small>`
      );
      toggle.title = 'Zet aantikken aan om regimenten aan de huidige selectie toe te voegen of eruit te verwijderen.';
      toggle.setAttribute('aria-pressed', String(tapSelectionMode));
      actionsEl.prepend(toggle);
    }
    if (!nearestUnselectedRegiment(selected) || actionsEl.querySelector('[data-action="add-nearest-regiment"]')) return;
    const add = makeDynamicButton(
      'add-nearest-regiment',
      `Voeg regiment toe<br><small>${selected.length} geselecteerd</small>`
    );
    add.title = 'Voeg het dichtstbijzijnde andere regiment toe aan de huidige selectie.';
    actionsEl.prepend(add);
  };

  actionsEl.addEventListener('click', event => {
    const toggle = event.target.closest('button[data-action="toggle-regiment-tap-selection"]');
    if (toggle && !toggle.disabled) {
      tapSelectionMode = !tapSelectionMode;
      actionSignature = '';
      updateHud(true);
      statusEl.textContent = tapSelectionMode
        ? 'Tik regimenten aan · tik regimenten op het slagveld om ze toe te voegen of te verwijderen.'
        : 'Tik regimenten uit · normale selectie is actief.';
      return;
    }
    const button = event.target.closest('button[data-action="add-nearest-regiment"]');
    if (!button || button.disabled) return;
    addNearestRegiment();
  });

  global.__MOBILE_REGIMENT_MULTISELECT_V1__ = Object.freeze({
    selectedCount: () => selectedFrenchRegiments().length,
    hasAvailableRegiment: () => Boolean(nearestUnselectedRegiment(selectedFrenchRegiments())),
    addNearestRegiment,
    tapSelectionActive: () => tapSelectionMode,
    toggleTappedRegiment
  });
})(window);
