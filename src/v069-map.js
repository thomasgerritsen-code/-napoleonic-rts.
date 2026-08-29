'use strict';
// ---------- Village layout v2: organic Napoleonic roadside settlements ----------

function stringSeedV069(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function randV069(state) {
  state.value = (Math.imul(state.value, 1664525) + 1013904223) >>> 0;
  return state.value / 4294967296;
}

function roadGeometryV069(road, x, y) {
  let best = null;
  for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1], b = road.points[i];
    const hit = closestPointOnSegmentV066(x, y, a, b);
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const candidate = {
      road,
      segmentIndex:i - 1,
      distance:hit.distance,
      edgeClearance:hit.distance - road.width / 2,
      tx:(b.x - a.x) / len,
      ty:(b.y - a.y) / len,
      px:hit.x,
      py:hit.y
    };
    if (!best || candidate.distance < best.distance) best = candidate;
  }
  return best;
}

function nearestRoadGeometryV069(x, y) {
  let best = null;
  for (const road of ROAD_NETWORK_V066) {
    const geometry = roadGeometryV069(road, x, y);
    if (geometry && (!best || geometry.edgeClearance < best.edgeClearance)) best = geometry;
  }
  return best;
}

function roadsAtJunctionV069(h) {
  const roads = [];
  for (const road of ROAD_NETWORK_V066) {
    const geometry = roadGeometryV069(road, h.x, h.y);
    if (geometry && geometry.distance <= road.width / 2 + 22) roads.push(road);
  }
  return roads;
}

function structureProfileV069(kind, state) {
  switch (kind) {
    case 'farmhouse':
      return {w:42 + randV069(state) * 14, h:23 + randV069(state) * 7, extraOffset:12, spacing:54};
    case 'barn':
      return {w:34 + randV069(state) * 13, h:20 + randV069(state) * 7, extraOffset:32, spacing:48};
    case 'inn':
      return {w:52 + randV069(state) * 9, h:29 + randV069(state) * 6, extraOffset:16, spacing:62};
    case 'chapel':
      return {w:56 + randV069(state) * 8, h:23 + randV069(state) * 5, extraOffset:20, spacing:65};
    default:
      return {w:29 + randV069(state) * 10, h:18 + randV069(state) * 7, extraOffset:5, spacing:42};
  }
}

function clearOfVillageStructuresV069(x, y, w, h, occupied) {
  const radius = Math.hypot(w, h) * .58;
  for (const other of occupied) {
    const otherRadius = Math.hypot(other.w, other.h) * .58;
    if (Math.hypot(x - other.x, y - other.y) < radius + otherRadius + 9) return false;
  }
  return true;
}

function roadsideHouseCandidateV069(h, base, slot, state, w, height, occupied = [], kind = 'cottage') {
  const laneOffset = base.road.width / 2;
  const randomAlong = (randV069(state) - .5) * 20;
  const randomOffset = randV069(state) * 14;
  const footprint = Math.hypot(w, height) / 2;
  const profileExtra = kind === 'barn' ? 32 : kind === 'farmhouse' ? 12 : kind === 'chapel' ? 20 : kind === 'inn' ? 16 : 5;
  let best = null;

  // Sample both sides and both directions of the road. The slot controls the distance from
  // the junction, while attempts introduce deterministic micro-variation and a second row.
  for (let attempt = 0; attempt < 180; attempt++) {
    const side = ((slot + Math.floor(attempt / 45)) % 2 === 0) ? -1 : 1;
    const direction = ((Math.floor(slot / 2) + Math.floor(attempt / 90)) % 2 === 0) ? -1 : 1;
    const alongBand = attempt % 15;
    const depthBand = Math.floor((attempt % 45) / 15);
    const along = direction * (70 + Math.floor(slot / 2) * 38 + alongBand * 8) + randomAlong;
    const offset = laneOffset + 29 + profileExtra + randomOffset + depthBand * 18;
    const x = h.x + base.tx * along - base.ty * side * offset;
    const y = h.y + base.ty * along + base.tx * side * offset;
    if (x < 55 || y < 55 || x > WORLD.width - 55 || y > WORLD.height - 55) continue;

    const nearest = nearestRoadGeometryV069(x, y);
    if (!nearest) continue;
    const clearance = nearest.edgeClearance;
    const footprintClearance = clearance - footprint;
    if (footprintClearance < 10 || clearance > 145) continue;
    if (!clearOfVillageStructuresV069(x, y, w, height, occupied)) continue;

    const desired = footprint + 24 + profileExtra * .45;
    const score = Math.abs(clearance - desired) + Math.abs(alongBand - 4) * 1.2 + depthBand * 4;
    if (score < (best?.score ?? Infinity)) best = {x, y, side, clearance, score};
  }

  return best;
}

function chooseVillageKindsV069(state, junctionRoadCount) {
  const kinds = [];
  kinds.push(junctionRoadCount >= 3 && randV069(state) > .35 ? 'chapel' : 'inn');
  kinds.push('farmhouse', 'cottage', 'cottage', 'barn', 'farmhouse', 'cottage');
  const extra = 5 + Math.floor(randV069(state) * 4);
  for (let i = 0; i < extra; i++) {
    const r = randV069(state);
    kinds.push(r < .20 ? 'barn' : r < .48 ? 'farmhouse' : 'cottage');
  }
  return kinds;
}

