'use strict';
// ---------- v0.7.0 regression fixes: robust right-drag + exclusive bridge deck ----------

// v0.6 installs a canvas-level right-drag gesture while v0.6.3 installs the
// robust window-capture gesture.  The minimap visually overlays part of the
// battlefield, so a battlefield right-drag can start on that overlay even
// though its screen coordinates came from worldToScreen().  Right-drag is not a
// minimap camera gesture (left click remains the minimap control), so treat the
// minimap as a transparent order surface for the right button.
window.addEventListener('mousedown', e => {
  if (e.button !== 2 || buildMode || rallyPlacementBuilding) return;
  const minimapEl = document.getElementById('minimap');
  const orderSurface = e.target === canvas || e.target === minimapEl;
  if (!orderSurface) return;

  // The v0.6.3 window listener has already initialized canvas gestures because
  // it was registered earlier.  When the minimap is the event target it skips
  // that initialization, so do it here explicitly.
  if (!rightDragInputV063) {
    rightDragInputV063 = {
      sx:e.clientX,
      sy:e.clientY,
      ex:e.clientX,
      ey:e.clientY,
      moved:false
    };
    suppressContextMenuUntil = performance.now() + 1600;
  }

  // Keep the older v0.6 canvas handler from issuing a second competing order.
  e.preventDefault();
  e.stopPropagation();
}, true);

// v0.7 centers march-column offsets around the complete battalion.  The two
// command/support figures then sit roughly 45 world units ahead of the anchor.
// A 190-unit legacy hold point therefore lets the front file enter the bridge
// deck (deck envelope is about 151 units from its center) while another group
// still owns it.  Keep the complete waiting column outside the physical deck.
const queueHoldPointV068BeforeV070 = queueHoldPointV068;
queueHoldPointV068 = function queueHoldPointV070(c, initialSide, queuePosition = 1) {
  if (!c || c.type !== 'bridge') return queueHoldPointV068BeforeV070(c, initialSide, queuePosition);
  const bridgeHoldDistance = Math.max(CROSSING_HOLD_DISTANCE_V068, c.length / 2 + 110);
  const distance = bridgeHoldDistance + Math.max(0, queuePosition - 1) * CROSSING_QUEUE_GAP_V068;
  return crossingPointV068(c, initialSide * distance, 0);
};

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

  // Once no holder exists, make sure the previous formation has physically
  // left the deck before handing the crossing to the next queued battalion.
  const queued = new Set(state.queue);
  return regiments.some(reg =>
    !reg?.destroyed &&
    !queued.has(reg.id) &&
    groupTouchesCrossingV068(reg, state.crossing)
  );
}

// Replaces only the promotion policy. Queue registration, speed caps and
// bridge-column locomotion remain the v0.6.8 implementation.
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
