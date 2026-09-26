'use strict';
// ---------- mobile regiment multi-selection ----------
(function installMobileRegimentMultiselectV1(global) {
  if (global.__MOBILE_REGIMENT_MULTISELECT_V1__) return;
  if (typeof renderDynamicActions !== 'function') return;

  const baseRenderDynamicActions = renderDynamicActions;

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

  renderDynamicActions = function renderMobileRegimentMultiselectActions(force = false) {
    baseRenderDynamicActions(force);
    const selected = selectedFrenchRegiments();
    if (!selected.length || !nearestUnselectedRegiment(selected)) return;
    if (actionsEl.querySelector('[data-action="add-nearest-regiment"]')) return;
    const button = makeDynamicButton(
      'add-nearest-regiment',
      `Voeg regiment toe<br><small>${selected.length} geselecteerd</small>`
    );
    button.title = 'Voeg het dichtstbijzijnde andere regiment toe aan de huidige selectie.';
    actionsEl.prepend(button);
  };

  actionsEl.addEventListener('click', event => {
    const button = event.target.closest('button[data-action="add-nearest-regiment"]');
    if (!button || button.disabled) return;
    addNearestRegiment();
  });

  global.__MOBILE_REGIMENT_MULTISELECT_V1__ = Object.freeze({
    selectedCount: () => selectedFrenchRegiments().length,
    hasAvailableRegiment: () => Boolean(nearestUnselectedRegiment(selectedFrenchRegiments())),
    addNearestRegiment
  });
})(window);
