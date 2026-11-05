'use strict';
// Migration boundary: regular single-player inputs already produce serializable
// commands. Rendering, camera and selection remain local. No network is opened.
(function installCommandGateway(root) {
  if (document.readyState !== 'complete') { addEventListener('load', () => installCommandGateway(root), {once:true}); return; }
  const protocol = root.NRTS_COMMAND_PROTOCOL;
  let seq = 0, executing = 0;
  const history = [];
  const entityAdapter = { unit:id => units.find(u => u.id === id), building:id => buildings.find(b => b.id === id), world:() => WORLD };
  const bindings = {
    issueMove: {type:'move', data:(x,y) => ({x,y})},
    issueMoveWithFacingV06: {type:'move', data:(x,y,facing) => ({x,y,...(Number.isFinite(facing)?{facing}:{})})},
    applyFormationNow: {type:'formation', data:formation => ({formation})},
    rotateSelectedRegiments: {type:'rotate', data:radians => ({radians})},
    haltSelectedRegiments: {type:'halt', data:() => ({})},
    queuePlayerUnit: {type:'train', data:unitType => ({unitType})},
    placeBuilding: {type:'build', data:(buildingType,x,y) => ({buildingType,x,y})},
    makePlayerRegiment: {type:'create-regiment', data:() => ({kind:'infantry'})},
    makePlayerCavalryRegimentV06: {type:'create-regiment', data:() => ({kind:'cavalry'})},
    makePlayerArtilleryBatteryV06: {type:'create-regiment', data:() => ({kind:'artillery'})},
    bayonetCommand: {type:'bayonet', data:() => ({})},
    cavalryCharge: {type:'charge', data:() => ({})},
    toggleArtillery: {type:'artillery-mode', data:() => ({})}
  };
  function accept(raw, execute) {
    if (!executing && root.__ONLINE_MATCH_V1__?.active) return {ok:true,value:root.__ONLINE_MATCH_V1__.send(raw)};
    const normalized = protocol.normalize(raw);
    if (!normalized.ok) return {ok:false, reason:normalized.reason};
    const command = normalized.command;
    if (command.seq <= seq) return {ok:false, reason:'stale-sequence'};
    const owned = protocol.ownership(command, 'france', entityAdapter);
    if (!owned.ok) return owned;
    seq = command.seq;
    const record = {tick:Math.round(elapsed * 60), command};
    executing++;
    try {
      const value = execute(command);
      history.push(record); if (history.length > 64) history.shift();
      root.NRTS?.events?.emit?.('command:applied', record);
      return {ok:true, value};
    } finally { executing--; }
  }
  function installBindings() {
    for (const [name, binding] of Object.entries(bindings)) {
      const base = root[name];
      if (typeof base !== 'function' || base.commandGatewayV1) continue;
      const wrapped = function commandInput(...args) {
        if (executing) return base.apply(this, args);
        const ids = [...selectedUnits].filter(u => !u.dead).map(u => u.id);
        // Choosing the default formation without a selection is a local preference.
        if (!ids.length && !['train','build'].includes(binding.type)) return base.apply(this, args);
        const result = accept({v:protocol.VERSION, seq:seq+1, type:binding.type, unitIds:ids,
          buildingId:binding.type === 'train' ? selectedBuilding?.id ?? null : null,
          data:binding.data(...args)}, () => base.apply(this, args));
        return result.ok ? result.value : false;
      };
      // The existing attack/trench/gun hooks copy marks to avoid wrapper growth.
      Object.assign(wrapped, base); wrapped.commandGatewayV1 = true; root[name] = wrapped;
    }
  }
  function run(type, data, execute, building = null) {
    if (executing) return execute();
    const result = accept({v:protocol.VERSION, seq:seq+1, type,
      unitIds:[...selectedUnits].filter(u => !u.dead).map(u => u.id),
      buildingId:building?.id ?? null, data}, execute);
    return result.ok ? result.value : false;
  }
  function execute(command) {
    const d = command.data;
    switch (command.type) {
      case 'move': return Number.isFinite(d.facing) ? root.issueMoveWithFacingV06(d.x,d.y,d.facing) : root.issueMove(d.x,d.y);
      case 'formation': return root.applyFormationNow(d.formation);
      case 'rotate': return root.rotateSelectedRegiments(d.radians);
      case 'halt': return root.haltSelectedRegiments();
      case 'train': return root.queuePlayerUnit(d.unitType);
      case 'train-troop': return root.__TROOPS_V1__?.trainTroop(d.troop, selectedBuilding) ?? false;
      case 'assign-officer': return root.__OFFICER_ASSIGNMENT_V1__?.assign() ?? false;
      case 'build': return root.placeBuilding(d.buildingType,d.x,d.y);
      case 'create-regiment': return root[d.kind === 'infantry' ? 'makePlayerRegiment' : d.kind === 'cavalry' ? 'makePlayerCavalryRegimentV06' : 'makePlayerArtilleryBatteryV06']();
      case 'bayonet': return root.bayonetCommand();
      case 'charge': return root.cavalryCharge();
      case 'artillery-mode': return root.toggleArtillery();
      case 'gather': return assignGather(resources.find(r => r.id === d.resourceId));
      case 'rally': return finishRallyPlacementV06(d.x,d.y,selectedBuilding);
      case 'action': {
        const button = actionsEl.querySelector(`[data-action="${d.action}"]`);
        if (!button || button.disabled) return false;
        button.click(); return true;
      }
      default: return false;
    }
  }
  function dispatch(raw) {
    return accept(raw, applyAuthorized);
  }
  // Called only after the server authority has authenticated and checked ownership.
  function applyAuthorized(command) {
      const selected = [...selectedUnits], building = selectedBuilding;
      selectedUnits.clear();
      for (const id of command.unitIds) selectedUnits.add(entityAdapter.unit(id));
      selectedBuilding = command.buildingId ? entityAdapter.building(command.buildingId) : null;
      executing++;
      try { actionSignature=''; updateHud(true); return execute(command); }
      finally {executing--; selectedUnits.clear(); for (const unit of selected) if (!unit.dead) selectedUnits.add(unit); selectedBuilding = building; actionSignature = ''; updateHud(true);}
  }
  installBindings();
  // Late legacy modules can decorate input functions. Marks prevent wrapping an
  // already routed call again; installing once per second allocates no backlog.
  setInterval(installBindings, 1000);
  root.NRTS?.events?.on?.('game:reset', () => {seq=0; history.length=0;});
  const api = Object.freeze({version:protocol.VERSION, mode:'local', side:'france', dispatch, run, applyAuthorized,
    history:() => history.map(r => ({tick:r.tick, command:JSON.parse(JSON.stringify(r.command))})),
    stats:() => ({seq, retained:history.length, limit:64, routedFunctions:Object.keys(bindings)})});
  root.__COMMAND_GATEWAY_V1__ = api;
  root.NRTS?.services?.provide?.('commands', 'browser-command-gateway-v1', api, {generation:1});
})(window);
