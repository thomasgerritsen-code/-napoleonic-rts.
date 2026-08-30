'use strict';
// ---------- Architecture v2: network-aware road routing ----------
// Behaviour-compatible extraction of the v0.6.6 route graph. Long marches use
// actual road junctions; short tactical orders remain ordinary field A* routes.

const ACTIVE_ROUTE_NETWORK_V2 = window.NRTS_ROAD_NETWORK_V7 || ROAD_NETWORK_V066;
const ROAD_GRAPH_V066 = new Map();

function roadGraphKeyV066(p) { return `${p.x},${p.y}`; }
function ensureRoadGraphNodeV066(p) {
  const key=roadGraphKeyV066(p);
  if (!ROAD_GRAPH_V066.has(key)) ROAD_GRAPH_V066.set(key,{key,x:p.x,y:p.y,edges:[]});
  return ROAD_GRAPH_V066.get(key);
}

for (const road of ACTIVE_ROUTE_NETWORK_V2) {
  for (let i=1;i<road.points.length;i++) {
    const a=ensureRoadGraphNodeV066(road.points[i-1]);
    const b=ensureRoadGraphNodeV066(road.points[i]);
    const distance=Math.hypot(b.x-a.x,b.y-a.y);
    a.edges.push({to:b.key,road,distance});
    b.edges.push({to:a.key,road,distance});
  }
}

function nearestRoadGraphNodeV066(point,kind) {
  const fieldSpeed=Math.max(1,groupTravelSpeedsV065(kind).field);
  let best=null;
  for (const node of ROAD_GRAPH_V066.values()) {
    const approach=Math.hypot(node.x-point.x,node.y-point.y);
    let fastestRoad=fieldSpeed;
    for (const edge of node.edges) fastestRoad=Math.max(fastestRoad,roadSpeedV066(kind,edge.road));
    const score=approach/fieldSpeed + 22/fastestRoad;
    if (!best || score<best.score) best={node,approach,score};
  }
  return best;
}

function roadGraphRouteV066(startNode,goalNode,kind) {
  if (!startNode || !goalNode) return null;
  const dist=new Map([[startNode.key,0]]), previous=new Map(), open=new Set([startNode.key]);
  let iterations=0;
  while (open.size && iterations++<5000) {
    let current=null,currentCost=Infinity;
    for (const key of open) {
      const d=dist.get(key) ?? Infinity;
      if (d<currentCost) { current=key; currentCost=d; }
    }
    if (current===goalNode.key) break;
    open.delete(current);
    const node=ROAD_GRAPH_V066.get(current);
    if (!node) continue;
    for (const edge of node.edges) {
      const travel=edge.distance/Math.max(1,roadSpeedV066(kind,edge.road));
      const tentative=currentCost+travel;
      if (tentative >= (dist.get(edge.to) ?? Infinity)) continue;
      dist.set(edge.to,tentative);
      previous.set(edge.to,{from:current,edge});
      open.add(edge.to);
    }
  }
  if (!dist.has(goalNode.key)) return null;
  const steps=[];
  let key=goalNode.key;
  while (key!==startNode.key) {
    const prev=previous.get(key);
    if (!prev) return null;
    const node=ROAD_GRAPH_V066.get(key);
    steps.push({x:node.x,y:node.y,road:prev.edge.road});
    key=prev.from;
  }
  steps.reverse();
  return {points:steps.map(s=>({x:s.x,y:s.y})),roads:steps.map(s=>s.road),time:dist.get(goalNode.key)};
}

function directFieldReferenceV066(start,goal,kind) {
  const distance=Math.hypot(goal.x-start.x,goal.y-start.y);
  return {distance,time:distance/Math.max(1,groupTravelSpeedsV065(kind).field)};
}

