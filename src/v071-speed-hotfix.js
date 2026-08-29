'use strict';
// ---------- Napoleonic RTS v0.7.1 hotfix: battalion/loose-unit speed parity ----------
//
// Older formation code still used historical group-speed tables (36 field / 56
// chaussée for infantry) while loose infantry used TYPES.infantry.speed (57) plus
// the same terrain road multiplier (1.24 on a chaussée). The v0.7.1 anchor solver
// made that mismatch very visible. From here on infantry/cavalry group anchors and
// loose members share one canonical speed source.

const V071_ROAD_MULTIPLIERS = Object.freeze({ chaussee:1.24, secondary:1.13, track:1.05 });

function canonicalBaseSpeedV071(kind) {
  if (kind === 'cavalry') return TYPES.cavalry.speed;
  if (kind === 'infantry') return TYPES.infantry.speed;
  return null;
}

function canonicalRoadMultiplierV071(roadOrClass) {
  const roadClass = typeof roadOrClass === 'string' ? roadOrClass : roadOrClass?.roadClass;
  return V071_ROAD_MULTIPLIERS[roadClass] || V071_ROAD_MULTIPLIERS.secondary;
}

function canonicalTerrainSpeedV071(kind, x, y) {
  const base = canonicalBaseSpeedV071(kind);
  if (!Number.isFinite(base)) return null;
  const hit = roadNetworkAtV066(x, y);
  if (hit) return base * canonicalRoadMultiplierV071(hit.road);
  return base * fieldSpeedFactorV066(x, y, kind);
}

if (typeof V071_ACTIVE !== 'undefined' && V071_ACTIVE) {
  const legacyGroupTravelSpeedsV071 = groupTravelSpeedsV065;
  const legacyRoadSpeedV071 = roadSpeedV066;
  const legacyDesiredGroupSpeedV071 = desiredGroupSpeedV064;

  // Route planning and actual movement now use the same speed figures as a loose
  // soldier. Artillery is deliberately left on its existing rigid-battery model.
  groupTravelSpeedsV065 = function groupTravelSpeedsV071Parity(kind = 'infantry') {
    const base = canonicalBaseSpeedV071(kind);
    if (!Number.isFinite(base)) return legacyGroupTravelSpeedsV071(kind);
    return { field:base, road:base * V071_ROAD_MULTIPLIERS.chaussee };
  };

  roadSpeedV066 = function roadSpeedV071Parity(kind, roadOrClass) {
    const base = canonicalBaseSpeedV071(kind);
    if (!Number.isFinite(base)) return legacyRoadSpeedV071(kind, roadOrClass);
    return base * canonicalRoadMultiplierV071(roadOrClass);
  };

  desiredGroupSpeedV064 = function desiredGroupSpeedV071Parity(reg, march, roadMarch) {
    const kind = groupKindV06(reg);
    if (!['infantry','cavalry'].includes(kind)) return legacyDesiredGroupSpeedV071(reg, march, roadMarch);

    const members = regimentMembers(reg);
    if (!members.length) return 0;

    let speed = canonicalTerrainSpeedV071(kind, march.anchorX, march.anchorY) || 0;

    // The damped-slot solver can recover ordinary formation lag without slowing
    // the whole battalion. Only genuinely disordered formations (>48 mean units
    // from their slots) begin to lose anchor speed, avoiding the old feedback loop
    // where normal follower lag made the battalion permanently slower.
    let meanError = 0;
    for (const u of members) meanError += Math.hypot(u.x-u.targetX, u.y-u.targetY);
    meanError /= members.length;
    const cohesion = clampV064(1 - Math.max(0, meanError-48) / 280, 0.82, 1);
    speed *= cohesion;

    // Preserve all v0.6.7/v0.6.8 crossing restrictions. Speed parity applies to
    // ordinary terrain; a bridge/ford or a queue is still an intentional choke point.
    const crossing = crossingAtV067(march.anchorX, march.anchorY);
    if (crossing) speed = Math.min(speed, crossingSpeedCapV067(kind, crossing));

    const info = reg?.crossingTrafficV068;
    if (!info || info.state === 'clearing') return speed;
    const trafficCrossing = WATER_CROSSINGS_V067.find(c => c.id === info.crossingId);
    if (!trafficCrossing) return speed;

    if (info.state === 'waiting') {
      const hold = queueHoldPointV068(trafficCrossing, info.initialSide, info.queuePosition || 1);
      const distance = Math.hypot(march.anchorX-hold.x, march.anchorY-hold.y);
      if (distance <= 34) return 0;
      return Math.min(speed, kind === 'cavalry' ? 42 : 30);
    }
    return Math.min(speed, crossingSpeedCapV067(kind, trafficCrossing));
  };

  window.__V071_SPEED_PARITY__ = Object.freeze({
    version:'0.7.1-hotfix',
    infantryField:TYPES.infantry.speed,
    infantryChaussee:TYPES.infantry.speed * V071_ROAD_MULTIPLIERS.chaussee,
    cavalryField:TYPES.cavalry.speed,
    cavalryChaussee:TYPES.cavalry.speed * V071_ROAD_MULTIPLIERS.chaussee
  });
}