function buildVillageSceneryV069() {
  const villages = [];
  for (const h of ROAD_HAMLETS_V066) {
    const state = { value:stringSeedV069(h.name) };
    const junctionRoads = roadsAtJunctionV069(h);
    const fallback = nearestRoadGeometryV069(h.x, h.y);
    if (!fallback) continue;

    const branchBases = (junctionRoads.length ? junctionRoads : [fallback.road])
      .map(road => roadGeometryV069(road, h.x, h.y))
      .filter(Boolean);
    if (!branchBases.length) branchBases.push(fallback);

    const kinds = chooseVillageKindsV069(state, junctionRoads.length);
    const houses = [];
    const slotsByBranch = new Map();

    for (let i = 0; i < kinds.length; i++) {
      const kind = kinds[i];
      const profile = structureProfileV069(kind, state);
      const branchIndex = i === 0 ? 0 : i % branchBases.length;
      const base = branchBases[branchIndex];
      const slot = slotsByBranch.get(branchIndex) || 0;
      slotsByBranch.set(branchIndex, slot + 1);

      const candidate = roadsideHouseCandidateV069(
        h, base, slot, state, profile.w, profile.h, houses, kind
      );
      if (!candidate) continue;

      let angle = Math.atan2(base.ty, base.tx) + (randV069(state) - .5) * .10;
      if (kind === 'barn' && randV069(state) > .62) angle += Math.PI / 2;

      houses.push({
        id:`${h.name.replace(/\s+/g,'-').toLowerCase()}-${i}`,
        kind,
        x:candidate.x,
        y:candidate.y,
        w:profile.w,
        h:profile.h,
        angle,
        side:candidate.side,
        roadName:base.road.name,
        roadClass:base.road.roadClass,
        roadClearance:candidate.clearance,
        yardSeed:(stringSeedV069(h.name) ^ ((i + 1) * 2654435761)) >>> 0
      });
    }

    const kindCounts = houses.reduce((counts, structure) => {
      counts[structure.kind] = (counts[structure.kind] || 0) + 1;
      return counts;
    }, {});

    villages.push({
      name:h.name,
      x:h.x,
      y:h.y,
      junctionRoadCount:junctionRoads.length,
      structureCount:houses.length,
      kindCounts,
      houses
    });
  }
  return villages;
}

const VILLAGE_SCENERY_V069 = Object.freeze(buildVillageSceneryV069().map(v => Object.freeze({
  ...v,
  kindCounts:Object.freeze({...v.kindCounts}),
  houses:Object.freeze(v.houses.map(h => Object.freeze({...h})))
})));

function drawJunctionApronV069(village) {
  if (village.junctionRoadCount < 2) return;
  const radius = 24 + Math.min(5, village.junctionRoadCount) * 6;
  ctx.save();
  ctx.translate(village.x, village.y);
  ctx.fillStyle = 'rgba(201,180,137,.25)';
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 1.22, radius * .86, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(92,72,48,.19)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse((i - 1) * 3, (i - 1) * -2, radius * (.55 + i * .10), radius * (.30 + i * .08), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

// Fallback only. Architecture v2 replaces this with the strict roof-plan renderer after load.
function drawHouseV069(house, index) {
  ctx.save();
  ctx.translate(house.x, house.y);
  ctx.rotate(house.angle);
  ctx.fillStyle = house.kind === 'barn' ? '#60483a' : '#80553f';
  ctx.fillRect(-house.w / 2, -house.h / 2, house.w, house.h);
  ctx.strokeStyle = 'rgba(48,34,27,.82)';
  ctx.lineWidth = 1 / camera.zoom;
  ctx.strokeRect(-house.w / 2, -house.h / 2, house.w, house.h);
  ctx.beginPath();
  ctx.moveTo(-house.w * .42, 0);
  ctx.lineTo(house.w * .42, 0);
  ctx.stroke();
  ctx.restore();
}

// Terrain calls this after roads are rendered. Villages remain visual scenery and do not
// alter navigation/collision; all structures are kept outside road footprints.
drawHamletsV066 = function drawHamletsV069() {
  ctx.save();
  for (const village of VILLAGE_SCENERY_V069) {
    drawJunctionApronV069(village);
    village.houses.forEach(drawHouseV069);
  }
  ctx.restore();
  ctx.textAlign = 'start';
};

const villageKindTotalsV069 = {};
let villageStructureTotalV069 = 0;
let villageMinStructuresV069 = Infinity;
for (const village of VILLAGE_SCENERY_V069) {
  villageStructureTotalV069 += village.houses.length;
  villageMinStructuresV069 = Math.min(villageMinStructuresV069, village.houses.length);
  for (const [kind, count] of Object.entries(village.kindCounts)) {
    villageKindTotalsV069[kind] = (villageKindTotalsV069[kind] || 0) + count;
  }
}
window.__VILLAGE_SCENERY_V2__ = Object.freeze({
  version:'village-layout-v2',
  villageCount:VILLAGE_SCENERY_V069.length,
  structureCount:villageStructureTotalV069,
  minStructures:Number.isFinite(villageMinStructuresV069) ? villageMinStructuresV069 : 0,
  kinds:Object.freeze({...villageKindTotalsV069}),
  navigationUnchanged:true
});

const resetGameV068ForV069 = resetGame;
resetGame = function resetGameV069() {
  V069_MOTION_STATS.sameGroupOverlapSkips = 0;
  V069_MOTION_STATS.combatSoftCorrections = 0;
  V069_MOTION_STATS.roadRetargetFixes = 0;
  resetGameV068ForV069();
  statusEl.textContent = 'Dorpen: grotere organische lintbebouwing met boerderijen, schuren, erven en dorpsankers.';
};
