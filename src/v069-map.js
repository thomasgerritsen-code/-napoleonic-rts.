'use strict';
// ---------- Napoleonic RTS v0.6.9: realistic junctions + roadside villages ----------

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

function nearestRoadGeometryV069(x, y) {
  let best = null;
  for (const road of ROAD_NETWORK_V066) {
    for (let i = 1; i < road.points.length; i++) {
      const hit = closestPointOnSegmentV066(x, y, road.points[i - 1], road.points[i]);
      const edgeClearance = hit.distance - road.width / 2;
      if (!best || edgeClearance < best.edgeClearance) {
        const a = road.points[i - 1], b = road.points[i];
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        best = {
          road,
          segmentIndex:i - 1,
          distance:hit.distance,
          edgeClearance,
          tx:(b.x - a.x) / len,
          ty:(b.y - a.y) / len,
          px:hit.x,
          py:hit.y
        };
      }
    }
  }
  return best;
}

function roadsAtJunctionV069(h) {
  const roads = [];
  for (const road of ROAD_NETWORK_V066) {
    let best = Infinity;
    for (let i = 1; i < road.points.length; i++) {
      best = Math.min(best, closestPointOnSegmentV066(h.x, h.y, road.points[i - 1], road.points[i]).distance);
    }
    if (best <= road.width / 2 + 18) roads.push(road);
  }
  return roads;
}

function buildVillageSceneryV069() {
  const villages = [];
  for (const h of ROAD_HAMLETS_V066) {
    const base = nearestRoadGeometryV069(h.x, h.y);
    if (!base) continue;
    const state = { value:stringSeedV069(h.name) };
    const count = 5 + Math.floor(randV069(state) * 3);
    const houses = [];
    for (let i = 0; i < count; i++) {
      const side = i % 2 ? 1 : -1;
      const along = (i - (count - 1) / 2) * (38 + randV069(state) * 12) + (randV069(state) - .5) * 22;
      let offset = base.road.width / 2 + 34 + randV069(state) * 34;
      let x = h.x + base.tx * along - base.ty * side * offset;
      let y = h.y + base.ty * along + base.tx * side * offset;
      let clearance = nearestRoadGeometryV069(x, y)?.edgeClearance ?? 999;
      let attempts = 0;
      while (clearance < 16 && attempts++ < 6) {
        offset += 18;
        x = h.x + base.tx * along - base.ty * side * offset;
        y = h.y + base.ty * along + base.tx * side * offset;
        clearance = nearestRoadGeometryV069(x, y)?.edgeClearance ?? 999;
      }
      houses.push({
        x,
        y,
        w:20 + randV069(state) * 10,
        h:14 + randV069(state) * 7,
        angle:Math.atan2(base.ty, base.tx) + (randV069(state) - .5) * .16,
        side,
        roadClearance:clearance
      });
    }
    villages.push({
      name:h.name,
      x:h.x,
      y:h.y,
      junctionRoadCount:roadsAtJunctionV069(h).length,
      houses
    });
  }
  return villages;
}

const VILLAGE_SCENERY_V069 = Object.freeze(buildVillageSceneryV069().map(v => Object.freeze({
  ...v,
  houses:Object.freeze(v.houses.map(h => Object.freeze({...h})))
})));

function drawJunctionApronV069(village) {
  if (village.junctionRoadCount < 2) return;
  const radius = 22 + Math.min(5, village.junctionRoadCount) * 5;
  ctx.save();
  ctx.translate(village.x, village.y);
  ctx.fillStyle = 'rgba(201,180,137,.30)';
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 1.15, radius * .82, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(92,72,48,.22)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse((i - 1) * 3, (i - 1) * -2, radius * (.55 + i * .10), radius * (.30 + i * .08), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHouseV069(house, index) {
  ctx.save();
  ctx.translate(house.x, house.y);
  ctx.rotate(house.angle);
  ctx.fillStyle = index % 3 === 0 ? 'rgba(190,173,141,.96)' : index % 3 === 1 ? 'rgba(175,156,126,.96)' : 'rgba(205,188,154,.96)';
  ctx.fillRect(-house.w/2, -house.h/2, house.w, house.h);
  ctx.fillStyle = index % 2 ? 'rgba(103,67,48,.96)' : 'rgba(119,76,49,.96)';
  ctx.beginPath();
  ctx.moveTo(-house.w*.58, -house.h*.34);
  ctx.lineTo(0, -house.h*.85);
  ctx.lineTo(house.w*.58, -house.h*.34);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(75,59,43,.92)';
  ctx.fillRect(-2.5, 1, 5, house.h/2 - 1);
  ctx.strokeStyle = 'rgba(103,83,58,.62)';
  ctx.lineWidth = 1;
  const fenceY = house.side > 0 ? house.h/2 + 8 : -house.h/2 - 8;
  ctx.beginPath();
  ctx.moveTo(-house.w*.75, fenceY);
  ctx.lineTo(house.w*.75, fenceY);
  ctx.stroke();
  ctx.restore();
}

// v0.6.7 terrain still calls drawHamletsV066 after the roads are rendered. Replace that
// renderer with junction wear + roadside houses, and intentionally draw no village labels.
drawHamletsV066 = function drawHamletsV069() {
  ctx.save();
  for (const village of VILLAGE_SCENERY_V069) {
    drawJunctionApronV069(village);
    village.houses.forEach(drawHouseV069);
  }
  ctx.restore();
  ctx.textAlign = 'start';
};

const resetGameV068ForV069 = resetGame;
resetGame = function resetGameV069() {
  V069_MOTION_STATS.sameGroupOverlapSkips = 0;
  V069_MOTION_STATS.combatSoftCorrections = 0;
  V069_MOTION_STATS.roadRetargetFixes = 0;
  resetGameV068ForV069();
  statusEl.textContent = 'v0.6.9: vloeiender wegmars en gevechtscontact; drummers blijven achter de lijn en dorpen liggen naast de weg.';
};
