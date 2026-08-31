'use strict';
// ---------- Architecture v2.1: final crossing target safety ----------
// Last navigation guard in the simulation chain. Existing corridor/recovery systems own
// physical movement; this owner guarantees that the persisted per-unit target exposed to
// the rest of the simulation never points through blocked water after formation updates.
(function installPostCrossingTargetSafetyV1(global){
  const nrts=global.NRTS;
  if(!nrts||typeof segmentCrossesBlockedWaterV067!=='function'||typeof crossingLocalV068!=='function'||typeof crossingPointV068!=='function')return;

  const stats={checked:0,corrected:0,reconstructedContexts:0,rejected:0,regiments:new Set()};
  const padding=Math.max(70,Number(global.NRTS_CONFIG?.navigation?.bridge?.memberReleasePadding)||90);
  const step=Math.max(18,Number(global.NRTS_CONFIG?.navigation?.bridge?.memberAdvanceStep)||28);

  function finiteTarget(u){return Number.isFinite(u?.targetX)&&Number.isFinite(u?.targetY);}
  function targetBlocked(u){return finiteTarget(u)&&segmentCrossesBlockedWaterV067(u.x,u.y,u.targetX,u.targetY);}
  function targetSafeFrom(u,p){return p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&!waterAtV067(p.x,p.y)&&!segmentCrossesBlockedWaterV067(u.x,u.y,p.x,p.y);}

  function crossingContext(reg,u){
    const remembered=u?.bridgeLastCrossingV1;
    if(remembered?.crossingId){
      const c=WATER_CROSSINGS_V067.find(x=>x.id===remembered.crossingId);
      if(c)return{c,initialSide:remembered.initialSide,source:'memory'};
    }

    const hit=typeof segmentWaterCrossingV067==='function'?segmentWaterCrossingV067(u.x,u.y,u.targetX,u.targetY):null;
    let c=hit?.crossing||null;
    if(!c){
      const mx=(u.x+u.targetX)*.5,my=(u.y+u.targetY)*.5;
      let best=null;
      for(const candidate of WATER_CROSSINGS_V067){
        const d=Math.hypot(mx-candidate.x,my-candidate.y);
        if(!best||d<best.d)best={c:candidate,d};
      }
      if(best&&best.d<=620)c=best.c;
    }
    if(!c)return null;

    const current=crossingLocalV068(c,u.x,u.y);
    const final=reg?.finalTarget||{x:reg?.targetX,y:reg?.targetY};
    const finalLocal=Number.isFinite(final?.x)&&Number.isFinite(final?.y)?crossingLocalV068(c,final.x,final.y):null;
    let direction=finalLocal?Math.sign(finalLocal.along-current.along):0;
    if(!direction)direction=Math.sign(crossingLocalV068(c,u.targetX,u.targetY).along-current.along);
    if(!direction)direction=current.along>=0?-1:1;
    stats.reconstructedContexts++;
    return{c,initialSide:-direction,source:'reconstructed'};
  }

  function safeCorridorTarget(u,c,initialSide){
    const direction=initialSide>0?-1:1;
    const q=crossingLocalV068(c,u.x,u.y);
    const radius=Number(TYPES[u.type]?.radius)||7;
    const laneClearance=c.type==='ford'?6:8;
    const safeHalf=Math.max(7,c.width*.5-radius-laneClearance);
    const centeredPerp=Math.max(-safeHalf*.22,Math.min(safeHalf*.22,q.perp));
    const maxAlong=c.length*.5+padding;
    const candidates=[step,Math.max(16,step*.65),10,5];
    for(const amount of candidates){
      const along=Math.max(-maxAlong,Math.min(maxAlong,q.along+direction*amount));
      for(const perp of [centeredPerp,0]){
        const p=crossingPointV068(c,along,perp);
        if(targetSafeFrom(u,p)&&Math.hypot(p.x-u.x,p.y-u.y)>1)return p;
      }
    }
    const centered=crossingPointV068(c,Math.max(-maxAlong,Math.min(maxAlong,q.along)),0);
    return targetSafeFrom(u,centered)?centered:null;
  }

  function sanitize(){
    for(const reg of regiments){
      if(!reg||reg.destroyed)continue;
      for(const u of regimentMembers(reg)){
        if(!u||u.dead||u.type==='artillery'||!finiteTarget(u))continue;
        stats.checked++;
        if(!targetBlocked(u))continue;
        const context=crossingContext(reg,u);
        if(!context){stats.rejected++;continue;}
        const safe=safeCorridorTarget(u,context.c,context.initialSide);
        if(!safe){stats.rejected++;continue;}
        u.targetX=safe.x;u.targetY=safe.y;u.arrivedAtTarget=false;
        u.bridgeLastCrossingV1={crossingId:context.c.id,initialSide:context.initialSide,lastSeenAt:elapsed,reconstructed:context.source==='reconstructed'};
        u.bridgeFollowerSafetyV1={crossingId:context.c.id,correctedAt:elapsed,postTargetGuard:true};
        stats.corrected++;stats.regiments.add(reg.id);
      }
    }
  }

  const previousUpdate=update;
  update=function updateWithPostCrossingTargetSafetyV1(dt){
    previousUpdate(dt);
    if(dt>0&&!gameOver)sanitize();
  };

  const api=Object.freeze({
    version:'post-crossing-target-safety-v1.0',
    persistedTargetGuard:true,
    reconstructedCrossingContext:true,
    stats:()=>({checked:stats.checked,corrected:stats.corrected,reconstructedContexts:stats.reconstructedContexts,rejected:stats.rejected,regiments:stats.regiments.size})
  });
  global.__POST_CROSSING_TARGET_SAFETY_V1__=api;
  nrts.subsystems.register('post-crossing-target-safety',api,{phase:'architecture-v2.1',legacyBridge:false,responsibility:'guarantee persisted follower targets remain water-safe after all formation and movement owners have updated them'});
})(window);
