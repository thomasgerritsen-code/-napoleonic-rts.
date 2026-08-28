'use strict';
// ---------- Napoleonic RTS v0.6.5: road-seeking routes + meaningful road speed advantage ----------

const V065_VERSION = '0.6.5';
document.title = `Napoleonic RTS v${V065_VERSION}`;
const v065VersionBadge = document.querySelector('.version');
if (v065VersionBadge) v065VersionBadge.textContent = `v${V065_VERSION}`;

const ROAD_CENTER_Y_V065 = 900;
const ROAD_SEEK_MIN_DISTANCE_V065 = 700;
const ROAD_MAX_DETOUR_RATIO_V065 = 1.55;
const ROAD_MAX_TIME_RATIO_V065 = 1.06;
const ROAD_MIN_SHARE_V065 = 0.28;
let planningGroupKindV065 = 'infantry';

function groupTravelSpeedsV065(kind = 'infantry') {
  if (kind === 'cavalry') return { field: 64, road: 88 };
  if (kind === 'artillery') return { field: 22, road: 28 };
  return { field: 36, road: 54 };
}

// v0.6.4 already smooths toward this desired speed. v0.6.5 makes the road bonus
// strong enough to be tactically meaningful while keeping individual soldiers fast
// enough to catch their moving formation slots.
desiredGroupSpeedV064 = function desiredGroupSpeedV065(reg, march, roadMarch) {
  const members = regimentMembers(reg);
  if (!members.length) return 0;
  const speeds = groupTravelSpeedsV065(groupKindV06(reg));
  const base = roadMarch ? speeds.road : speeds.field;

  let meanError = 0;
  for (const u of members) meanError += Math.hypot(u.x - u.targetX, u.y - u.targetY);
  meanError /= members.length;

  const cohesion = clampV064(1 - Math.max(0, meanError - 18) / 170, 0.58, 1);
  return base * cohesion;
};

function dedupePathV065(points) {
  const out = [];
  for (const p of points) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const last = out[out.length - 1];
    if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 8) out.push({ x: p.x, y: p.y });
  }
  return out;
}

function pathStatsV065(start, points, kind = 'infantry') {
  const speeds = groupTravelSpeedsV065(kind);
  let previous = { x: start.x, y: start.y };
  let distance = 0;
  let roadDistance = 0;
  let time = 0;

  for (const p of points) {
    const dx = p.x - previous.x;
    const dy = p.y - previous.y;
    const segment = Math.hypot(dx, dy);
    if (segment < 0.001) { previous = p; continue; }

    // Sample long segments so a crossing of the 130 px road band is counted accurately.
    const samples = Math.max(1, Math.ceil(segment / 45));
    const sampleDistance = segment / samples;
    for (let i = 0; i < samples; i++) {
      const t = (i + 0.5) / samples;
      const sx = previous.x + dx * t;
      const sy = previous.y + dy * t;
      const onRoad = roadAtV064(sx, sy);
      distance += sampleDistance;
      if (onRoad) roadDistance += sampleDistance;
      time += sampleDistance / (onRoad ? speeds.road : speeds.field);
    }
    previous = p;
  }

  return {
    distance,
    roadDistance,
    roadShare: distance > 0 ? roadDistance / distance : 0,
    time
  };
}

function roadAccessPointV065(point) {
  return {
    x: clampV064(point.x, PATH_CELL / 2, WORLD.width - PATH_CELL / 2),
    y: ROAD_CENTER_Y_V065
  };
}

function attachPlanV065(points, meta) {
  Object.defineProperty(points, 'v065Plan', {
    value: Object.freeze({ ...meta }),
    enumerable: false,
    configurable: true
  });
  return points;
}

