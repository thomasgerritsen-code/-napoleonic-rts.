'use strict';
// ---------- Architecture v2.1: crossing progress authority ----------
// Adds release/deadlock decisions after the active bridge/ford guidance layer.
// It deliberately does not own steering, path choice or formation targets.
(function installCrossingProgressV1(global){
  if(!global.NRTS||typeof updateHolderStateV068!=='function')return;
  const previousUpdateHolderState=updateHolderStateV068;
  const progressState=new Map();
  const stats={updates:0,localAxisReleases:0,releaseWithTrailingFollowers:0,stalledAxisReleases:0,upstreamReleases:0,lifecycleResets:0};

  function resetTransientCrossingState(){
    progressState.clear();
    if(typeof CROSSING_TRAFFIC_V068!=='undefined')for(const state of CROSSING_TRAFFIC_V068.values()){
      state.holderIds=[];
      state.queue=[];
    }
    stats.lifecycleResets++;
  }
  global.NRTS.events.on('game:reset',resetTransientCrossingState);

  function normalReleaseThreshold(c){
    return c.length/2+Math.max(28,Math.min(48,CROSSING_RELEASE_DISTANCE_V068-c.length/2));
  }
  function safeFallbackThreshold(c){
    // An anchor clearly beyond the crossing midpoint may otherwise be held in a
    // self-locking forced column by its trailing files. Follower-safety owns those
    // files after release, so this threshold intentionally stays inside the far
    // bridge mouth while still requiring substantial positive-axis progress.
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
    previousUpdateHolderState(reg,march,info,c);

    const current=reg?.crossingTrafficV068;
    if(current?.state==='clearing'){
      stats.upstreamReleases++;
      progressState.delete(reg.id);
      return;
    }
    if(!reg||reg.destroyed||!march?.v064||!c||!info?.forcedColumn||!info.entered){
      if(reg?.id)progressState.delete(reg.id);
      return;
    }

    const local=crossingLocalV068(c,march.anchorX,march.anchorY);
    const direction=info.initialSide<0?1:-1;
    const forwardProgress=local.along*direction;
    const touches=groupTouchesCrossingV068(reg,c);

    if(forwardProgress>=normalReleaseThreshold(c)){
      release(reg,c,info,touches,'normal-axis');
      return;
    }

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

    const axisStalled=elapsed-tracked.lastAdvanceAt>=1.15;
    if(tracked.maxProgress>=safeFallbackThreshold(c)&&axisStalled){
      release(reg,c,info,touches,'axis-stall');
    }
  };

  const api=Object.freeze({
    version:'crossing-progress-v1.3',
    wrapsActiveGuidance:true,
    localAxisRelease:true,
    stalledAxisRelease:true,
    lifecycleReset:true,
    followerSafetyOwnsTail:true,
    stats:()=>({...stats,tracked:progressState.size})
  });
  global.__CROSSING_PROGRESS_V1__=api;
  if(global.NRTS.subsystems.has('crossing-progress')){
    global.NRTS.services?.provide?.('crossing-progress','src/systems/navigation/crossing-progress-v1.js',api,{generation:30,legacyBridge:false});
  }else{
    global.NRTS.subsystems.register('crossing-progress',api,{phase:'architecture-v2.1',legacyBridge:false,responsibility:'post-process active bridge/ford guidance, reset transient crossing ownership between battles and release self-locking crossing traffic from local-axis progress'});
  }
})(window);