function buildNetworkRoadCandidateV066(start,goal,kind) {
  const startAccess=nearestRoadGraphNodeV066(start,kind);
  const goalAccess=nearestRoadGraphNodeV066(goal,kind);
  if (!startAccess || !goalAccess) return null;
  const roadRoute=roadGraphRouteV066(startAccess.node,goalAccess.node,kind);
  if (!roadRoute) return null;

  const toRoad=Math.hypot(start.x-startAccess.node.x,start.y-startAccess.node.y)<12
    ? [] : buildRegimentPathV064ForV065(start,{x:startAccess.node.x,y:startAccess.node.y});
  const fromRoad=Math.hypot(goal.x-goalAccess.node.x,goal.y-goalAccess.node.y)<12
    ? [] : buildRegimentPathV064ForV065({x:goalAccess.node.x,y:goalAccess.node.y},goal);
  const path=dedupePathV065([...toRoad,...roadRoute.points,...fromRoad]);
  const stats=pathStatsV065(start,path,kind);
  return {path,stats,startAccess,goalAccess,roadRoute};
}

function pathEndsNearGoalArchitectureV2(path,goal,tolerance=105) {
  if (!Array.isArray(path) || !path.length) return false;
  const last=path[path.length-1];
  return Number.isFinite(last?.x)&&Number.isFinite(last?.y)&&Math.hypot(last.x-goal.x,last.y-goal.y)<=tolerance;
}

function pathWaterSafeArchitectureV2(start,path) {
  if (typeof segmentCrossesBlockedWaterV067!=='function') return true;
  let previous=start;
  for (const point of path||[]) {
    if (segmentCrossesBlockedWaterV067(previous.x,previous.y,point.x,point.y)) return false;
    previous=point;
  }
  return true;
}

function buildExplicitCrossingDetourArchitectureV2(start,goal,kind) {
  if (typeof bankSideV067!=='function' || typeof nearestCrossingV067!=='function' || typeof crossingBankPointV067!=='function') return null;
  const startSide=bankSideV067(start.x,start.y),goalSide=bankSideV067(goal.x,goal.y);
  if (!Number.isFinite(startSide) || !Number.isFinite(goalSide) || startSide*goalSide>=0) return null;
  const crossing=nearestCrossingV067(start.x,start.y,goal.x,goal.y,kind);
  if (!crossing) return null;
  const entry=crossingBankPointV067(crossing,startSide);
  const exit=crossingBankPointV067(crossing,goalSide);
  const toEntry=dedupePathV065(buildRegimentPathV064ForV065(start,entry));
  const fromExit=dedupePathV065(buildRegimentPathV064ForV065(exit,goal));
  if (!pathEndsNearGoalArchitectureV2(toEntry,entry,115) || !pathEndsNearGoalArchitectureV2(fromExit,goal,115)) return null;
  const path=dedupePathV065([...toEntry,{x:entry.x,y:entry.y},{x:crossing.x,y:crossing.y},{x:exit.x,y:exit.y},...fromExit]);
  if (!pathEndsNearGoalArchitectureV2(path,goal,115) || !pathWaterSafeArchitectureV2(start,path)) return null;
  return path;
}

function recoverIncompleteRouteArchitectureV2(start,goal,kind,path) {
  if (pathEndsNearGoalArchitectureV2(path,goal) && pathWaterSafeArchitectureV2(start,path)) return null;
  return buildExplicitCrossingDetourArchitectureV2(start,goal,kind);
}

