'use strict';
// ---------- Architecture v2.1: crossing follower safety ----------
// Battalion anchors use crossing corridors. This owner keeps individual formation
// members inside the legal bridge/ford lane until their normal slot is water-safe.
(function installBridgeFollowerSafetyV1(global){
  const nrts=global.NRTS;
  if(!nrts)throw new Error('NRTS foundation runtime must load before bridge follower safety.');
  if(typeof forceBridgeColumnTargetsV068!=='function'||typeof crossingLocalArchitectureV2!=='function')throw new Error('Bridge corridor and traffic systems must load before bridge follower safety.');

  const cfg=global.NRTS_CONFIG?.navigation?.bridge||{};
  const deckClearance=Math.max(4,Number(cfg.memberDeckClearance)||8);
  const advanceStep=Math.max(12,Number(cfg.memberAdvanceStep)||28);
  const releasePadding=Math.max(35,Number(cfg.memberReleasePadding)||90);
  const releaseMemberMargin=Math.max(14,Number(cfg.memberReleaseMargin)||24);
  const stats={corrections:0,resumes:0,preventedEarlyReleases:0,acceptedLocalAxisReleases:0,waterRecoveries:0,postReleaseGuards:0,motionGuards:0,forwardCorrections:0,regiments:new Set()};

  function legalSegment(u,point){
    return point&&Number.isFinite(point.x)&&Number.isFinite(point.y)&&
      !segmentCrossesBlockedWaterV067(u.x,u.y,point.x,point.y);
  }

  function safeTargetForMember(u,c,info){
    const direction=-info.initialSide;
    const current=crossingLocalArchitectureV2(c,u.x,u.y);
    const target=crossingLocalArchitectureV2(c,u.targetX,u.targetY);
    const releaseAlong=c.length/2+releasePadding;
    if(Math.abs(current.along)>releaseAlong&&Math.abs(target.along)>releaseAlong)return null;

    const radius=Number(TYPES[u.type]?.radius)||7;
    const laneClearance=c.type==='ford'?Math.max(6,deckClearance*.75):deckClearance;
    const safeHalf=Math.max(8,c.width/2-radius-laneClearance);
    const targetBlocked=segmentCrossesBlockedWaterV067(u.x,u.y,u.targetX,u.targetY);
    const onCrossingLength=Math.abs(current.along)<=c.length/2+30;
    const currentOutsideSafeLane=onCrossingLength&&Math.abs(current.perp)>safeHalf;
    const targetOutsideSafeLane=onCrossingLength&&Math.abs(target.perp)>safeHalf;
    if(!targetBlocked&&!currentOutsideSafeLane&&!targetOutsideSafeLane){
      if(u.bridgeFollowerSafetyV1){u.bridgeFollowerSafetyV1=null;stats.resumes++;}
      return null;
    }

    const centeredPerp=Math.max(-safeHalf*.35,Math.min(safeHalf*.35,current.perp));
    if(currentOutsideSafeLane){
      let point=crossingPointArchitectureV2(c,current.along,centeredPerp);
      if(legalSegment(u,point)&&Math.hypot(point.x-u.x,point.y-u.y)>1.5)return point;
      point=crossingPointArchitectureV2(c,current.along,0);
      if(legalSegment(u,point)&&Math.hypot(point.x-u.x,point.y-u.y)>1.5)return point;
    }

    const candidates=[advanceStep,Math.max(18,advanceStep*.72),12,6];
    for(const step of candidates){
      let along=current.along+direction*step;
      along=Math.max(-releaseAlong,Math.min(releaseAlong,along));
      let point=crossingPointArchitectureV2(c,along,centeredPerp);
      if(legalSegment(u,point)&&Math.hypot(point.x-u.x,point.y-u.y)>1.5){stats.forwardCorrections++;return point;}
      point=crossingPointArchitectureV2(c,along,0);
      if(legalSegment(u,point)&&Math.hypot(point.x-u.x,point.y-u.y)>1.5){stats.forwardCorrections++;return point;}
    }

    let point=crossingPointArchitectureV2(c,current.along,0);
    if(legalSegment(u,point)&&Math.hypot(point.x-u.x,point.y-u.y)>1.5)return point;
    return {x:u.x,y:u.y};
  }

  function rememberCrossing(u,c,info){
    u.bridgeLastCrossingV1={crossingId:c.id,initialSide:info.initialSide,lastSeenAt:elapsed};
  }

  const previousForceBridgeColumn=forceBridgeColumnTargetsV068;
  forceBridgeColumnTargetsV068=function forceBridgeColumnTargetsFollowerSafetyV1(reg,march,info){
    previousForceBridgeColumn(reg,march,info);
    const c=WATER_CROSSINGS_V067.find(item=>item.id===info?.crossingId);
    if(!c||!info?.forcedColumn)return;
    const facing=crossingHeadingV068(c,info.initialSide);
    let corrected=0;
    for(const u of regimentMembers(reg)){
      if(!u||u.dead||u.type==='artillery')continue;
      rememberCrossing(u,c,info);
      const safe=safeTargetForMember(u,c,info);
      if(!safe)continue;
      u.targetX=safe.x;u.targetY=safe.y;u.arrivedAtTarget=false;
      u.formationFacing=facing;u.facing=facing;
      u.bridgeFollowerSafetyV1={crossingId:c.id,correctedAt:elapsed};
      corrected++;
    }
    if(corrected){
      stats.corrections+=corrected;stats.regiments.add(reg.id);
      reg.navigationV2={...(reg.navigationV2||{}),bridgeFollowerCorrections:(reg.navigationV2?.bridgeFollowerCorrections||0)+corrected};
    }
  };

  function everyLivingMemberSafelyCleared(reg,c,info){
    const direction=-info.initialSide;
    const clearAlong=c.length/2+releaseMemberMargin;
    const members=regimentMembers(reg).filter(u=>u&&!u.dead);
    if(!members.length)return true;
    return members.every(u=>{
      if(waterAtV067(u.x,u.y))return false;
      const local=crossingLocalArchitectureV2(c,u.x,u.y);
      return local.along*direction>clearAlong;
    });
  }
  function anyLivingMemberInWater(reg){
    return regimentMembers(reg).some(u=>u&&!u.dead&&waterAtV067(u.x,u.y));
  }

  const previousUpdateHolderState=updateHolderStateV068;
  updateHolderStateV068=function updateHolderStateFollowerReleaseSafetyV1(reg,march,info,c){
    const wasActive=!!(c&&info?.forcedColumn&&!['waiting','clearing'].includes(info.state));
    previousUpdateHolderState(reg,march,info,c);
    if(!wasActive||!reg||reg.destroyed||everyLivingMemberSafelyCleared(reg,c,info))return;
    const released=reg.crossingTrafficV068;
    if(released?.state!=='clearing')return;

    if(released.localAxisRelease&&!anyLivingMemberInWater(reg)){
      stats.acceptedLocalAxisReleases++;stats.regiments.add(reg.id);
      return;
    }

    info.state='crossing';info.entered=true;info.forcedColumn=true;
    reg.crossingTrafficV068=info;
    const traffic=CROSSING_TRAFFIC_V068.get(c.id);
    if(traffic&&!traffic.holderIds.includes(reg.id))traffic.holderIds.push(reg.id);
    forceBridgeColumnTargetsV068(reg,march,info);
    stats.preventedEarlyReleases++;stats.regiments.add(reg.id);
  };

  function crossingMemory(u){
    const memory=u?.bridgeLastCrossingV1;
    if(!memory)return null;
    const c=WATER_CROSSINGS_V067.find(item=>item.id===memory.crossingId);
    return c?{memory,c}:null;
  }

  function recoveryPoint(u,c,memory){
    const direction=-memory.initialSide;
    const local=crossingLocalArchitectureV2(c,u.x,u.y);
    const radius=Number(TYPES[u.type]?.radius)||7;
    const laneClearance=c.type==='ford'?Math.max(6,deckClearance*.75):deckClearance;
    const safeHalf=Math.max(8,c.width/2-radius-laneClearance);
    const centeredPerp=Math.max(-safeHalf*.25,Math.min(safeHalf*.25,local.perp));
    const maxAlong=c.length/2+releasePadding;
    for(const step of [advanceStep,Math.max(16,advanceStep*.65),10,5]){
      const along=Math.max(-maxAlong,Math.min(maxAlong,local.along+direction*step));
      for(const perp of [centeredPerp,0]){
        const point=crossingPointArchitectureV2(c,along,perp);
        if(legalSegment(u,point)&&Math.hypot(point.x-u.x,point.y-u.y)>1)return point;
      }
    }
    const centered=crossingPointArchitectureV2(c,Math.max(-maxAlong,Math.min(maxAlong,local.along)),0);
    return legalSegment(u,centered)?centered:{x:u.x,y:u.y};
  }

  function recoverBlockedWaterMember(reg,u){
    if(!u||u.dead||u.type==='artillery')return false;
    const remembered=crossingMemory(u);
    if(!remembered)return false;
    const {memory,c}=remembered;
    const local=crossingLocalArchitectureV2(c,u.x,u.y);
    const targetBlocked=Number.isFinite(u.targetX)&&Number.isFinite(u.targetY)&&segmentCrossesBlockedWaterV067(u.x,u.y,u.targetX,u.targetY);
    const nearExit=Math.abs(local.along)<=c.length/2+releasePadding;
    const inWater=waterAtV067(u.x,u.y);

    if(!nearExit&&!inWater&&!targetBlocked){u.bridgeLastCrossingV1=null;return false;}
    if(!inWater&&!targetBlocked)return false;

    if(inWater){
      const rescue=crossingPointArchitectureV2(c,Math.max(-c.length/2-releaseMemberMargin,Math.min(c.length/2+releaseMemberMargin,local.along)),0);
      u.x=rescue.x;u.y=rescue.y;stats.waterRecoveries++;
    }
    const next=recoveryPoint(u,c,memory);
    u.targetX=next.x;u.targetY=next.y;u.arrivedAtTarget=false;
    const facing=crossingHeadingV068(c,memory.initialSide);
    u.facing=facing;u.formationFacing=facing;
    u.bridgeFollowerSafetyV1={crossingId:c.id,correctedAt:elapsed,postRelease:true};
    stats.postReleaseGuards++;stats.regiments.add(reg.id);
    reg.navigationV2={...(reg.navigationV2||{}),bridgeWaterRecoveries:(reg.navigationV2?.bridgeWaterRecoveries||0)+(inWater?1:0)};
    return true;
  }

  const previousUpdateGroupPaths=updateGroupPathsV06;
  updateGroupPathsV06=function updateGroupPathsFollowerWaterRecoveryV1(){
    previousUpdateGroupPaths();
    for(const reg of regiments){
      if(!reg||reg.destroyed)continue;
      let recovered=false;
      for(const u of regimentMembers(reg))recovered=recoverBlockedWaterMember(reg,u)||recovered;
      const info=reg.crossingTrafficV068;
      if(recovered&&info?.forcedColumn)forceBridgeColumnTargetsV068(reg,reg.marchV063,info);
    }
  };

  // Final movement owner for a remembered crossing. The generic smooth follower is
  // allowed to create its normal formation slot first; if that direct segment would
  // cut through blocked water, this guard replaces the actual unit target and motion
  // with a forward corridor waypoint for this tick. Normal formation resumes as soon
  // as the direct slot segment is safe.
  const previousMoveToward=moveToward;
  moveToward=function moveTowardWithCrossingFollowerGuardV1(u,tx,ty,dt,speed=TYPES[u.type].speed){
    if(!u||u.dead||u.type==='artillery')return previousMoveToward(u,tx,ty,dt,speed);
    const remembered=crossingMemory(u);
    const blocked=remembered&&Number.isFinite(tx)&&Number.isFinite(ty)&&segmentCrossesBlockedWaterV067(u.x,u.y,tx,ty);
    if(!blocked)return previousMoveToward(u,tx,ty,dt,speed);
    const {memory,c}=remembered;
    const safe=recoveryPoint(u,c,memory);
    u.targetX=safe.x;u.targetY=safe.y;u.arrivedAtTarget=false;
    u.bridgeFollowerSafetyV1={crossingId:c.id,correctedAt:elapsed,motionGuard:true};
    stats.motionGuards++;stats.regiments.add(u.regimentId||0);
    return previousMoveToward(u,safe.x,safe.y,dt,speed);
  };

  nrts.events.on('game:reset',()=>{});

  const api=Object.freeze({
    version:'bridge-follower-safety-v1.2',deckCorridor:true,fordCorridor:true,formationResume:true,memberReleaseGate:true,localAxisReleaseCompatible:true,waterStragglerRecovery:true,postReleaseGuard:true,motionGuard:true,forwardProgressGuard:true,
    stats:()=>({corrections:stats.corrections,resumes:stats.resumes,preventedEarlyReleases:stats.preventedEarlyReleases,acceptedLocalAxisReleases:stats.acceptedLocalAxisReleases,waterRecoveries:stats.waterRecoveries,postReleaseGuards:stats.postReleaseGuards,motionGuards:stats.motionGuards,forwardCorrections:stats.forwardCorrections,regiments:stats.regiments.size}),
    config:Object.freeze({deckClearance,advanceStep,releasePadding,releaseMemberMargin})
  });
  global.__BRIDGE_FOLLOWER_SAFETY_V1__=api;
  nrts.subsystems.register('bridge-follower-safety',api,{phase:'architecture-v2.1',legacyBridge:false,responsibility:'keep lagging formation members inside legal bridge and ford lanes through target assignment and final follower motion until their direct formation-slot segment is water-safe'});
})(window);
