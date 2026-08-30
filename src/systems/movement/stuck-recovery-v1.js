'use strict';
// ---------- Architecture v2.1: movement stuck recovery ----------
(function installStuckRecoveryV1(global){
  const nrts=global.NRTS;
  if(!nrts)throw new Error('NRTS foundation runtime must load before stuck recovery.');
  const cfg=global.NRTS_CONFIG?.movement?.stuckRecovery || {};
  const sampleSeconds=cfg.sampleSeconds??.8,triggerSeconds=cfg.triggerSeconds??2.4,minTravel=cfg.minExpectedTravel??8,cooldown=cfg.replanCooldownSeconds??2.8,nudge=cfg.nudgeDistance??18;
  const groupState=new Map(),unitState=new Map();
  const stats={groupReplans:0,unitNudges:0,samples:0};

  function groupCenter(reg){const m=regimentMembers(reg);return m.length?centroid(m):null;}
  function activeGroupMove(reg){return !!reg&&!reg.destroyed&&Array.isArray(reg.path)&&reg.path.length>0&&reg.movementPhaseV063!=='deploying';}
  function replanGroup(reg,now){
    const target=reg.finalTarget||{x:reg.targetX,y:reg.targetY};
    if(!target||!Number.isFinite(target.x)||!Number.isFinite(target.y))return false;
    const state=groupState.get(reg.id)||{};
    if(now-(state.lastRecovery??-Infinity)<cooldown)return false;
    orderGroupPathV06(reg,target.x,target.y,reg.formation,reg.finalFacing??reg.targetFacing??null);
    state.lastRecovery=now;state.stillSeconds=0;groupState.set(reg.id,state);stats.groupReplans++;return true;
  }
  function sampleGroups(dt){
    for(const reg of regiments){
      if(!activeGroupMove(reg)){groupState.delete(reg.id);continue;}
      const c=groupCenter(reg);if(!c)continue;
      let s=groupState.get(reg.id);
      if(!s){s={x:c.x,y:c.y,clock:0,stillSeconds:0,lastRecovery:-Infinity};groupState.set(reg.id,s);continue;}
      s.clock+=dt;if(s.clock<sampleSeconds)continue;
      const travel=Math.hypot(c.x-s.x,c.y-s.y),sampleDt=s.clock;s.clock=0;s.x=c.x;s.y=c.y;stats.samples++;
      if(travel<minTravel)s.stillSeconds+=sampleDt;else s.stillSeconds=0;
      if(s.stillSeconds>=triggerSeconds)replanGroup(reg,elapsed);
    }
  }
  function nudgeLooseUnit(u){
    const dx=(u.targetX??u.x)-u.x,dy=(u.targetY??u.y)-u.y,len=Math.hypot(dx,dy)||1;
    const px=-dy/len,py=dx/len;
    // Pick the side that increases clearance from the nearest gameplay building.
    let nearest=null;
    for(const b of buildings){if(b.dead)continue;const d=Math.hypot(u.x-b.x,u.y-b.y);if(!nearest||d<nearest.d)nearest={b,d};}
    let sign=((u.id||1)%2)?1:-1;
    if(nearest){
      const a={x:u.x+px*nudge,y:u.y+py*nudge},b={x:u.x-px*nudge,y:u.y-py*nudge};
      const da=Math.hypot(a.x-nearest.b.x,a.y-nearest.b.y),db=Math.hypot(b.x-nearest.b.x,b.y-nearest.b.y);sign=da>=db?1:-1;
    }
    u.x=Math.max(12,Math.min(WORLD.width-12,u.x+px*nudge*sign));
    u.y=Math.max(12,Math.min(WORLD.height-12,u.y+py*nudge*sign));
    u.arrivedAtTarget=false;stats.unitNudges++;
  }
  function sampleLoose(dt){
    for(const u of units){
      if(u.dead||u.routing||u.regimentId||u.task==='gather'||u.task==='return'||u.task==='build'){unitState.delete(u.id);continue;}
      const remaining=Math.hypot((u.targetX??u.x)-u.x,(u.targetY??u.y)-u.y);
      if(remaining<20){unitState.delete(u.id);continue;}
      let s=unitState.get(u.id);
      if(!s){s={x:u.x,y:u.y,clock:0,stillSeconds:0,lastRecovery:-Infinity};unitState.set(u.id,s);continue;}
      s.clock+=dt;if(s.clock<sampleSeconds)continue;
      const travel=Math.hypot(u.x-s.x,u.y-s.y),sampleDt=s.clock;s.clock=0;s.x=u.x;s.y=u.y;
      if(travel<Math.max(2,minTravel*.35))s.stillSeconds+=sampleDt;else s.stillSeconds=0;
      if(s.stillSeconds>=triggerSeconds&&elapsed-s.lastRecovery>=cooldown){nudgeLooseUnit(u);s.lastRecovery=elapsed;s.stillSeconds=0;s.x=u.x;s.y=u.y;}
    }
  }

  const previousUpdate=update;
  update=function updateWithStuckRecoveryV1(dt){
    previousUpdate(dt);
    if(!(dt>0)||gameOver)return;
    sampleGroups(dt);sampleLoose(dt);
  };

  const api=Object.freeze({version:'stuck-recovery-v1',groupReplanning:true,looseUnitEscape:true,stats:()=>({...stats,trackedGroups:groupState.size,trackedUnits:unitState.size})});
  global.__STUCK_RECOVERY_V1__=api;
  nrts.subsystems.register('stuck-recovery',api,{phase:'architecture-v2.1',legacyBridge:false,responsibility:'detect non-progressing troop movement and replan/nudge without changing normal locomotion'});
})(window);
