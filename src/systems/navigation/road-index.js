'use strict';
// ---------- Architecture v2: road spatial index ----------
// Behaviour-compatible extraction of the v0.6.6 road lookup. The public legacy
// function name remains available while navigation is migrated subsystem-by-subsystem.

const ROAD_INDEX_CELL_V066 = window.NRTS_CONFIG?.navigation?.roadIndexCell || 180;
const roadSegmentsV066 = [];
const roadBucketsV066 = new Map();

function roadBucketKeyV066(gx, gy) {
  return `${gx},${gy}`;
}

for (const road of ROAD_NETWORK_V066) {
  for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1], b = road.points[i], pad = road.width / 2;
    const seg = { road, a, b, segmentIndex:i - 1 };
    roadSegmentsV066.push(seg);
    const minGX = Math.floor((Math.min(a.x,b.x)-pad)/ROAD_INDEX_CELL_V066);
    const maxGX = Math.floor((Math.max(a.x,b.x)+pad)/ROAD_INDEX_CELL_V066);
    const minGY = Math.floor((Math.min(a.y,b.y)-pad)/ROAD_INDEX_CELL_V066);
    const maxGY = Math.floor((Math.max(a.y,b.y)+pad)/ROAD_INDEX_CELL_V066);
    for (let gx=minGX; gx<=maxGX; gx++) {
      for (let gy=minGY; gy<=maxGY; gy++) {
        const key=roadBucketKeyV066(gx,gy);
        if (!roadBucketsV066.has(key)) roadBucketsV066.set(key,[]);
        roadBucketsV066.get(key).push(seg);
      }
    }
  }
}

roadNetworkAtV066 = function roadNetworkAtArchitectureV2(x,y) {
  const gx=Math.floor(x/ROAD_INDEX_CELL_V066), gy=Math.floor(y/ROAD_INDEX_CELL_V066);
  const candidates=roadBucketsV066.get(roadBucketKeyV066(gx,gy)) || [];
  let best=null;
  for (const seg of candidates) {
    const hit=closestPointOnSegmentV066(x,y,seg.a,seg.b);
    if (hit.distance > seg.road.width/2) continue;
    const priority=ROAD_CLASS_PRIORITY_V066[seg.road.roadClass] || 0;
    const score=hit.distance/Math.max(1,seg.road.width/2)-priority*.08;
    if (!best || score<best.score) best={...hit,road:seg.road,segmentIndex:seg.segmentIndex,score};
  }
  return best;
};

window.NRTS_ROAD_INDEX_V2 = Object.freeze({
  cell:ROAD_INDEX_CELL_V066,
  segments:roadSegmentsV066.length,
  buckets:roadBucketsV066.size
});
