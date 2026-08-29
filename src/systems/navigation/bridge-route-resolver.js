'use strict';
// ---------- Architecture v2: bridge route resolver ----------
// The coarse path can split one river crossing across several waypoints. In that
// case no single segment necessarily reports both a bridge hit and a bank change.
// Resolve the intended crossing from the full route and splice one deterministic
// centreline corridor into the battalion path.

(function installBridgeRouteResolverV2(global) {
  if (!global.NRTS_NAVIGATION_V2?.active) return;

  const stats={resolvedSplitCrossings:0,fallbackCrossings:0};

  function bankSign(point,deadZone=10) {
    const value=bankSideV067(point.x,point.y);
    return Math.abs(value)<=deadZone?0:Math.sign(value);
  }

  function firstNonZeroSide(points,startIndex=0,direction=1) {
    for(let i=startIndex;i>=0&&i<points.length;i+=direction){
      const side=bankSign(points[i]);
      if(side) return side;
    }
    return 0;
  }

  function routeBridgeCandidate(start,path,kind) {
    const points=[{x:start.x,y:start.y},...(path||[]).map(p=>({x:p.x,y:p.y}))];
    if(points.length<2) return null;
    const routeStartSide=firstNonZeroSide(points,0,1);
    const routeEndSide=firstNonZeroSide(points,points.length-1,-1);
    if(!routeStartSide||!routeEndSide||routeStartSide===routeEndSide) return null;

    // First prefer a crossing the existing water audit already saw anywhere on
    // the route, even if the bank change happens in the adjacent segment.
    for(let i=1;i<points.length;i++){
      const hit=segmentWaterCrossingV067(points[i-1].x,points[i-1].y,points[i].x,points[i].y);
      if(hit?.crossing?.type==='bridge') return {crossing:hit.crossing,initialSide:routeStartSide,index:i};
    }

    // Then locate the segment where the route changes bank. If its diagonal cuts
    // a bridge corner, segmentWaterCrossing reports blocked water but no crossing;
    // nearestCrossingV067 gives the legal crossing intended for those endpoints.
    let previousSide=routeStartSide;
    for(let i=1;i<points.length;i++){
      const side=bankSign(points[i])||previousSide;
      if(side!==previousSide){
        const c=nearestCrossingV067(points[i-1].x,points[i-1].y,points[i].x,points[i].y,kind);
        if(c?.type==='bridge') return {crossing:c,initialSide:previousSide,index:i,fallback:true};
      }
      previousSide=side;
    }

    // Last-resort route-wide resolution. This is only reached when waypoints sit
    // inside the river dead-zone and therefore hide the exact bank-change segment.
    const c=nearestCrossingV067(start.x,start.y,points[points.length-1].x,points[points.length-1].y,kind);
    return c?.type==='bridge'?{crossing:c,initialSide:routeStartSide,index:1,fallback:true}:null;
  }

  function corridorPoints(candidate) {
    const corridor=global.NRTS_NAVIGATION_V2.bridgeCorridor(candidate.crossing.id,candidate.initialSide);
    return corridor?{corridor,points:[corridor.approach,corridor.entry,corridor.exit,corridor.clear]}:null;
  }

  function uniquePush(out,p,epsilon=1.5) {
    if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)) return;
    const last=out[out.length-1];
    if(!last||Math.hypot(last.x-p.x,last.y-p.y)>epsilon) out.push({x:p.x,y:p.y});
  }

  function spliceCorridor(start,path,candidate) {
    const data=corridorPoints(candidate);
    if(!data) return null;
    const {corridor}=data;
    const source=Array.isArray(path)?path:[];
    const out=[];
    const initialSide=candidate.initialSide;
    const oppositeSide=-initialSide;
    const approachDistance=corridor.approachDistance;

    // Preserve legal waypoints on the starting bank until the route reaches the
    // bridge approach envelope. This keeps road-network routing intact.
    let resumeIndex=source.length;
    for(let i=0;i<source.length;i++){
      const p=source[i];
      const local=crossingLocalV068(candidate.crossing,p.x,p.y);
      const side=bankSign(p);
      const beforeEnvelope=side===initialSide && Math.abs(local.along)>approachDistance+8;
      if(beforeEnvelope) uniquePush(out,p);
      else { resumeIndex=i; break; }
    }

    for(const p of data.points) uniquePush(out,p);

    // Drop old diagonal/river waypoints. Resume only once the old route is safely
    // on the opposite bank beyond the bridge clear point.
    let resumed=false;
    for(let i=resumeIndex;i<source.length;i++){
      const p=source[i];
      const local=crossingLocalV068(candidate.crossing,p.x,p.y);
      const side=bankSign(p);
      if(!resumed){
        if(side!==oppositeSide || Math.abs(local.along)<approachDistance-4) continue;
        resumed=true;
      }
      uniquePush(out,p);
    }

    // A very short order may end before an old waypoint qualifies as resume point.
    // Always preserve the actual final target if it lies beyond the crossing.
    const final=source[source.length-1];
    if(final) uniquePush(out,final);
    return {path:typeof dedupePathV065==='function'?dedupePathV065(out):out,corridor};
  }

  function reseed(reg) {
    const march=reg?.marchV063;
    if(!march?.v064||!reg.path?.length) return;
    const first=reg.path[0];
    const heading=Math.atan2(first.y-march.anchorY,first.x-march.anchorX);
    if(Number.isFinite(heading)) march.marchFacing=heading;
    if(typeof seedFormationOffsetsV064==='function') march.slotOffsetsV064=seedFormationOffsetsV064(reg,march,march.marchFacing);
    if(typeof setLocomotionTargetsV064==='function') setLocomotionTargetsV064(reg,march,Boolean(roadNetworkAtV066(march.anchorX,march.anchorY)));
  }

  const orderBeforeResolver=orderGroupPathV06;
  orderGroupPathV06=function orderGroupPathBridgeResolverV2(reg,x,y,formation=reg?.formation,finalFacing=null){
    const members=reg?regimentMembers(reg):[];
    const start=members.length?centroid(members):{x:reg?.targetX??x,y:reg?.targetY??y};
    orderBeforeResolver(reg,x,y,formation,finalFacing);
    if(!reg||reg.destroyed||!reg.path?.length||!['infantry','cavalry'].includes(groupKindV06(reg))) return;
    if(reg.navigationV2?.bridgeCorridors?.length) return;

    const kind=groupKindV06(reg);
    const candidate=routeBridgeCandidate(start,reg.path,kind);
    if(!candidate) return;
    const resolved=spliceCorridor(start,reg.path,candidate);
    if(!resolved) return;

    reg.path=resolved.path;
    reg.pathIndex=0;
    reg.navigationV2={
      ...(reg.navigationV2||{}),
      bridgeCorridors:[{id:candidate.crossing.id,name:candidate.crossing.name,initialSide:candidate.initialSide}],
      bridgeStallSeconds:0,
      bridgeLastRecoveryAt:-999
    };
    if(typeof routeCrossingsForPathV067==='function') reg.routeCrossingsV067=routeCrossingsForPathV067(start,reg.path);
    reseed(reg);
    stats.resolvedSplitCrossings++;
    if(candidate.fallback) stats.fallbackCrossings++;
  };

  global.NRTS_BRIDGE_ROUTE_RESOLVER_V2=Object.freeze({stats:()=>({...stats})});
})(window);
