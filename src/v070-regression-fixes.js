'use strict';
// ---------- v0.7.0 regression fixes: single right-drag owner + exclusive bridge deck ----------

// v0.6 installs a canvas-level right-drag gesture while v0.6.3 installs the
// robust window-capture gesture that handles release over HUD overlays as well.
// Let the window gesture remain the single source of truth: it has already
// recorded the mousedown before this listener runs, then we stop the event from
// reaching the older canvas handler. This prevents one drag from issuing two
// competing movement orders.
window.addEventListener('mousedown', e => {
  if (e.button !== 2 || e.target !== canvas || buildMode || rallyPlacementBuilding) return;
  e.preventDefault();
  e.stopPropagation();
}, true);

function crossingQueueBlockedV070(state) {
  if (!state || state.capacity !== 1 || state.holderIds.length) return false;

  // A released battalion remains in bridge-column mode briefly so its rear
  // files can clear the deck. Do not grant the bridge to the next battalion
  // during that clearing window.
  const clearing = regiments.some(reg => {
    const info = reg?.crossingTrafficV068;
    return !reg?.destroyed && info?.crossingId === state.crossing.id && info.state === 'clearing';
  });
  if (clearing) return true;

  // Also protect against a physical tail or unrelated formation still touching
  // the deck. Ignore queued groups themselves: if the first requester already
  // reached the entrance, it must still be eligible to become the holder.
  const queued = new Set(state.queue);
  return regiments.some(reg =>
    !reg?.destroyed &&
    !queued.has(reg.id) &&
    groupTouchesCrossingV068(reg, state.crossing)
  );
}

// Replaces only the promotion policy. Queue registration, hold points, speed
// caps and bridge-column locomotion remain the proven v0.6.8 implementation.
promoteTrafficQueuesV068 = function promoteTrafficQueuesExclusiveV070() {
  for (const state of CROSSING_TRAFFIC_V068.values()) {
    while (state.holderIds.length < state.capacity && state.queue.length) {
      if (crossingQueueBlockedV070(state)) break;

      const id = state.queue.shift();
      const reg = getRegiment(id) || regiments.find(r => r.id === id);
      if (!formalTrafficEligibleV068(reg)) continue;

      state.holderIds.push(id);
      const old = reg.crossingTrafficV068 || {};
      reg.crossingTrafficV068 = {
        ...old,
        crossingId:state.crossing.id,
        crossingName:state.crossing.name,
        state:'approach',
        queuePosition:0,
        initialSide:Number.isFinite(old.initialSide) ? old.initialSide : trafficInitialSideV068(reg, state.crossing),
        entered:!!old.entered,
        forcedColumn:true,
        grantedAt:elapsed
      };
    }

    state.queue.forEach((id, index) => {
      const reg = getRegiment(id) || regiments.find(r => r.id === id);
      if (!reg) return;
      const old = reg.crossingTrafficV068 || {};
      reg.crossingTrafficV068 = {
        ...old,
        crossingId:state.crossing.id,
        crossingName:state.crossing.name,
        state:'waiting',
        queuePosition:index + 1,
        initialSide:Number.isFinite(old.initialSide) ? old.initialSide : trafficInitialSideV068(reg, state.crossing),
        forcedColumn:true
      };
    });
  }
};
