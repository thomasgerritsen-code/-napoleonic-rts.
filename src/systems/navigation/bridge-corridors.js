'use strict';
// ---------- Architecture v2: bridge corridor guidance ----------
// The legacy crossing model knows where bridges are, but a battalion could aim
// diagonally at a bridge mouth. The anchor then touched blocked water beside the
// rectangular passage, was rolled back, and could keep repeating that at a corner.
//
// Latest v0.7.1 routes now use explicit centerline portals. Loose units use the
// same staged corridor, and a non-teleporting recovery waypoint repairs the rare
// case where a battalion still loses forward progress at a bridge mouth.

const NRTS_NAV_V2_TEST_MODE = new URLSearchParams(location.search).get('test');
const NRTS_NAV_V2_ACTIVE = NRTS_NAV_V2_TEST_MODE !== '1' && NRTS_NAV_V2_TEST_MODE !== 'v070';
const NRTS_NAV_V2_BRIDGE = window.NRTS_CONFIG?.navigation?.bridge || Object.freeze({
  approachClearance:18,
  portalMargin:14,
  centerlineTolerance:12,
  looseWaypointTolerance:10,
  stallSeconds:0.70,
  stallMovementEpsilon:0.35
});

const NRTS_NAV_V2_STATS = {
  corridorRoutes:0,
  corridorWaypoints:0,
  looseBridgeRoutes:0,
  bridgeCornerRecoveries:0,
  maxBridgeStallSeconds:0
};

function crossingPointArchitectureV2(c, along, perp = 0) {
  if (typeof crossingPointV068 === 'function') return crossingPointV068(c,along,perp);
  const cos=Math.cos(c.angle),sin=Math.sin(c.angle);
  return {x:c.x+along*cos-perp*sin,y:c.y+along*sin+perp*cos};
}

function crossingLocalArchitectureV2(c,x,y) {
  if (typeof crossingLocalV068 === 'function') return crossingLocalV068(c,x,y);
  const dx=x-c.x,dy=y-c.y,cos=Math.cos(c.angle),sin=Math.sin(c.angle);
  return {along:dx*cos+dy*sin,perp:-dx*sin+dy*cos};
}

