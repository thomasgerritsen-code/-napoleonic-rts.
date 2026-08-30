'use strict';
// ---------- Architecture v2.1: bridge follower safety ----------
// Battalion anchors already use bridge corridors. This owner handles the remaining
// per-soldier case: a rear rank can still receive a diagonal formation slot beyond
// the far bank and have its water guard reject that step forever.
(function installBridgeFollowerSafetyV1(global){
  const nrts=global.NRTS;
  if(!nrts)throw new Error('NRTS foundation runtime must load before bridge follower safety.');
  if(typeof forceBridgeColumnTargetsV068!=='function'||typeof crossingLocalArchitectureV2!=='function')throw new Error('Bridge corridor and traffic systems must load before bridge follower safety.');

  const cfg=global.NRTS_CONFIG?.navigation?.bridge||{};
  const deckClearance=Math.max(4,Number(cfg.memberDeckClearance)||8);
  const advanceStep=Math.max(12,Number(cfg.memberAdvanceStep)||28);
  const releasePadding=Math.max(35,Number(cfg.memberReleasePadding)||90);
  const releaseMemberMargin=Math.max(14,Number(cfg.memberReleaseMargin)||24);
  const stats={corrections:0,resumes:0,preventedEarlyReleases:0,waterRecoveries:0,regiments:new Set()};

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
    const safeHalf=Math.max(8,c.width/2-radius-deckClearance);
    const targetBlocked=segmentCrossesBlockedWaterV067(u.x,u.y,u.targetX,u.targetY);
    const onBridgeLength=Math.abs(current.along)<=c.length/2+30;
    const currentOutsideSafeLane=onBridgeLength&&Math.abs(current.perp)>safeHalf;
    const targetOutsideSafeLane=onBridgeLength&&Math.abs(target.perp)>safeHalf;
    if(!targetBlocked&&!currentOutsideSafeLane&&!targetOutsideSafeLane){
      if(u.bridgeFollowerSafetyV1){u.bridgeFollowerSafetyV1=null;stats.resumes++;}
      return null;
    }

    const centeredPerp=Math.max(-safeHalf*.35,Math.min(safeHalf*.35,current.perp));
    let point=crossingPointArchitectureV2(c,current.along,centeredPerp);
    if(legalSegment(u,point))return point;

    point=crossingPointArchitectureV2(c,current.along,0);
    if(legalSegment(u,point))return point;

    const candidates=[Math.min(18,advanceStep),12,6];
    for(const step of candidates){
      let along=current.along+direction*step;
      along=Math.max(-releaseAlong,Math.min(releaseAlong,along));
      point=crossingPointArchitectureV2(c,along,0);
      if(legalSegment(u,point))return point;
    }
    return {x:u.x,y:u.y};
  }

  const previousForceBridgeColumn=forceBridgeColumnTargetsV068;
  forceBridgeColumnTargetsV068=function forceBridgeColumnTargetsFollowerSafetyV1(reg,march,info){
    previousForceBridgeColumn(reg,march,info);
    const c=WATER_CROSSINGS_V067.find(item=>item.id===info?.crossingId);
    if(!c||c.type!=='bridge'||!info?.forcedColumn)return;
    const facing=crossingHeadingV068(c,info.initialSide);
    let corrected=0;
    for(const u of regimentMembers(reg)){
      if(!u||u.dead||u.type==='artillery')continue;
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

  const previousUpdateHolderState=updateHolderStateV068;
  updateHolderStateV068=function updateHolderStateFollowerReleaseSafetyV1(reg,march,info,c){
    const wasActive=!!(c&&c.type==='bridge'&&info?.forcedColumn&&!['waiting','clearing'].includes(info.state));
    previousUpdateHolderState(reg,march,info,c);
    if(!wasActive||!reg||reg.destroyed||everyLivingMemberSafelyCleared(reg,c,info))return;
    if(reg.crossingTrafficV068?.state!=='clearing')return;

    info.state='crossing';
    info.entered=true;
    info.forcedColumn=true;
    reg.crossingTrafficV068=info;
    const traffic=CROSSING_TRAFFIC_V068.get(c.id);
    if(traffic&&!traffic.holderIds.includes(reg.id))traffic.holderIds.push(reg.id);
    forceBridgeColumnTargetsV068(reg,march,info);
    stats.preventedEarlyReleases++;
    stats.regiments.add(reg.id);
  };

  function recoverBlockedWaterMember(reg,info,u){
    if(!u||u.dead||u.type==='artillery'||!waterAtV067(u.x,u.y))return false;
    const c=WATER_CROSSINGS_V067.find(item=>item.id===info?.crossingId);
    if(!c||c.type!=='bridge')return false;
    const local=crossingLocalArchitectureV2(c,u.x,u.y);
    const direction=-info.initialSide;
    const safeAlong=Math.max(-c.length/2-releaseMemberMargin,Math.min(c.length/2+releaseMemberMargin,local.along));
    const rescue=crossingPointArchitectureV2(c,safeAlong,0);
    u.x=rescue.x;u.y=rescue.y;
    const nextAlong=Math.max(-c.length/2-releasePadding,Math.min(c.length/2+releasePadding,safeAlong+direction*advanceStep));
    const next=crossingPointArchitectureV2(c,nextAlong,0);
    u.targetX=next.x;u.targetY=next.y;u.arrivedAtTarget=false;
    const facing=crossingHeadingV068(c,info.initialSide);
    u.facing=facing;u.formationFacing=facing;
    u.bridgeFollowerSafetyV1={crossingId:c.id,correctedAt:elapsed,recoveredFromWater:true};
    stats.waterRecoveries++;stats.regiments.add(reg.id);
    reg.navigationV2={...(reg.navigationV2||{}),bridgeWaterRecoveries:(reg.navigationV2?.bridgeWaterRecoveries||0)+1};
    return true;
  }

  // The legacy water guard rolls a movement step back when its segment touches
  // blocked water. If a formation member is already a few pixels beyond a bridge
  // corner, that rollback can pin it there forever. Clamp only that exceptional
  // bridge-straggler case back to the centreline, then let normal movement resume.
  const previousUpdateGroupPaths=updateGroupPathsV06;
  updateGroupPathsV06=function updateGroupPathsFollowerWaterRecoveryV1(){
    previousUpdateGroupPaths();
    for(const reg of regiments){
      const info=reg?.crossingTrafficV068;
      if(!reg||reg.destroyed||!info?.forcedColumn)continue;
      let recovered=false;
      for(const u of regimentMembers(reg))recovered=recoverBlockedWaterMember(reg,info,u)||recovered;
      if(recovered)forceBridgeColumnTargetsV068(reg,reg.marchV063,info);
    }
  };

  const api=Object.freeze({
    version:'bridge-follower-safety-v1',deckCorridor:true,formationResume:true,memberReleaseGate:true,waterStragglerRecovery:true,
    stats:()=>({corrections:stats.corrections,resumes:stats.resumes,preventedEarlyReleases:stats.preventedEarlyReleases,waterRecoveries:stats.waterRecoveries,regiments:stats.regiments.size}),
    config:Object.freeze({deckClearance,advanceStep,releasePadding,releaseMemberMargin})
  });
  global.__BRIDGE_FOLLOWER_SAFETY_V1__=api;
  nrts.subsystems.register('bridge-follower-safety',api,{phase:'architecture-v2.1',legacyBridge:false,responsibility:'keep lagging formation members on the legal bridge deck until direct formation-slot travel is safe again'});
})(window);
