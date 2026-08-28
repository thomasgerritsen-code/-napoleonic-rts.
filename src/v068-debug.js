'use strict';
// ---------- v0.6.8 bridge traffic debug hooks ----------
if (window.__RTS_DEBUG__) {
  const formationStateV067ForV068 = window.__RTS_DEBUG__.formationState?.bind(window.__RTS_DEBUG__);
  if (formationStateV067ForV068) {
    window.__RTS_DEBUG__.formationState = function formationStateV068(id) {
      const base = formationStateV067ForV068(id);
      if (!base) return null;
      const reg = getRegiment(id) || regiments.find(r => r.id === id);
      const info = reg?.crossingTrafficV068;
      return {
        ...base,
        crossingTraffic: info ? {
          crossingId:info.crossingId,
          crossingName:info.crossingName,
          state:info.state,
          queuePosition:info.queuePosition || 0,
          forcedColumn:!!info.forcedColumn,
          entered:!!info.entered
        } : null,
        forcedBridgeColumn:!!info?.forcedColumn
      };
    };
  }

  window.__RTS_DEBUG__.trafficSystemV068 = () => ({
    approachRadius:CROSSING_APPROACH_RADIUS_V068,
    holdDistance:CROSSING_HOLD_DISTANCE_V068,
    queueGap:CROSSING_QUEUE_GAP_V068,
    crossings:[...CROSSING_TRAFFIC_V068.values()].map(state => ({
      id:state.crossing.id,
      name:state.crossing.name,
      type:state.crossing.type,
      capacity:state.capacity,
      holderIds:[...state.holderIds],
      queue:[...state.queue]
    }))
  });

  window.__RTS_DEBUG__.crossingTrafficV068 = id => {
    const state = CROSSING_TRAFFIC_V068.get(id);
    return state ? {
      id:state.crossing.id,
      name:state.crossing.name,
      type:state.crossing.type,
      capacity:state.capacity,
      holderIds:[...state.holderIds],
      queue:[...state.queue],
      occupied:state.holderIds.length,
      waiting:state.queue.length
    } : null;
  };

  window.__RTS_DEBUG__.bridgeDeckOccupancyV068 = id => {
    const state = CROSSING_TRAFFIC_V068.get(id);
    if (!state) return null;
    const groups = regiments.filter(reg => !reg.destroyed && groupTouchesCrossingV068(reg, state.crossing)).map(reg => reg.id);
    return { id, groups, count:groups.length };
  };

  window.__RTS_DEBUG__.trafficForRegimentV068 = id => {
    const reg = getRegiment(id) || regiments.find(r => r.id === id);
    const info = reg?.crossingTrafficV068;
    if (!reg) return null;
    const c = info ? WATER_CROSSINGS_V067.find(item => item.id === info.crossingId) : null;
    return {
      id:reg.id,
      traffic:info ? {...info} : null,
      holdPoint:info && c && info.state === 'waiting' ? queueHoldPointV068(c, info.initialSide, info.queuePosition || 1) : null,
      cleared:[...(reg.crossingClearedV068 || new Set())]
    };
  };
}
