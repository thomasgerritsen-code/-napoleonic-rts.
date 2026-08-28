'use strict';
// ---------- v0.5 test hooks ----------
if (window.__RTS_DEBUG__) {
  const baseGetState = window.__RTS_DEBUG__.getState.bind(window.__RTS_DEBUG__);
  window.__RTS_DEBUG__.getState = function getStateV05() {
    const state = baseGetState();
    const enrich = side => {
      state[side].regiments = activeRegiments(side).map(r => ({
        id: r.id,
        side: r.side,
        formation: r.formation,
        facing: r.facing || 0,
        destroyed: r.destroyed,
        memberIds: [...r.memberIds],
        officerId: r.officerId,
        drummerId: r.drummerId,
        formedInfantryCount: r.formedInfantryCount,
        officerAssigned: !!units.find(u => u.id === r.officerId && u.type === 'officer'),
        drummerAssigned: !!units.find(u => u.id === r.drummerId && u.type === 'drummer'),
        livingMembers: regimentMembers(r).map(u => ({ id: u.id, type: u.type, regimentId: u.regimentId }))
      }));
    };
    enrich('france');
    enrich('britain');
    state.navigation = { ...navStats };
    state.minimap = { width: minimap.width, height: minimap.height };
    return state;
  };

  window.__RTS_DEBUG__.grantResources = function grantResources(side, food = 0, wood = 0) {
    economies[side].food += food;
    economies[side].wood += wood;
    updateHud(true);
  };

  window.__RTS_DEBUG__.setPeaceMode = function setPeaceMode(enabled = true) {
    v05PeaceMode = !!enabled;
  };

  window.__RTS_DEBUG__.rotateSelected = function rotateSelected(degrees) {
    rotateSelectedRegiments(degrees * Math.PI / 180);
  };

  window.__RTS_DEBUG__.isVisible = function isVisible(side, id, kind = 'unit') {
    const entity = kind === 'building'
      ? buildings.find(b => b.id === id && b.side === side)
      : units.find(u => u.id === id && u.side === side);
    return entity ? isVisibleToFrance(entity) : false;
  };
}
