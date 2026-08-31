'use strict';
// ---------- Architecture v2.1: crossing progress authority ----------
// Determines crossing completion in the local bridge/ford coordinate system.
// This avoids deadlocks caused by the meandering river bank-side approximation.
(function installCrossingProgressV1(global){
  if(!global.NRTS||typeof updateHolderStateV068!=='function')return;
  const progressState=new Map();
  const stats={updates:0,localAxisReleases:0,releaseWithTrailingFollowers:0,stalledAxisReleases:0};

  function normalReleaseThreshold(c){
    return c.length/2+Math.max(28,Math.min(48,CROSSING_RELEASE_DISTANCE_V068-c.length/2));
  }
  function safeFallbackThreshold(c){
    // Once the battalion anchor is clearly past the crossing midpoint, forcing the
    // complete column to stay active can become self-locking on angled bridges.
    // Follower-safety owns the remaining tail after this point.
    return Math.max(48,Math.min(c.length/2-24,c.length*.24));
  }
  function release(reg,c,info,touches,reason){
    const state=CROSSING_TRAFFIC_V068.get(c.id);
    if(state)state.holderIds=state.holderIds.filter(id=>id!==reg.id);
    if(!reg.crossingClearedV068)reg.crossingClearedV068=new Set();
    reg.crossingClearedV068.add(c.id);
    if(touches)stats.releaseWithTrailingFollowers++;
    if(reason==='axis-stall')stats.stalledAxisReleases++;
    stats.localAxisReleases++;
    progressState.delete(reg.id);
    reg.crossingTrafficV068={
      crossingId:c.id,
      crossingName:c.name,
      state:'clearing',
      queuePosition:0,
      initialSide:info.initialSide,
      entered:true,
      forcedColumn:true,
      clearUntil:elapsed+.9,
      localAxisRelease:true,
      localAxisReleaseReason:reason
    };
  }

  updateHolderStateV068=function updateHolderStateWithLocalProgressV1(reg,march,info,c){
    stats.updates++;
    const desiredHeading=crossingHeadingV068(c,info.initialSide);
    const distance=Math.hypot(march.anchorX-c.x,march.anchorY-c.y);
    if(distance<CROSSING_APPROACH_RADIUS_V068)march.marchFacing=turnTowardV064(march.marchFacing,desiredHeading,false,distance);

    const touches=groupTouchesCrossingV068(reg,c);
    const anchorInPassage=crossingPassageContainsV067(c,march.anchorX,march.anchorY);
    if(touches||anchorInPassage)info.entered=true;
    info.state=info.entered?'crossing':'approach';
    info.forcedColumn=true;
    forceBridgeColumnTargetsV068(reg,march,info);

    if(!info.entered){progressState.delete(reg.id);return;}
    const local=crossingLocalV068(c,march.anchorX,march.anchorY);
    const direction=info.initialSide<0?1:-1;
    const forwardProgress=local.along*direction;
    const normalThreshold=normalReleaseThreshold(c);
    if(forwardProgress>=normalThreshold){release(reg,c,info,touches,'normal-axis');return;}

    let tracked=progressState.get(reg.id);
    if(!tracked||tracked.crossingId!==c.id){
      tracked={crossingId:c.id,maxProgress:forwardProgress,lastAdvanceAt:elapsed};
      progressState.set(reg.id,tracked);
    }else if(forwardProgress>tracked.maxProgress+2.5){
      tracked.maxProgress=forwardProgress;
      tracked.lastAdvanceAt=elapsed;
    }else if(forwardProgress>tracked.maxProgress){
      tracked.maxProgress=forwardProgress;
    }

    const fallbackThreshold=safeFallbackThreshold(c);
    const axisStalled=elapsed-tracked.lastAdvanceAt>=1.15;
    if(tracked.maxProgress>=fallbackThreshold&&axisStalled){
      release(reg,c,info,touches,'axis-stall');
    }
  };

  const api=Object.freeze({
    version:'crossing-progress-v1.1',
    localAxisRelease:true,
    stalledAxisRelease:true,
    followerSafetyOwnsTail:true,
    stats:()=>({...stats,tracked:progressState.size})
  });
  global.__CROSSING_PROGRESS_V1__=api;
  if(global.NRTS.subsystems.has('crossing-progress')){
    global.NRTS.services?.provide?.('crossing-progress','src/systems/navigation/crossing-progress-v1.js',api,{generation:28,legacyBridge:false});
  }else{
    global.NRTS.subsystems.register('crossing-progress',api,{phase:'architecture-v2.1',legacyBridge:false,responsibility:'release bridge and ford traffic from local crossing-axis progress while follower safety clears trailing soldiers'});
  }
})(window);
