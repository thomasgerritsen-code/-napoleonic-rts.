'use strict';
// ---------- Architecture v2: stable road -> field transition ----------
(function installRoadExitStabilityV2(global) {
  const STABILIZE_SECONDS = 0.55;
  const EXIT_SPEED_FACTOR = 0.82;

  function currentWaypointV2(reg) {
    const path = reg?.path || [];
    return path[reg?.pathIndex || 0] || null;
  }

  function headingToWaypointV2(reg, march) {
    const waypoint = currentWaypointV2(reg);
    if (!waypoint || !march) return null;
    const dx = waypoint.x - march.anchorX;
    const dy = waypoint.y - march.anchorY;
    if (Math.hypot(dx, dy) < 0.001) return null;
    return Math.atan2(dy, dx);
  }

  function stabilizeRoadExitV2(reg, march, onRoad, now) {
    if (!reg || !march?.v064) return;
    const kind = groupKindV06(reg);
    if (kind !== 'infantry' && kind !== 'cavalry') return;

    if (typeof march.wasOnRoadV2 !== 'boolean') {
      march.wasOnRoadV2 = onRoad;
      return;
    }

    if (march.wasOnRoadV2 && !onRoad) {
      const heading = headingToWaypointV2(reg, march);
      if (Number.isFinite(heading)) march.marchFacing = heading;
      if (Number.isFinite(march.speedV064)) march.speedV064 *= EXIT_SPEED_FACTOR;
      march.roadExitStabilizeUntilV2 = now + STABILIZE_SECONDS;
      march.roadExitHeadingV2 = heading;
      march.roadExitTransitionsV2 = (march.roadExitTransitionsV2 || 0) + 1;
    } else if (!onRoad && now < (march.roadExitStabilizeUntilV2 || 0)) {
      // While the road column expands back into its field formation, keep the
      // authoritative anchor pointed at the actual route. Slot rotation must not
      // be allowed to steer the battalion into an orbit around the road edge.
      const heading = headingToWaypointV2(reg, march);
      if (Number.isFinite(heading)) {
        march.marchFacing = heading;
        march.roadExitHeadingV2 = heading;
      }
    }

    march.wasOnRoadV2 = onRoad;
  }

  const updateGroupPathsBeforeRoadExitV2 = updateGroupPathsV06;
  updateGroupPathsV06 = function updateGroupPathsRoadExitStableV2() {
    for (const reg of regiments) {
      if (!reg || reg.destroyed) continue;
      const march = reg.marchV063;
      if (!march?.v064) continue;
      const kind = groupKindV06(reg);
      if (kind !== 'infantry' && kind !== 'cavalry') continue;
      const onRoad = roadAtV064(march.anchorX, march.anchorY);
      stabilizeRoadExitV2(reg, march, onRoad, elapsed);
    }
    return updateGroupPathsBeforeRoadExitV2();
  };

  global.NRTS_ROAD_EXIT_V2 = Object.freeze({
    stabilize: stabilizeRoadExitV2,
    headingToWaypoint: headingToWaypointV2,
    stabilizeSeconds: STABILIZE_SECONDS
  });
})(window);
