'use strict';
// Shared by browser and server. No DOM, rendering clock or client-owned side.
(function expose(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NRTS_COMMAND_PROTOCOL = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createProtocol() {
  const VERSION = 1, MAX_UNITS = 1024;
  const id = value => Number.isSafeInteger(value) && value > 0 && value <= 0xffffffff;
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const empty = () => ({});
  const schemas = {
    move: d => finite(d.x) && finite(d.y) && (d.facing === undefined || (finite(d.facing) && Math.abs(d.facing) <= Math.PI * 2))
      ? { x:d.x, y:d.y, ...(d.facing === undefined ? {} : {facing:d.facing}) } : null,
    formation: d => ['line','column','square'].includes(d.formation) ? {formation:d.formation} : null,
    rotate: d => finite(d.radians) && Math.abs(d.radians) <= Math.PI * 2 ? {radians:d.radians} : null,
    halt: empty,
    train: d => ['worker','infantry','officer','drummer','cavalry','artillery'].includes(d.unitType) ? {unitType:d.unitType} : null,
    'train-troop': d => ['grenadier','voltigeur','guard','sapper','rifle','cuirassier','lancer','hussar','greys','heavy12','howitzer','horseart','mounted'].includes(d.troop) ? {troop:d.troop} : null,
    'assign-officer': empty,
    build: d => ['barracks','house','farm','stable','foundry','tower','hospital'].includes(d.buildingType) && finite(d.x) && finite(d.y)
      ? {buildingType:d.buildingType, x:d.x, y:d.y} : null,
    'create-regiment': d => ['infantry','cavalry','artillery'].includes(d.kind) ? {kind:d.kind} : null,
    bayonet: empty, charge: empty, 'artillery-mode': empty,
    gather: d => id(d.resourceId) ? {resourceId:d.resourceId} : null,
    rally: d => finite(d.x) && finite(d.y) ? {x:d.x,y:d.y} : null,
    action: d => ['quick-regiment','quick-regiment-barracks','train-missing','auto-regiment',
      'defend-stance','reinforce-regiment','trench-upgrade','crew-gun','farm-assign','resume-construction','skirmish'].includes(d.action) ? {action:d.action} : null
  };
  function normalize(raw) {
    if (!raw || raw.v !== VERSION || !id(raw.seq) || typeof raw.type !== 'string' || !Object.hasOwn(schemas, raw.type)) return {ok:false, reason:'invalid-command'};
    if (!Array.isArray(raw.unitIds) || raw.unitIds.length > MAX_UNITS || raw.unitIds.some(value => !id(value)) || new Set(raw.unitIds).size !== raw.unitIds.length) return {ok:false, reason:'invalid-units'};
    if (raw.buildingId !== null && !id(raw.buildingId)) return {ok:false, reason:'invalid-building'};
    if (!raw.data || typeof raw.data !== 'object' || Array.isArray(raw.data)) return {ok:false, reason:'invalid-data'};
    const data = schemas[raw.type](raw.data);
    if (!data) return {ok:false, reason:'invalid-data'};
    if (['train','train-troop'].includes(raw.type) && raw.buildingId === null) return {ok:false, reason:'building-required'};
    if (raw.type === 'rally' && raw.buildingId === null) return {ok:false, reason:'building-required'};
    if (!['build','train','train-troop','rally','action'].includes(raw.type) && !raw.unitIds.length) return {ok:false, reason:'units-required'};
    if (raw.type === 'action' && !raw.unitIds.length && raw.buildingId === null) return {ok:false, reason:'selection-required'};
    return {ok:true, command:Object.freeze({v:VERSION, seq:raw.seq, type:raw.type,
      unitIds:Object.freeze([...raw.unitIds]), buildingId:raw.buildingId, data:Object.freeze(data)})};
  }
  function ownership(command, side, adapter) {
    if (!['france','britain'].includes(side)) return {ok:false, reason:'invalid-player'};
    for (const unitId of command.unitIds) {
      const unit = adapter.unit(unitId);
      if (!unit || unit.dead || unit.side !== side) return {ok:false, reason:'unit-not-owned'};
    }
    if (command.buildingId !== null) {
      const building = adapter.building(command.buildingId);
      if (!building || building.dead || building.side !== side) return {ok:false, reason:'building-not-owned'};
    }
    if (command.type === 'move' || command.type === 'build' || command.type === 'rally') {
      const bounds = adapter.world();
      if (command.data.x < 0 || command.data.y < 0 || command.data.x > bounds.width || command.data.y > bounds.height) return {ok:false, reason:'outside-world'};
    }
    return {ok:true};
  }
  return Object.freeze({VERSION, MAX_UNITS, normalize, ownership, types:Object.freeze(Object.keys(schemas))});
});
