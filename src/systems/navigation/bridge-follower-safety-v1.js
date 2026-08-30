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
  const stats={corrections:0,resumes:0,regiments:new Set()};

  function safeTargetForMember(u,c,info){
    const direction=-info.initialSide;
    const current=crossingLocalArchitectureV2(c,u.x,u.y);
    const target=crossingLocalArchitectureV2(c,u.targetX,u.targetY);
    const releaseAlong=c.length/2+releasePadding;
    if(Math.abs(current.along)>releaseAlong&&Math.abs(target.along)>releaseAlong)return null;

    const radius=Number(TYPES[u.type]?.radius)||7;
    const safeHalf=Math.max(8,c.width/2-radius-deckClearance);
    const targetBlocked=segmentCrossesBlockedWaterV067(u.x,u.y,u.targetX,u.targetY);
    const targetOutsideDeck=Math.abs(current.along)<=c.length/2+30&&Math.abs(target.perp)>safeHalf;
    if(!targetBlocked&&!targetOutsideDeck){
      if(u.bridgeFollowerSafetyV1){u.bridgeFollowerSafetyV1=null;stats.resumes++;}
      return null;
    }

    let along=target.along;
    if(direction>0)along=Math.max(along,current.along+advanceStep);
    else along=Math.min(along,current.along-advanceStep);
    along=Math.max(-releaseAlong,Math.min(releaseAlong,along));
    let perp=Math.max(-safeHalf,Math.min(safeHalf,target.perp));
    let point=crossingPointArchitectureV2(c,along,perp);

    if(segmentCrossesBlockedWaterV067(u.x,u.y,point.x,point.y)){
      along=current.along+direction*Math.min(18,advanceStep);
      along=Math.max(-releaseAlong,Math.min(releaseAlong,along));
      perp=Math.max(-safeHalf,Math.min(safeHalf,current.perp*.35));
      point=crossingPointArchitectureV2(c,along,perp);
    }
    if(segmentCrossesBlockedWaterV067(u.x,u.y,point.x,point.y)){
      along=current.along+direction*12;
      along=Math.max(-releaseAlong,Math.min(releaseAlong,along));
      point=crossingPointArchitectureV2(c,along,0);
    }
    return point;
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

  const api=Object.freeze({
    version:'bridge-follower-safety-v1',deckCorridor:true,formationResume:true,
    stats:()=>({corrections:stats.corrections,resumes:stats.resumes,regiments:stats.regiments.size}),
    config:Object.freeze({deckClearance,advanceStep,releasePadding})
  });
  global.__BRIDGE_FOLLOWER_SAFETY_V1__=api;
  nrts.subsystems.register('bridge-follower-safety',api,{phase:'architecture-v2.1',legacyBridge:false,responsibility:'keep lagging formation members on the legal bridge deck until direct formation-slot travel is safe again'});
})(window);