const buildRegimentPathV064ForV065 = buildRegimentPathV06;
buildRegimentPathV06 = function buildRegimentPathV065(start, goal) {
  const kind = planningGroupKindV065;
  const speeds = groupTravelSpeedsV065(kind);
  const basePath = dedupePathV065(buildRegimentPathV064ForV065(start, goal));
  const directDistance = Math.hypot(goal.x - start.x, goal.y - start.y);
  const baseStats = pathStatsV065(start, basePath, kind);
  // This is the real comparison baseline: the same displacement travelled through ordinary
  // field terrain at field speed. The older A* may already dip onto the road, so using its
  // travel time as the "direct" baseline would incorrectly hide successful road seeking.
  const directFieldTime = directDistance / Math.max(1, speeds.field);

  if (directDistance < ROAD_SEEK_MIN_DISTANCE_V065) {
    return attachPlanV065(basePath, {
      choice: 'direct',
      reason: 'short-order',
      kind,
      directTime: directFieldTime,
      chosenTime: baseStats.time,
      detourRatio: baseStats.distance / Math.max(1, directDistance),
      roadShare: baseStats.roadShare,
      roadDistance: baseStats.roadDistance
    });
  }

  const entry = roadAccessPointV065(start);
  const exit = roadAccessPointV065(goal);
  const toRoad = roadAtV064(start.x, start.y) ? [] : buildRegimentPathV064ForV065(start, entry);
  const alongRoad = buildRegimentPathV064ForV065(roadAtV064(start.x, start.y) ? start : entry, roadAtV064(goal.x, goal.y) ? goal : exit);
  const fromRoad = roadAtV064(goal.x, goal.y) ? [] : buildRegimentPathV064ForV065(exit, goal);
  const explicitRoadPath = dedupePathV065([...toRoad, ...alongRoad, ...fromRoad]);
  const explicitRoadStats = pathStatsV065(start, explicitRoadPath, kind);

  // The original A* already has a small road preference. If it has independently found a better
  // road route, keep it instead of forcing the hand-built entry/exit route. This also avoids
  // needless zig-zags around buildings close to the road.
  const bestRoadPath = baseStats.roadDistance >= 360 && baseStats.time <= explicitRoadStats.time
    ? basePath
    : explicitRoadPath;
  const bestRoadStats = bestRoadPath === basePath ? baseStats : explicitRoadStats;
  const detourRatio = bestRoadStats.distance / Math.max(1, directDistance);
  const enoughRoad = bestRoadStats.roadShare >= ROAD_MIN_SHARE_V065 && bestRoadStats.roadDistance >= 360;
  const reasonableDetour = detourRatio <= ROAD_MAX_DETOUR_RATIO_V065;
  const worthwhileTime = bestRoadStats.time <= directFieldTime * ROAD_MAX_TIME_RATIO_V065;
  const chooseRoad = enoughRoad && reasonableDetour && worthwhileTime;

  const chosen = chooseRoad ? bestRoadPath : basePath;
  const chosenStats = chooseRoad ? bestRoadStats : baseStats;
  return attachPlanV065(chosen, {
    choice: chooseRoad ? 'road' : 'direct',
    reason: chooseRoad ? 'faster-road-route' : !reasonableDetour ? 'detour-too-large' : !enoughRoad ? 'too-little-road' : 'direct-faster',
    kind,
    directTime: directFieldTime,
    roadTime: bestRoadStats.time,
    chosenTime: chosenStats.time,
    detourRatio,
    roadShare: chosenStats.roadShare,
    roadDistance: chosenStats.roadDistance
  });
};

const orderGroupPathV064ForV065 = orderGroupPathV06;
orderGroupPathV06 = function orderGroupPathV065(reg, x, y, formation = reg.formation, finalFacing = null) {
  const previousKind = planningGroupKindV065;
  planningGroupKindV065 = groupKindV06(reg);
  try {
    orderGroupPathV064ForV065(reg, x, y, formation, finalFacing);
  } finally {
    planningGroupKindV065 = previousKind;
  }
  if (!reg || reg.destroyed) return;
  const plan = reg.path?.v065Plan || null;
  if (reg.marchV063?.v064) reg.marchV063.routePlanV065 = plan;
  reg.routePlanV065 = plan;
};

const issueMoveWithFacingV064ForV065 = issueMoveWithFacingV06;
issueMoveWithFacingV06 = function issueMoveWithFacingV065(x, y, finalFacing = null) {
  issueMoveWithFacingV064ForV065(x, y, finalFacing);
  const groups = selectedRegiments();
  if (!groups.length) return;
  const seekingRoad = groups.some(reg => reg.routePlanV065?.choice === 'road' && !roadAtV064(reg.marchV063?.anchorX ?? reg.targetX, reg.marchV063?.anchorY ?? reg.targetY));
  const onRoad = groups.some(reg => reg.marchV063?.locomotionV064 === 'road-march');
  if (seekingRoad) statusEl.textContent = 'Bataljon zoekt de weg op voor een snellere marsroute.';
  else if (onRoad) statusEl.textContent = 'Bataljon marcheert versneld over de weg.';
};

const resetGameV064ForV065 = resetGame;
resetGame = function resetGameV065() {
  resetGameV064ForV065();
  statusEl.textContent = 'v0.6.5: bataljons zoeken bij langere orders bruikbare wegen op en marcheren daar duidelijk sneller.';
};
