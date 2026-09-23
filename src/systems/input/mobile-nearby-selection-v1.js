'use strict';
// ---------- mobile nearby loose-infantry selection ----------
(function installMobileNearbySelectionV1(global) {
  if (global.__MOBILE_NEARBY_SELECTION_V1__) return;
  if (typeof renderDynamicActions !== 'function') return;

  const TARGET_INFANTRY = 12;
  const baseRenderDynamicActions = renderDynamicActions;

  function validLooseInfantry(unit) {
    return Boolean(
      unit && !unit.dead && !unit.routing && !unit.regimentId &&
      unit.side === 'france' && unit.type === 'infantry'
    );
  }

  function selectedLooseInfantry() {
    const group = [...selectedUnits].filter(unit => unit && !unit.dead && !unit.routing);
    if (!group.length || !group.every(validLooseInfantry)) return [];
    return group;
  }

  function distanceSqToAnchor(unit, anchor) {
    const dx = (unit?.x || 0) - anchor.x;
    const dy = (unit?.y || 0) - anchor.y;
    return dx * dx + dy * dy;
  }

  function selectionAnchor(group) {
    if (typeof centroid === 'function') return centroid(group);
    const total = group.reduce((sum, unit) => ({ x: sum.x + unit.x, y: sum.y + unit.y }), { x: 0, y: 0 });
    return { x: total.x / group.length, y: total.y / group.length };
  }

  function nearbyCandidates(group) {
    if (!group?.length) return [];
    const selectedIds = new Set(group.map(unit => unit.id));
    const anchor = selectionAnchor(group);
    return freeUnits('france', 'infantry')
      .filter(unit => validLooseInfantry(unit) && !selectedIds.has(unit.id))
      .sort((a, b) => distanceSqToAnchor(a, anchor) - distanceSqToAnchor(b, anchor));
  }

  function selectNearby() {
    const group = selectedLooseInfantry();
    if (!group.length || group.length >= TARGET_INFANTRY) return false;
    const needed = TARGET_INFANTRY - group.length;
    const additions = nearbyCandidates(group).slice(0, needed);
    if (!additions.length) {
      statusEl.textContent = 'Geen extra vrije musketiers in de buurt beschikbaar.';
      return false;
    }
    additions.forEach(unit => selectedUnits.add(unit));
    selectedBuilding = null;
    actionSignature = '';
    updateHud(true);
    statusEl.textContent = `${selectedUnits.size} losse musketiers geselecteerd · klaar voor verplaatsen of verdere groepsvorming.`;
    return true;
  }

  renderDynamicActions = function renderNearbySelectionActions(force = false) {
    baseRenderDynamicActions(force);
    const group = selectedLooseInfantry();
    if (!group.length || group.length >= TARGET_INFANTRY) return;
    if (actionsEl.querySelector('[data-action="select-nearby-infantry"]')) return;

    const available = nearbyCandidates(group).length;
    const button = makeDynamicButton(
      'select-nearby-infantry',
      `Selecteer nabij<br><small>${group.length}/${TARGET_INFANTRY} · +${Math.min(TARGET_INFANTRY - group.length, available)}</small>`,
      available < 1
    );
    button.title = available
      ? 'Voeg de dichtstbijzijnde vrije musketiers toe aan deze selectie, tot maximaal 12.'
      : 'Er zijn geen extra vrije musketiers beschikbaar.';
    actionsEl.prepend(button);
  };

  actionsEl.addEventListener('click', event => {
    const button = event.target.closest('button[data-action="select-nearby-infantry"]');
    if (!button || button.disabled) return;
    selectNearby();
  });

  global.__MOBILE_NEARBY_SELECTION_V1__ = Object.freeze({
    targetInfantry: TARGET_INFANTRY,
    selectedCount: () => selectedLooseInfantry().length,
    availableCount: () => nearbyCandidates(selectedLooseInfantry()).length,
    selectNearby
  });
})(window);