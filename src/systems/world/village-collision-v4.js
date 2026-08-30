'use strict';
// ---------- Village collision v4: global plot separation + canonical scenery obstacles ----------
(function installVillageCollisionV4(global) {
  const nrts = global.NRTS;
  if (!nrts) throw new Error('NRTS foundation runtime must load before village collision normalization.');
  if (typeof VILLAGE_SCENERY_V069 === 'undefined') throw new Error('Village layout must load before village collision normalization.');

  const sourceVillages = global.__VILLAGE_LAYOUT_V6_DATA__ || VILLAGE_SCENERY_V069;
  const sourceVersion = global.__VILLAGE_LAYOUT_V6__?.version || 'village-layout-v2';

  const YARD_MULTIPLIERS = Object.freeze({
    cottage:[2.0,2.35],
    farmhouse:[2.15,2.65],
    barn:[1.8,2.0],
    inn:[2.0,2.15],
    chapel:[1.8,2.5]
  });

  function plotGeometry(house) {
    const [mw,mh] = YARD_MULTIPLIERS[house.kind] || YARD_MULTIPLIERS.cottage;
    const w = house.w * mw;
    const h = house.h * mh;
    return {w,h,radius:Math.hypot(w,h) * .5 + 5};
  }

  function clearOfRoads(candidate) {
    if (typeof nearestRoadGeometryV069 !== 'function') return true;
    const nearest = nearestRoadGeometryV069(candidate.x,candidate.y);
    if (!nearest) return true;
    const roofRadius = Math.hypot(candidate.w,candidate.h) * .5;
    const roofEdgeGap = nearest.edgeClearance - roofRadius;
    return roofEdgeGap >= 9 && nearest.edgeClearance <= 185;
  }

  function withinWorld(candidate, radius) {
    const margin = radius + 10;
    return candidate.x >= margin && candidate.y >= margin &&
      candidate.x <= WORLD.width - margin && candidate.y <= WORLD.height - margin;
  }

  function clearOfGameplayBuildings(candidate, radius) {
    if (typeof buildings === 'undefined') return true;
    for (const b of buildings) {
      if (!b || b.dead) continue;
      const br = Math.hypot(b.w,b.h) * .5 + 12;
      if (Math.hypot(candidate.x-b.x,candidate.y-b.y) < radius + br) return false;
    }
    return true;
  }

  function clearOfOccupied(candidate, radius, occupied, gap = 10) {
    for (const other of occupied) {
      if (Math.hypot(candidate.x-other.x,candidate.y-other.y) < radius + other.plotRadius + gap) return false;
    }
    return true;
  }

  function safeCandidate(candidate, radius, occupied) {
    return withinWorld(candidate,radius) &&
      clearOfRoads(candidate) &&
      clearOfGameplayBuildings(candidate,radius) &&
      clearOfOccupied(candidate,radius,occupied);
  }

  function normalizeStructure(house, occupied, sequence) {
    const plot = plotGeometry(house);
    const base = {...house,plotW:plot.w,plotH:plot.h,plotRadius:plot.radius};
    if (safeCandidate(base,plot.radius,occupied)) return {...base,collisionShift:0};

    const phase = ((sequence * 137.508) % 360) * Math.PI / 180;
    for (let ring=1; ring<=14; ring++) {
      const distance = ring * 18;
      const steps = 16 + ring * 2;
      for (let step=0; step<steps; step++) {
        const angle = phase + step / steps * Math.PI * 2;
        const candidate = {
          ...base,
          x:house.x + Math.cos(angle) * distance,
          y:house.y + Math.sin(angle) * distance,
          collisionShift:distance
        };
        if (safeCandidate(candidate,plot.radius,occupied)) return candidate;
      }
    }
    return null;
  }

  const occupied = [];
  const villages = [];
  let shiftedCount = 0;
  let removedCount = 0;
  let sequence = 0;

  for (const village of sourceVillages) {
    const houses = [];
    for (const house of village.houses) {
      const normalized = normalizeStructure(house,occupied,sequence++);
      if (!normalized) {
        removedCount++;
        continue;
      }
      if (normalized.collisionShift > 0) shiftedCount++;
      const frozen = Object.freeze(normalized);
      houses.push(frozen);
      occupied.push(frozen);
    }
    const kindCounts = houses.reduce((counts,house) => {
      counts[house.kind] = (counts[house.kind] || 0) + 1;
      return counts;
    },{});
    const zoneCounts = houses.reduce((counts,house) => {
      const zone=house.zone || 'legacy';
      counts[zone]=(counts[zone]||0)+1;
      return counts;
    },{});
    villages.push(Object.freeze({
      ...village,
      structureCount:houses.length,
      kindCounts:Object.freeze(kindCounts),
      zoneCounts:Object.freeze(zoneCounts),
      houses:Object.freeze(houses)
    }));
  }

  const VILLAGE_SCENERY_V4_LOCAL = Object.freeze(villages);
  global.__VILLAGE_SCENERY_V4_DATA__ = VILLAGE_SCENERY_V4_LOCAL;
  global.VILLAGE_SCENERY_V4 = VILLAGE_SCENERY_V4_LOCAL;

  let overlapCount = 0;
  let minPlotGap = Infinity;
  for (let i=0;i<occupied.length;i++) {
    for (let j=i+1;j<occupied.length;j++) {
      const a=occupied[i],b=occupied[j];
      const gap=Math.hypot(a.x-b.x,a.y-b.y)-a.plotRadius-b.plotRadius;
      minPlotGap=Math.min(minPlotGap,gap);
      if (gap < 9.999) overlapCount++;
    }
  }

  const sample = occupied[0] ? Object.freeze({
    x:occupied[0].x,
    y:occupied[0].y,
    kind:occupied[0].kind,
    zone:occupied[0].zone || null,
    plotRadius:occupied[0].plotRadius
  }) : null;

  const normalizedZones=occupied.reduce((counts,h)=>{
    const zone=h.zone||'legacy';counts[zone]=(counts[zone]||0)+1;return counts;
  },{});

  const api = Object.freeze({
    version:'village-collision-v4',
    sourceVersion,
    villageCount:villages.length,
    structureCount:occupied.length,
    shiftedCount,
    removedCount,
    overlapCount,
    minPlotGap:Number.isFinite(minPlotGap) ? minPlotGap : null,
    sampleObstacle:sample,
    zones:Object.freeze(normalizedZones),
    globalSeparation:true,
    includesRenderedYards:true
  });

  global.__VILLAGE_COLLISION_V4__ = api;
  nrts.subsystems.register('village-collision-v4',api,{
    phase:'architecture-v2',
    legacyBridge:false,
    responsibility:'global scenery plot separation and canonical village collision obstacle data'
  });
})(window);