const buildRegimentPathV065ForArchitectureV2=buildRegimentPathV06;
buildRegimentPathV06=function buildRegimentPathArchitectureV2(start,goal) {
  const kind=planningGroupKindV065 || 'infantry';
  const reference=directFieldReferenceV066(start,goal,kind);
  const basePath=dedupePathV065(buildRegimentPathV064ForV065(start,goal));
  const baseStats=pathStatsV065(start,basePath,kind);
  const baseRecovery=recoverIncompleteRouteArchitectureV2(start,goal,kind,basePath);

  if (reference.distance<ROAD_SEEK_MIN_DISTANCE_V065 || kind==='artillery') {
    const chosen=baseRecovery||basePath;
    const chosenStats=pathStatsV065(start,chosen,kind);
    return attachPlanV065(chosen,{
      choice:baseRecovery?'crossing-recovery':'direct',reason:baseRecovery?'incomplete-water-route':'short-order',kind,
      directTime:reference.time,chosenTime:chosenStats.time,
      detourRatio:chosenStats.distance/Math.max(1,reference.distance),roadShare:chosenStats.roadShare,roadDistance:chosenStats.roadDistance
    });
  }

  const candidate=buildNetworkRoadCandidateV066(start,goal,kind);
  if (!candidate) {
    if (baseRecovery) {
      const stats=pathStatsV065(start,baseRecovery,kind);
      return attachPlanV065(baseRecovery,{choice:'crossing-recovery',reason:'road-network-unreachable',kind,directTime:reference.time,chosenTime:stats.time,detourRatio:stats.distance/Math.max(1,reference.distance),roadShare:stats.roadShare,roadDistance:stats.roadDistance});
    }
    return buildRegimentPathV065ForArchitectureV2(start,goal);
  }

  const detourRatio=candidate.stats.distance/Math.max(1,reference.distance);
  const enoughRoad=candidate.stats.roadShare>=0.28 && candidate.stats.roadDistance>=360;
  const reasonableDetour=detourRatio<=1.65;
  const worthwhileTime=candidate.stats.time<=reference.time*1.08;
  const baseIsRoad=baseStats.roadShare>=0.28 && baseStats.roadDistance>=360;
  const baseWorthwhile=baseStats.time<=reference.time*1.08;
  const useBaseRoad=baseIsRoad && baseWorthwhile && baseStats.time+0.35<candidate.stats.time;
  const chooseRoad=(enoughRoad&&reasonableDetour&&worthwhileTime)||useBaseRoad;

  let chosen=chooseRoad ? (useBaseRoad ? basePath : candidate.path) : basePath;
  let stats=chooseRoad ? (useBaseRoad ? baseStats : candidate.stats) : baseStats;
  const recovered=recoverIncompleteRouteArchitectureV2(start,goal,kind,chosen);
  if (recovered) {
    chosen=recovered;
    stats=pathStatsV065(start,chosen,kind);
    return attachPlanV065(chosen,{
      choice:'crossing-recovery',reason:'chosen-route-incomplete',kind,
      directTime:reference.time,roadTime:candidate.stats.time,chosenTime:stats.time,
      detourRatio:stats.distance/Math.max(1,reference.distance),roadShare:stats.roadShare,roadDistance:stats.roadDistance,
      roadGraph:false
    });
  }

  if (!chooseRoad) {
    return attachPlanV065(chosen,{
      choice:'direct',reason:!reasonableDetour?'detour-too-large':!enoughRoad?'too-little-road':'direct-faster',kind,
      directTime:reference.time,roadTime:candidate.stats.time,chosenTime:stats.time,
      detourRatio,roadShare:stats.roadShare,roadDistance:stats.roadDistance
    });
  }

  return attachPlanV065(chosen,{
    choice:'road',reason:'faster-road-route',kind,
    directTime:reference.time,roadTime:stats.time,chosenTime:stats.time,
    detourRatio:stats.distance/Math.max(1,reference.distance),roadShare:stats.roadShare,roadDistance:stats.roadDistance,
    roadGraph:true
  });
};

window.NRTS_ROAD_GRAPH_V2 = Object.freeze({
  nodes:ROAD_GRAPH_V066.size,
  edges:[...ROAD_GRAPH_V066.values()].reduce((sum,node)=>sum+node.edges.length,0)/2,
  roadCount:ACTIVE_ROUTE_NETWORK_V2.length,
  battlefieldV7:Boolean(window.NRTS_ROAD_NETWORK_V7)
});