function bridgeCorridorArchitectureV2(c, initialSide) {
  const side=initialSide>=0?1:-1;
  const approachDistance=c.length/2+NRTS_NAV_V2_BRIDGE.approachClearance;
  const portalDistance=Math.min(
    Math.max(24,c.length/2-18),
    RIVER_NAV_HALF_WIDTH_V067+NRTS_NAV_V2_BRIDGE.portalMargin
  );
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

function pushUniqueNavigationV2(out,p,epsilon=1.5) {
  const last=out[out.length-1];
  if (!last || Math.hypot(last.x-p.x,last.y-p.y)>epsilon) out.push({x:p.x,y:p.y});
}

function injectBridgeCorridorsArchitectureV2(start,path) {
  if (!Array.isArray(path) || !path.length) return {path,corridors:[]};
  const out=[];
  const corridors=[];
  const used=new Set();
  let previous={x:start.x,y:start.y};

  for (const p of path) {
    const startSide=Math.sign(bankSideV067(previous.x,previous.y));
    const endSide=Math.sign(bankSideV067(p.x,p.y));
    const waterHit=segmentWaterCrossingV067(previous.x,previous.y,p.x,p.y);
    const c=waterHit?.crossing;
    const bankToBank=!!(startSide&&endSide&&startSide!==endSide);

    if (c?.type==='bridge' && bankToBank && !used.has(c.id)) {
      const corridor=bridgeCorridorArchitectureV2(c,startSide);
      const local= crossingLocalArchitectureV2(c,previous.x,previous.y);
      const approachLocal=crossingLocalArchitectureV2(c,corridor.approach.x,corridor.approach.y);
      const stillBeforeApproach=startSide<0
        ? local.along<approachLocal.along-2
        : local.along>approachLocal.along+2;
      if (stillBeforeApproach || Math.abs(local.perp)>NRTS_NAV_V2_BRIDGE.centerlineTolerance) {
        pushUniqueNavigationV2(out,corridor.approach);
        NRTS_NAV_V2_STATS.corridorWaypoints++;
      }
      pushUniqueNavigationV2(out,corridor.entry);
      pushUniqueNavigationV2(out,corridor.exit);
      NRTS_NAV_V2_STATS.corridorWaypoints+=2;
      corridors.push({id:c.id,name:c.name,initialSide:startSide});
      used.add(c.id);
    }

    pushUniqueNavigationV2(out,p);
    previous=p;
  }

  if (corridors.length) NRTS_NAV_V2_STATS.corridorRoutes++;
  return {path:typeof dedupePathV065==='function'?dedupePathV065(out):out,corridors};
}

function reseedMarchAfterCorridorV2(reg) {
  const march=reg?.marchV063;
  if (!march?.v064 || !reg.path?.length) return;
  const first=reg.path[reg.pathIndex||0] || reg.path[0];
  const heading=Math.atan2(first.y-march.anchorY,first.x-march.anchorX);
  if (Number.isFinite(heading)) march.marchFacing=heading;
  if (typeof seedFormationOffsetsV064==='function') {
    march.slotOffsetsV064=seedFormationOffsetsV064(reg,march,march.marchFacing);
  }
  if (typeof setLocomotionTargetsV064==='function') {
    setLocomotionTargetsV064(reg,march,Boolean(roadNetworkAtV066(march.anchorX,march.anchorY)));
  }
}

function looseBridgeStateV2(u,c,initialSide,tx,ty) {
  const signature=`${c.id}:${Math.round(tx)}:${Math.round(ty)}:${initialSide}`;
  if (!u.navigationBridgeV2 || u.navigationBridgeV2.signature!==signature) {
    u.navigationBridgeV2={
      signature,
      crossingId:c.id,
      initialSide,
      phase:'approach'
    };
    NRTS_NAV_V2_STATS.looseBridgeRoutes++;
  }
  return u.navigationBridgeV2;
}

function advanceLooseBridgePhaseV2(u,state,corridor) {
  const tolerance=NRTS_NAV_V2_BRIDGE.looseWaypointTolerance;
  const target=state.phase==='approach'?corridor.approach:
    state.phase==='entry'?corridor.entry:
    state.phase==='exit'?corridor.exit:corridor.clear;
  if (Math.hypot(u.x-target.x,u.y-target.y)>tolerance) return;
  if (state.phase==='approach') state.phase='entry';
  else if (state.phase==='entry') state.phase='exit';
  else if (state.phase==='exit') state.phase='clear';
  else state.phase='done';
}

function bridgeGuideForHolderV2(c,info,march) {
  const corridor=bridgeCorridorArchitectureV2(c,info.initialSide);
  const local=crossingLocalArchitectureV2(c,march.anchorX,march.anchorY);
  const lateral=Math.abs(local.perp);
  const entryLocal=crossingLocalArchitectureV2(c,corridor.entry.x,corridor.entry.y);
  const beforeEntry=info.initialSide<0
    ? local.along<entryLocal.along
    : local.along>entryLocal.along;

  if (!info.entered && (beforeEntry || lateral>NRTS_NAV_V2_BRIDGE.centerlineTolerance)) {
    const approachDistance=Math.hypot(march.anchorX-corridor.approach.x,march.anchorY-corridor.approach.y);
    return approachDistance>28?corridor.approach:corridor.entry;
  }
  return info.entered?corridor.exit:corridor.entry;
}

function nextBridgeRecoveryTargetV2(c,info,march) {
  const corridor=bridgeCorridorArchitectureV2(c,info.initialSide);
  const local=crossingLocalArchitectureV2(c,march.anchorX,march.anchorY);
  if (Math.abs(local.perp)>NRTS_NAV_V2_BRIDGE.centerlineTolerance) {
    return crossingPointArchitectureV2(c,local.along,0);
  }
  const direction=-info.initialSide;
  const progress=local.along*direction;
  if (progress<-corridor.portalDistance+4) return corridor.entry;
  if (progress<corridor.portalDistance-4) return corridor.exit;
  return corridor.clear;
}

function prependBridgeRecoveryWaypointV2(reg,target) {
  const remaining=(reg.path||[]).slice(Math.max(0,reg.pathIndex||0));
  const rebuilt=[];
  pushUniqueNavigationV2(rebuilt,target,.75);
  for (const p of remaining) pushUniqueNavigationV2(rebuilt,p,.75);
  reg.path=rebuilt;
  reg.pathIndex=0;
}

if (NRTS_NAV_V2_ACTIVE) {
  const orderGroupPathBeforeNavigationV2=orderGroupPathV06;
  orderGroupPathV06=function orderGroupPathArchitectureV2(reg,x,y,formation=reg?.formation,finalFacing=null) {
    const members=reg?regimentMembers(reg):[];
    const start=members.length?centroid(members):{x:reg?.targetX??x,y:reg?.targetY??y};
    orderGroupPathBeforeNavigationV2(reg,x,y,formation,finalFacing);
    if (!reg || reg.destroyed || !reg.path?.length || !['infantry','cavalry'].includes(groupKindV06(reg))) return;

    const injected=injectBridgeCorridorsArchitectureV2(start,reg.path);
    if (!injected.corridors.length) return;
    reg.path=injected.path;
    reg.pathIndex=0;
    reg.navigationV2={
      ...(reg.navigationV2||{}),
      bridgeCorridors:injected.corridors,
      bridgeStallSeconds:0,
      bridgeLastRecoveryAt:-999
    };
    if (typeof routeCrossingsForPathV067==='function') reg.routeCrossingsV067=routeCrossingsForPathV067(start,reg.path);
    reseedMarchAfterCorridorV2(reg);
  };

  const looseCrossingTargetBeforeNavigationV2=looseCrossingTargetV067;
  looseCrossingTargetV067=function looseCrossingTargetArchitectureV2(u,tx,ty) {
    const currentSide=bankSideV067(u.x,u.y),targetSide=bankSideV067(tx,ty);
    if (currentSide*targetSide>=0 || Math.abs(targetSide)<RIVER_NAV_HALF_WIDTH_V067*.35) {
      u.navigationBridgeV2=null;
      return looseCrossingTargetBeforeNavigationV2(u,tx,ty);
    }

    let c=WATER_CROSSINGS_V067.find(item=>item.id===u.navigationBridgeV2?.crossingId);
    if (!c) c=nearestCrossingV067(u.x,u.y,tx,ty,u.type==='artillery'?'artillery':u.type==='cavalry'?'cavalry':'infantry');
    if (!c || c.type!=='bridge') {
      u.navigationBridgeV2=null;
      return looseCrossingTargetBeforeNavigationV2(u,tx,ty);
    }

    const initialSide=Math.sign(currentSide)||u.navigationBridgeV2?.initialSide||-Math.sign(targetSide)||-1;
    const state=looseBridgeStateV2(u,c,initialSide,tx,ty);
    const corridor=bridgeCorridorArchitectureV2(c,state.initialSide);
    u.waterCrossingIdV067=c.id;

    advanceLooseBridgePhaseV2(u,state,corridor);
    if (state.phase==='done') {
      u.navigationBridgeV2=null;
      u.waterCrossingIdV067=null;
      return {x:tx,y:ty,detour:false};
    }

    const target=state.phase==='approach'?corridor.approach:
      state.phase==='entry'?corridor.entry:
      state.phase==='exit'?corridor.exit:corridor.clear;
    return {x:target.x,y:target.y,detour:true,crossing:c};
  };

  const updateHolderStateBeforeNavigationV2=updateHolderStateV068;
  updateHolderStateV068=function updateHolderStateArchitectureV2(reg,march,info,c) {
    if (!c || c.type!=='bridge') return updateHolderStateBeforeNavigationV2(reg,march,info,c);

    const guide=bridgeGuideForHolderV2(c,info,march);
    const distance=Math.hypot(march.anchorX-c.x,march.anchorY-c.y);
    if (distance<CROSSING_APPROACH_RADIUS_V068) {
      const desiredHeading=Math.atan2(guide.y-march.anchorY,guide.x-march.anchorX);
      march.marchFacing=turnTowardV064(march.marchFacing,desiredHeading,false,Math.hypot(guide.x-march.anchorX,guide.y-march.anchorY));
    }

    const touches=groupTouchesCrossingV068(reg,c);
    if (touches || crossingPassageContainsV067(c,march.anchorX,march.anchorY)) info.entered=true;
    info.state=info.entered?'crossing':'approach';
    info.forcedColumn=true;
    forceBridgeColumnTargetsV068(reg,march,info);

    const currentSide=Math.sign(bankSideV067(march.anchorX,march.anchorY));
    const clearedOppositeBank=info.entered && currentSide && currentSide!==info.initialSide && distance>=CROSSING_RELEASE_DISTANCE_V068 && !touches;
    if (!clearedOppositeBank) return;

    const trafficState=CROSSING_TRAFFIC_V068.get(c.id);
    if (trafficState) trafficState.holderIds=trafficState.holderIds.filter(id=>id!==reg.id);
    if (!reg.crossingClearedV068) reg.crossingClearedV068=new Set();
    reg.crossingClearedV068.add(c.id);
    reg.crossingTrafficV068={
      crossingId:c.id,
      crossingName:c.name,
      state:'clearing',
      queuePosition:0,
      initialSide:info.initialSide,
      entered:true,
      forcedColumn:true,
      clearUntil:elapsed+0.9
    };
  };

  const updateGroupPathsBeforeNavigationV2=updateGroupPathsV06;
  updateGroupPathsV06=function updateGroupPathsArchitectureV2() {
    const before=new Map();
    for (const reg of regiments) {
      const info=reg?.crossingTrafficV068;
      const march=reg?.marchV063;
      if (!march?.v064 || !info?.forcedColumn || ['waiting','clearing'].includes(info.state)) continue;
      const c=WATER_CROSSINGS_V067.find(item=>item.id===info.crossingId);
      if (c?.type==='bridge') before.set(reg.id,{x:march.anchorX,y:march.anchorY,c,info});
    }

    updateGroupPathsBeforeNavigationV2();

    const dt=Math.max(.001,Number.isFinite(formationDtV063)?formationDtV063:1/60);
    for (const [id,prior] of before) {
      const reg=getRegiment(id)||regiments.find(r=>r.id===id);
      const march=reg?.marchV063;
      const info=reg?.crossingTrafficV068;
      if (!march?.v064 || !info || info.crossingId!==prior.c.id || ['waiting','clearing'].includes(info.state)) continue;
      if (!reg.navigationV2) reg.navigationV2={};
      const moved=Math.hypot(march.anchorX-prior.x,march.anchorY-prior.y);
      if (moved<=NRTS_NAV_V2_BRIDGE.stallMovementEpsilon) reg.navigationV2.bridgeStallSeconds=(reg.navigationV2.bridgeStallSeconds||0)+dt;
      else reg.navigationV2.bridgeStallSeconds=0;
      NRTS_NAV_V2_STATS.maxBridgeStallSeconds=Math.max(NRTS_NAV_V2_STATS.maxBridgeStallSeconds,reg.navigationV2.bridgeStallSeconds||0);

      if ((reg.navigationV2.bridgeStallSeconds||0)<NRTS_NAV_V2_BRIDGE.stallSeconds) continue;
      if (elapsed-(reg.navigationV2.bridgeLastRecoveryAt||-999)<0.5) continue;

      const target=nextBridgeRecoveryTargetV2(prior.c,info,march);
      prependBridgeRecoveryWaypointV2(reg,target);
      march.marchFacing=Math.atan2(target.y-march.anchorY,target.x-march.anchorX);
      if (Number.isFinite(march.speedV064)) march.speedV064=Math.min(march.speedV064,Math.max(12,crossingSpeedCapV067(groupKindV06(reg),prior.c)));
      reg.navigationV2.bridgeStallSeconds=0;
      reg.navigationV2.bridgeLastRecoveryAt=elapsed;
      NRTS_NAV_V2_STATS.bridgeCornerRecoveries++;
    }
  };
}

window.NRTS_NAVIGATION_V2 = Object.freeze({
  active:NRTS_NAV_V2_ACTIVE,
  stats:()=>({...NRTS_NAV_V2_STATS}),
  bridgeCorridor:(crossingId,side=-1)=>{
    const c=WATER_CROSSINGS_V067.find(item=>item.id===crossingId);
    return c?.type==='bridge'?bridgeCorridorArchitectureV2(c,side):null;
  },
  bridgeState:(regimentId)=>{
    const reg=getRegiment(regimentId)||regiments.find(r=>r.id===regimentId);
    const info=reg?.crossingTrafficV068;
    const march=reg?.marchV063;
    const c=info?WATER_CROSSINGS_V067.find(item=>item.id===info.crossingId):null;
    const local=c&&march?crossingLocalArchitectureV2(c,march.anchorX,march.anchorY):null;
    return reg?{
      crossing:c?.name||null,
      trafficState:info?.state||null,
      anchor:march?{x:march.anchorX,y:march.anchorY}:null,
      local,
      stallSeconds:reg.navigationV2?.bridgeStallSeconds||0,
      recoveries:NRTS_NAV_V2_STATS.bridgeCornerRecoveries,
      corridors:reg.navigationV2?.bridgeCorridors||[]
    }:null;
  }
});
