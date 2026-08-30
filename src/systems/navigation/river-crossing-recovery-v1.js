'use strict';
// ---------- Architecture v2.1: local river / crossing stall recovery ----------
// Owns only short-range recovery around rivers, bridges and fords. It never
// replaces the regiment's selected crossing or final route.
(function installRiverCrossingRecoveryV1(global){
  if(!global.NRTS||typeof moveToward!=='function')return;
  const cfg=global.NRTS_CONFIG?.navigation?.bridge||{};
  const unitStallSeconds=Math.max(.7,Number(cfg.unitStallSeconds)||1.15);
  const groupStallSeconds=Math.max(.8,Number(cfg.stallSeconds)||1.35);
  const movementEpsilon=Math.max(.08,Number(cfg.stallMovementEpsilon)||.35);
  const recoveryDuration=.95,nearRadius=560,unitContextRadius=300;
  const unitState=new Map(),groupState=new Map();
  const stats={unitRecoveries:0,groupRecoveries:0,blockedTargetRecoveries:0,bridgeRecoveries:0,fordRecoveries:0,unsafeRecoveryRejected:0,maxUnitStallSeconds:0,maxGroupStallSeconds:0,unitContextRecoveries:0};
  function livingMembers(reg){return reg?regimentMembers(reg).filter(u=>!u.dead):[];}
  function inferredInfo(reg,c,x,y){const final=reg.finalTarget||{x:reg.targetX,y:reg.targetY},side=Math.sign(bankSideV067(x,y)),finalSide=Math.sign(bankSideV067(final?.x??c.x,final?.y??c.y));return{crossingId:c.id,initialSide:side||(finalSide?-finalSide:-1),entered:side&&finalSide?side===finalSide:false,state:'approach',forcedColumn:true};}
  function activeCrossing(reg){
    const info=reg?.crossingTrafficV068;if(info?.forcedColumn&&['approach','crossing','clearing'].includes(info.state)){const c=WATER_CROSSINGS_V067.find(x=>x.id===info.crossingId);if(c)return{c,info};}
    const members=livingMembers(reg);if(!members.length)return null;const center=centroid(members),cleared=reg?.crossingClearedV068 instanceof Set?reg.crossingClearedV068:new Set();let best=null;
    for(const route of reg?.routeCrossingsV067||[]){if(!route?.id||cleared.has(route.id))continue;const c=WATER_CROSSINGS_V067.find(x=>x.id===route.id);if(!c)continue;const d=Math.hypot(center.x-c.x,center.y-c.y);if(d<=nearRadius&&(!best||d<best.d))best={c,d};}
    return best?{c:best.c,info:inferredInfo(reg,best.c,center.x,center.y)}:null;
  }
  function unitCrossingContext(reg,u,prior,groupContext){
    if(groupContext&&Math.hypot(u.x-groupContext.c.x,u.y-groupContext.c.y)<=nearRadius)return groupContext;
    if(prior?.crossingId){const remembered=WATER_CROSSINGS_V067.find(c=>c.id===prior.crossingId);if(remembered&&Math.hypot(u.x-remembered.x,u.y-remembered.y)<=nearRadius)return{c:remembered,info:inferredInfo(reg,remembered,u.x,u.y),remembered:true};}
    let best=null;for(const c of WATER_CROSSINGS_V067){const d=Math.hypot(u.x-c.x,u.y-c.y);if(d<=unitContextRadius&&(!best||d<best.d))best={c,d};}return best?{c:best.c,info:inferredInfo(reg,best.c,u.x,u.y),inferred:true}:null;
  }
  function local(c,x,y){return typeof crossingLocalV068==='function'?crossingLocalV068(c,x,y):crossingLocalArchitectureV2(c,x,y);}
  function point(c,along,perp=0){return typeof crossingPointV068==='function'?crossingPointV068(c,along,perp):crossingPointArchitectureV2(c,along,perp);}
  function passageHalfWidth(c){return Math.max(8,c.width*.5-5);}
  function safeRecoveryTarget(c,initialSide,x,y,entered=false){const q=local(c,x,y),direction=initialSide>0?-1:1,lateralLimit=passageHalfWidth(c),centered=Math.max(-lateralLimit*.45,Math.min(lateralLimit*.45,q.perp));const approachEdge=c.length*.5+20,portal=Math.max(20,c.length*.5-14);let along=q.along;if(Math.abs(q.perp)>lateralLimit){along+=direction*22;return point(c,along,0);}const progress=q.along*direction;if(!entered&&progress<-portal+3)along=direction*-portal;else if(progress<portal-3)along+=direction*34;else along=Math.max(-approachEdge,Math.min(approachEdge,along+direction*42));return point(c,along,centered);}
  function targetIsSafe(u,target){return!!target&&Number.isFinite(target.x)&&Number.isFinite(target.y)&&!waterAtV067(target.x,target.y)&&!segmentCrossesBlockedWaterV067(u.x,u.y,target.x,target.y);}
  function assignUnitRecovery(u,c,info,reason,unitOwned=false){const target=safeRecoveryTarget(c,info.initialSide,u.x,u.y,!!info.entered);if(!targetIsSafe(u,target)){const q=local(c,u.x,u.y),centered=point(c,q.along,0);if(!targetIsSafe(u,centered)){stats.unsafeRecoveryRejected++;return false;}u.riverCrossingRecoveryV1={x:centered.x,y:centered.y,crossingId:c.id,until:elapsed+recoveryDuration,reason};}else u.riverCrossingRecoveryV1={x:target.x,y:target.y,crossingId:c.id,until:elapsed+recoveryDuration,reason};u.localAvoidanceV2=null;u.arrivedAtTarget=false;stats.unitRecoveries++;if(unitOwned)stats.unitContextRecoveries++;if(reason==='blocked-target')stats.blockedTargetRecoveries++;if(c.type==='ford')stats.fordRecoveries++;else stats.bridgeRecoveries++;return true;}
  function recoverGroupAnchor(reg,c,info){const march=reg?.marchV063;if(!march?.v064||!Array.isArray(reg.path))return false;const target=safeRecoveryTarget(c,info.initialSide,march.anchorX,march.anchorY,!!info.entered),previous={x:march.anchorX,y:march.anchorY};if(segmentCrossesBlockedWaterV067(previous.x,previous.y,target.x,target.y)||waterAtV067(target.x,target.y)){stats.unsafeRecoveryRejected++;return false;}const remaining=reg.path.slice(Math.max(0,reg.pathIndex||0));reg.path=[target,...remaining.filter((p,i)=>i>0||Math.hypot(p.x-target.x,p.y-target.y)>2)];reg.pathIndex=0;march.marchFacing=Math.atan2(target.y-march.anchorY,target.x-march.anchorX);march.speedV064=Math.max(12,Math.min(Number(march.speedV064)||12,crossingSpeedCapV067(groupKindV06(reg),c)));if(!reg.navigationV2)reg.navigationV2={};reg.navigationV2.bridgeLastRecoveryAt=elapsed;reg.navigationV2.bridgeStallSeconds=0;stats.groupRecoveries++;if(c.type==='ford')stats.fordRecoveries++;else stats.bridgeRecoveries++;return true;}
  function sampleRegiment(reg,dt){
    if(!reg||reg.destroyed)return;const members=livingMembers(reg);if(!members.length)return;const center=centroid(members),groupContext=activeCrossing(reg);
    if(groupContext){const{c,info}=groupContext;let gs=groupState.get(reg.id);if(!gs||gs.crossingId!==c.id){gs={crossingId:c.id,x:center.x,y:center.y,stall:0,lastRecovery:-999};groupState.set(reg.id,gs);}else{const moved=Math.hypot(center.x-gs.x,center.y-gs.y);gs.x=center.x;gs.y=center.y;gs.stall=moved<=movementEpsilon?gs.stall+dt:0;stats.maxGroupStallSeconds=Math.max(stats.maxGroupStallSeconds,gs.stall);if(gs.stall>=groupStallSeconds&&elapsed-gs.lastRecovery>.65){if(recoverGroupAnchor(reg,c,info))gs.lastRecovery=elapsed;gs.stall=0;}}}else groupState.delete(reg.id);
    for(const u of members){
      const prior=unitState.get(u.id),context=unitCrossingContext(reg,u,prior,groupContext);if(!context){unitState.delete(u.id);continue;}const{c,info}=context;let s=prior;
      if(!s||s.crossingId!==c.id){s={crossingId:c.id,x:u.x,y:u.y,stall:0,lastRecovery:-999};unitState.set(u.id,s);}else{const moved=Math.hypot(u.x-s.x,u.y-s.y);s.x=u.x;s.y=u.y;s.stall=moved<=movementEpsilon?s.stall+dt:0;stats.maxUnitStallSeconds=Math.max(stats.maxUnitStallSeconds,s.stall);}
      const hasTarget=Number.isFinite(u.targetX)&&Number.isFinite(u.targetY),targetDistance=hasTarget?Math.hypot(u.targetX-u.x,u.targetY-u.y):0;
      const targetBlocked=hasTarget&&segmentCrossesBlockedWaterV067(u.x,u.y,u.targetX,u.targetY),behindAnchor=Math.hypot(u.x-center.x,u.y-center.y)>48;
      const movementDemand=targetDistance>14&&!u.arrivedAtTarget;
      const stalledNearCrossing=movementDemand&&behindAnchor&&s.stall>=unitStallSeconds;
      if((targetBlocked||stalledNearCrossing)&&elapsed-s.lastRecovery>.55){if(assignUnitRecovery(u,c,info,targetBlocked?'blocked-target':'stalled-follower',!groupContext))s.lastRecovery=elapsed;s.stall=0;}
      if(!movementDemand&&!targetBlocked&&s.stall>unitStallSeconds) s.stall=0;
    }
  }
  const previousMoveToward=moveToward;
  moveToward=function moveTowardWithRiverCrossingRecoveryV1(u,tx,ty,dt,speed=TYPES[u.type].speed){const r=u?.riverCrossingRecoveryV1;if(r&&elapsed<=r.until){const d=Math.hypot(u.x-r.x,u.y-r.y);if(d>5){u.arrivedAtTarget=false;return previousMoveToward(u,r.x,r.y,dt,speed);}u.riverCrossingRecoveryV1=null;}else if(r)u.riverCrossingRecoveryV1=null;return previousMoveToward(u,tx,ty,dt,speed);};
  const previousUpdate=update;update=function updateWithRiverCrossingRecoveryV1(dt){if(dt>0&&!gameOver)for(const reg of regiments)sampleRegiment(reg,dt);previousUpdate(dt);};
  const api=Object.freeze({version:'river-crossing-recovery-v1.2',localOnly:true,preservesSelectedCrossing:true,unitRecovery:true,laggingUnitContext:true,movementDemandGuard:true,groupAnchorRecovery:true,stats:()=>({...stats,trackedUnits:unitState.size,trackedGroups:groupState.size})});global.__RIVER_CROSSING_RECOVERY_V1__=api;
  if(global.NRTS.subsystems.has('river-crossing-recovery'))global.NRTS.services?.provide?.('river-crossing-recovery','src/systems/navigation/river-crossing-recovery-v1.js',api,{generation:25,legacyBridge:false});else global.NRTS.subsystems.register('river-crossing-recovery',api,{phase:'architecture-v2.1',legacyBridge:false,responsibility:'recover stalled battalions and lagging followers locally around rivers, bridges and fords without changing their selected crossing'});
})(window);
