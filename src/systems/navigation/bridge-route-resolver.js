'use strict';
// ---------- Architecture v2: water-crossing route resolver ----------
// The coarse path can split one river crossing across several waypoints or stop
// on the near bank when A* cannot express the full bank-to-bank route. Resolve
// the intended crossing from the real command target and splice one deterministic
// centreline corridor into the battalion path.

(function installBridgeRouteResolverV2(global) {
  if (!global.NRTS_NAVIGATION_V2?.active) return;

  const stats={resolvedSplitCrossings:0,fallbackCrossings:0,incompleteRouteRecoveries:0,fordCorridors:0};

  function bankSign(point,deadZone=10) {
    if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y)) return 0;
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

  function pathEndsNear(path,goal,tolerance=115){
    if(!goal||!Array.isArray(path)||!path.length)return false;
    const last=path[path.length-1];
    return Number.isFinite(last?.x)&&Number.isFinite(last?.y)&&Math.hypot(last.x-goal.x,last.y-goal.y)<=tolerance;
  }

  function routeBridgeCandidate(start,path,kind,goal) {
    const points=[{x:start.x,y:start.y},...(path||[]).map(p=>({x:p.x,y:p.y}))];
    const routeStartSide=firstNonZeroSide(points,0,1)||bankSign(start);
    const pathEndSide=firstNonZeroSide(points,points.length-1,-1);
    const goalSide=bankSign(goal)||pathEndSide;
    if(!routeStartSide||!goalSide||routeStartSide===goalSide) return null;

    for(let i=1;i<points.length;i++){
      const hit=segmentWaterCrossingV067(points[i-1].x,points[i-1].y,points[i].x,points[i].y);
      if(hit?.crossing) return {crossing:hit.crossing,initialSide:routeStartSide,index:i};
    }

    let previousSide=routeStartSide;
    for(let i=1;i<points.length;i++){
      const side=bankSign(points[i])||previousSide;
      if(side!==previousSide){
        const c=nearestCrossingV067(points[i-1].x,points[i-1].y,points[i].x,points[i].y,kind);
        if(c) return {crossing:c,initialSide:previousSide,index:i,fallback:true};
      }
      previousSide=side;
    }

    const c=nearestCrossingV067(start.x,start.y,goal?.x??points[points.length-1]?.x??start.x,goal?.y??points[points.length-1]?.y??start.y,kind);
    return c?{crossing:c,initialSide:routeStartSide,index:Math.max(1,points.length-1),fallback:true,incomplete:!pathEndsNear(path,goal)}:null;
  }

  function genericCrossingCorridor(candidate){
    const c=candidate.crossing;
    const side=candidate.initialSide>=0?1:-1;
    const approachDistance=c.length/2+18;
    const portalDistance=Math.min(Math.max(24,c.length/2-18),RIVER_NAV_HALF_WIDTH_V067+14);
    return {
      crossing:c,
      initialSide:side,
      approach:crossingPointArchitectureV2(c,side*approachDistance,0),
      entry:crossingPointArchitectureV2(c,side*portalDistance,0),
      exit:crossingPointArchitectureV2(c,-side*portalDistance,0),
      clear:crossingPointArchitectureV2(c,-side*approachDistance,0),
      approachDistance,
      portalDistance
    };
  }

  function corridorPoints(candidate) {
    const bridgeCorridor=global.NRTS_NAVIGATION_V2.bridgeCorridor(candidate.crossing.id,candidate.initialSide);
    const corridor=bridgeCorridor||genericCrossingCorridor(candidate);
    return corridor?{corridor,points:[corridor.approach,corridor.entry,corridor.exit,corridor.clear]}:null;
  }

  function uniquePush(out,p,epsilon=1.5) {
    if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)) return;
    const last=out[out.length-1];
    if(!last||Math.hypot(last.x-p.x,last.y-p.y)>epsilon) out.push({x:p.x,y:p.y});
  }

  function appendSafeTail(out,from,goal){
    if(!goal||!from)return false;
    const tail=typeof buildRegimentPathV064ForV065==='function'
      ? (buildRegimentPathV064ForV065(from,goal)||[])
      : [];
    for(const p of tail) uniquePush(out,p);
    const tailEnd=out[out.length-1]||from;
    if(Math.hypot(tailEnd.x-goal.x,tailEnd.y-goal.y)>115)return false;
    uniquePush(out,goal);
    return true;
  }

  function spliceCorridor(start,path,candidate,goal) {
    const data=corridorPoints(candidate);
    if(!data) return null;
    const {corridor}=data;
    const source=Array.isArray(path)?path:[];
    const out=[];
    const initialSide=candidate.initialSide;
    const oppositeSide=-initialSide;
    const approachDistance=corridor.approachDistance;

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

    if(goal&&bankSign(goal)===oppositeSide){
      const from=out[out.length-1]||corridor.clear;
      if(!pathEndsNear(out,goal)) appendSafeTail(out,from,goal);
    }else{
      const final=source[source.length-1];
      if(final) uniquePush(out,final);
    }

    const rebuilt=typeof dedupePathV065==='function'?dedupePathV065(out):out;
    if(goal&&!pathEndsNear(rebuilt,goal))return null;
    return {path:rebuilt,corridor};
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
    const goal={x,y};
    orderBeforeResolver(reg,x,y,formation,finalFacing);
    if(!reg||reg.destroyed||!['infantry','cavalry'].includes(groupKindV06(reg))) return;
    if(reg.navigationV2?.bridgeCorridors?.length) return;

    const kind=groupKindV06(reg);
    const candidate=routeBridgeCandidate(start,reg.path||[],kind,goal);
    if(!candidate) return;
    const resolved=spliceCorridor(start,reg.path||[],candidate,goal);
    if(!resolved) return;

    reg.path=resolved.path;
    reg.pathIndex=0;
    reg.navigationV2={
      ...(reg.navigationV2||{}),
      bridgeCorridors:[{id:candidate.crossing.id,name:candidate.crossing.name,type:candidate.crossing.type,initialSide:candidate.initialSide}],
      bridgeStallSeconds:0,
      bridgeLastRecoveryAt:-999,
      incompleteWaterRouteRecovered:!!candidate.incomplete
    };
    if(typeof routeCrossingsForPathV067==='function') reg.routeCrossingsV067=routeCrossingsForPathV067(start,reg.path);
    reseed(reg);
    stats.resolvedSplitCrossings++;
    if(candidate.fallback) stats.fallbackCrossings++;
    if(candidate.incomplete) stats.incompleteRouteRecoveries++;
    if(candidate.crossing.type==='ford') stats.fordCorridors++;
  };

  global.NRTS_BRIDGE_ROUTE_RESOLVER_V2=Object.freeze({stats:()=>({...stats})});
})(window);
