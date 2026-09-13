'use strict';
// ---------- v1.3.22: progressive post-crossing reform, turn discipline and regroup pacing ----------
(function installPostCrossingReformV1322(global){
  const nrts=global.NRTS;
  if(!nrts)throw new Error('NRTS runtime must load before post-crossing reform.');
  if(typeof applyFormationTargetsV063!=='function'||typeof desiredGroupSpeedV064!=='function')return;

  const REFORM_SECONDS=2.6;
  const MAX_REFORM_SECONDS=4.1;
  const TURN_RATE=Math.PI*.24; // ~43 degrees / second while the column opens out.
  const START_LATERAL_SCALE=.28;
  const START_LONGITUDINAL_SCALE=.82;
  const MIN_SPEED_FACTOR=.66;
  const states=new Map();
  const stats={begun:0,completed:0,orderOverrides:0,turnClamps:0,speedGates:0,passBiasClears:0};

  function now(){try{return Number(elapsed)||0;}catch{return 0;}}
  function livingMembers(reg){
    try{return regimentMembers(reg).filter(u=>u&&!u.dead&&!u.routing);}catch{return[];}
  }
  function crossingActive(reg){
    const info=reg?.crossingTrafficV068;
    return Boolean(info?.forcedColumn&&['approach','crossing','clearing'].includes(info.state));
  }
  function clamp01(v){return Math.max(0,Math.min(1,v));}
  function smooth(t){t=clamp01(t);return t*t*(3-2*t);}
  function normalizeAngle(a){
    if(typeof normalizeAngleV063==='function')return normalizeAngleV063(a);
    let v=a%(Math.PI*2);if(v>Math.PI)v-=Math.PI*2;if(v<-Math.PI)v+=Math.PI*2;return v;
  }
  function readiness(reg){
    const members=livingMembers(reg);if(!members.length)return 1;
    let ready=0;
    for(const u of members){
      const d=Math.hypot((u.targetX??u.x)-u.x,(u.targetY??u.y)-u.y);
      if(d<=28)ready++;
    }
    return ready/members.length;
  }
  function begin(reg,state,t){
    state.wasCrossing=false;
    state.reforming=true;
    state.startedAt=t;
    state.endAt=t+REFORM_SECONDS;
    state.hardEndAt=t+MAX_REFORM_SECONDS;
    state.orderStamp=Number(reg.formationTrafficOrderedAtV132)||0;
    state.lastAt=t;
    stats.begun++;
  }
  function finish(reg,state,reason){
    state.reforming=false;
    state.finishedReason=reason;
    if(reason==='new-order')stats.orderOverrides++;
    else stats.completed++;
    if(reg?.postCrossingReformV1322)reg.postCrossingReformV1322=null;
  }
  function explicitOrderAfterBegin(reg,state){
    const stamp=Number(reg?.formationTrafficOrderedAtV132)||0;
    return stamp>state.startedAt+.01&&stamp>state.orderStamp+.01;
  }
  function scaledOffsets(offsets,progress){
    if(!(offsets instanceof Map))return offsets;
    const eased=smooth(progress);
    const lateral=START_LATERAL_SCALE+(1-START_LATERAL_SCALE)*eased;
    const longitudinal=START_LONGITUDINAL_SCALE+(1-START_LONGITUDINAL_SCALE)*eased;
    const result=new Map();
    for(const[id,o]of offsets){
      if(!o){result.set(id,o);continue;}
      result.set(id,{...o,ox:(Number(o.ox)||0)*longitudinal,oy:(Number(o.oy)||0)*lateral});
    }
    return result;
  }
  function disciplinedFacing(state,desired,t){
    if(!Number.isFinite(desired))return desired;
    if(!Number.isFinite(state.lastFacing)){state.lastFacing=desired;state.lastAt=t;return desired;}
    const dt=Math.max(1/120,Math.min(.12,t-(Number(state.lastAt)||t)));
    const delta=normalizeAngle(desired-state.lastFacing);
    const limit=TURN_RATE*dt;
    if(Math.abs(delta)>limit){
      desired=normalizeAngle(state.lastFacing+Math.sign(delta)*limit);
      stats.turnClamps++;
    }
    state.lastFacing=desired;
    state.lastAt=t;
    return desired;
  }
  function clearPassingBias(reg,progress){
    const bias=reg?.formationTrafficV132;
    if(progress<.72&&bias?.reason==='right-hand-pass'){
      reg.formationTrafficV132=null;
      stats.passBiasClears++;
    }
  }

  const previousApplyFormationTargets=applyFormationTargetsV063;
  applyFormationTargetsV063=function applyFormationTargetsPostCrossingReformV1322(reg,centerX,centerY,offsets,facing,phase){
    if(!reg||reg.destroyed)return previousApplyFormationTargets(reg,centerX,centerY,offsets,facing,phase);
    const t=now();
    let state=states.get(reg.id);
    const active=crossingActive(reg);
    if(active){
      if(!state){state={wasCrossing:true,reforming:false,lastFacing:facing,lastAt:t};states.set(reg.id,state);}
      else{state.wasCrossing=true;state.reforming=false;if(Number.isFinite(facing))state.lastFacing=facing;state.lastAt=t;}
      return previousApplyFormationTargets(reg,centerX,centerY,offsets,facing,phase);
    }
    if(state?.wasCrossing&&!state.reforming)begin(reg,state,t);
    if(!state?.reforming)return previousApplyFormationTargets(reg,centerX,centerY,offsets,facing,phase);
    if(explicitOrderAfterBegin(reg,state)){
      finish(reg,state,'new-order');
      return previousApplyFormationTargets(reg,centerX,centerY,offsets,facing,phase);
    }

    const progress=clamp01((t-state.startedAt)/REFORM_SECONDS);
    const ready=readiness(reg);
    clearPassingBias(reg,progress);
    const adjustedOffsets=scaledOffsets(offsets,progress);
    const adjustedFacing=disciplinedFacing(state,facing,t);
    reg.postCrossingReformV1322={progress,readiness:ready,until:state.hardEndAt};
    const result=previousApplyFormationTargets(reg,centerX,centerY,adjustedOffsets,adjustedFacing,progress<1?'post-crossing-reform':phase);
    if((progress>=1&&ready>=.80)||t>=state.hardEndAt)finish(reg,state,t>=state.hardEndAt?'timeout':'cohesive');
    return result;
  };

  const previousDesiredGroupSpeed=desiredGroupSpeedV064;
  desiredGroupSpeedV064=function desiredGroupSpeedPostCrossingReformV1322(reg,march,roadMarch){
    const base=previousDesiredGroupSpeed(reg,march,roadMarch);
    const state=reg?states.get(reg.id):null;
    if(!(base>0)||!state?.reforming||crossingActive(reg))return base;
    const t=now();
    if(explicitOrderAfterBegin(reg,state)){finish(reg,state,'new-order');return base;}
    const progress=clamp01((t-state.startedAt)/REFORM_SECONDS);
    const ready=readiness(reg);
    const factor=Math.max(MIN_SPEED_FACTOR,Math.min(1,.66+.18*smooth(progress)+.22*ready));
    if(factor<.995)stats.speedGates++;
    return base*factor;
  };

  const api=Object.freeze({
    version:'post-crossing-reform-v1322',
    progressiveExpansion:true,
    turnDiscipline:true,
    cohesionSpeedGate:true,
    explicitOrdersWin:true,
    reformSeconds:REFORM_SECONDS,
    maxTurnRate:TURN_RATE,
    state:reg=>reg?states.get(reg.id)||null:null,
    stats:()=>({...stats,tracked:states.size})
  });
  global.__POST_CROSSING_REFORM_V1322__=api;
  nrts.subsystems.register('post-crossing-reform',api,{phase:'v1.3.22',legacyBridge:false,responsibility:'open bridge columns back into their intended formation progressively, limit snap-turning, pace the anchor until followers regroup, and never fight a newer explicit order'});
})(window);
