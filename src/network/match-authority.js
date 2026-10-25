'use strict';
// A transport-independent authoritative match. Authentication binds a connection
// to a side outside this module; a command can never choose its own identity.
(function expose(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./command-protocol.js'));
  else root.NRTS_MATCH_AUTHORITY = factory(root.NRTS_COMMAND_PROTOCOL);
})(typeof globalThis !== 'undefined' ? globalThis : this, function createAuthorityModule(protocol) {
  function create(adapter, options = {}) {
    for (const key of ['unit','building','world','apply','step','snapshotFor']) if (typeof adapter[key] !== 'function') throw TypeError(`Missing match adapter: ${key}`);
    const hz = options.hz ?? 20, maxPending = options.maxPending ?? 128;
    if (!Number.isInteger(hz) || hz < 1 || hz > 60 || !Number.isInteger(maxPending) || maxPending < 1 || maxPending > 1024) throw TypeError('Invalid match limits');
    const players = new Map(), queue = [], acknowledgements = [];
    let tick = 0, order = 0, accumulator = 0;
    function addPlayer(playerId, side) {
      if (typeof playerId !== 'string' || !playerId.length || playerId.length > 128 || players.has(playerId) || players.size >= 2 || !['france','britain'].includes(side) || [...players.values()].some(p => p.side === side)) return false;
      players.set(playerId, {side, seq:0, windowTick:tick, count:0}); return true;
    }
    function submit(playerId, raw) {
      const player = players.get(playerId);
      if (!player) return {ok:false, reason:'unknown-player'};
      const normalized = protocol.normalize(raw);
      if (!normalized.ok) return normalized;
      const command = normalized.command;
      if (command.seq <= player.seq) return {ok:false, reason:'stale-sequence'};
      if (tick - player.windowTick >= hz) {player.windowTick=tick; player.count=0;}
      if (player.count >= 40 || queue.length >= maxPending) return {ok:false, reason:'rate-limit'};
      const owned = protocol.ownership(command, player.side, adapter);
      if (!owned.ok) return owned;
      player.seq = command.seq; player.count++;
      const scheduled = {playerId, side:player.side, command, tick:tick+1, order:++order};
      queue.push(scheduled);
      return {ok:true, seq:command.seq, tick:scheduled.tick};
    }
    function step() {
      tick++;
      const commands = queue.splice(0, queue.length);
      for (const item of commands) {
        const owned = protocol.ownership(item.command, item.side, adapter);
        let result = owned;
        if (owned.ok) {
          try {result = adapter.apply(item.side, item.command) === false ? {ok:false, reason:'game-rule-rejected'} : {ok:true};}
          catch (_) {result = {ok:false, reason:'game-rule-error'};}
        }
        acknowledgements.push({playerId:item.playerId, seq:item.command.seq, tick, ...result});
        if (acknowledgements.length > maxPending * 2) acknowledgements.shift();
      }
      adapter.step(1 / hz);
      return tick;
    }
    function advance(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0) return false;
      // Bound each new contribution, but retain the unfinished fixed tick.
      // Capping the sum discarded that remainder whenever a 250 ms batch
      // arrived, permanently slowing the actual simulation clock.
      accumulator = Math.min(accumulator + Math.min(seconds, .25), 1);
      let count = 0;
      while (accumulator + 1e-10 >= 1 / hz && count < 8) {step(); accumulator -= 1 / hz; count++;}
      return count;
    }
    function snapshotFor(playerId) {
      const player = players.get(playerId);
      if (!player) return null;
      // The adapter must return a side-filtered view, never the unrestricted
      // debug snapshot: hidden enemies/resources cannot be sent to the client.
      return {v:protocol.VERSION, tick, hz, side:player.side, state:adapter.snapshotFor(player.side),
        acknowledgements:acknowledgements.filter(a => a.playerId === playerId).map(({playerId:_, ...a}) => a)};
    }
    return Object.freeze({addPlayer, submit, step, advance, snapshotFor,
      stats:() => ({tick, hz, pending:queue.length, players:players.size})});
  }
  return Object.freeze({create});
});
