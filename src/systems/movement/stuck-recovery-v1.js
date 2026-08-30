'use strict';
// ---------- Architecture v2.1: movement stuck recovery + local obstacle avoidance ----------
(function installStuckRecoveryV2(global){
  const nrts=global.NRTS;
  if(!nrts)throw new Error('NRTS foundation runtime must load before stuck recovery.');
  const cfg=global.NRTS_CONFIG?.movement?.stuckRecovery || {};
  const avoidCfg=cfg.localAvoidance || {};
  const sampleSeconds=cfg.sampleSeconds??.8,triggerSeconds=cfg.triggerSeconds??2.4,minTravel=cfg.minExpectedTravel??8,cooldown=cfg.replanCooldownSeconds??2.8,nudge=cfg.nudgeDistance??18;
  const clearance=avoidCfg.clearance??7,cornerClearance=avoidCfg.cornerClearance??13,waypointArrival=avoidCfg.waypointArrival??7,maxWaypointSeconds=avoidCfg.maxWaypointSeconds??3.2;
  const groupState=new Map(),unitState=new Map(),replanTrace=[];
  const stats={groupReplans:0,unitNudges:0,samples:0,localDetours:0,detourResumes:0,blockedDirectSteps:0,crossingReplansSuppressed:0,crossingChangedReplans:0};

  function villageObstacles(){const villages=global.VILLAGE_SCENERY_V4||global.__VILLAGE_SCENERY_V4_DATA__||[];return villages.flatMap(v=>v.houses||[]).map(h=>({id:`v:${h.id||`${h.kind}-${h.x}-${h.y}`}`,x:h.x,y:h.y,w:h.w,h:h.h,angle:h.angle||0,kind:'village'}));}
  function gameplayObstacles(){return buildings.filter(b=>!b.dead).map(b=>({id:`g:${b.id}`,x:b.x,y:b.y,w:b.w,h:b.h,angle:0,kind:'gameplay'}));}
  function obstacles(){return[...villageObstacles(),...gameplayObstacles()];}
  function toLocal(p,o){const c=Math.cos(o.angle||0),s=Math.sin(o.angle||0),dx=p.x-o.x,dy=p.y-o.y;return{x:dx*c+dy*s,y:-dx*s+dy*c};}
  function toWorld(p,o){const c=Math.cos(o.angle||0),s=Math.sin(o.angle||0);return{x:o.x+p.x*c-p.y*s,y:o.y+p.x*s+p.y*c};}
  function insideExpanded(p,o,pad=clearance){const q=toLocal(p,o);return Math.abs(q.x)<o.w*.5+pad&&Math.abs(q.y)<o.h*.5+pad;}
  function segmentAabbHitLocal(a,b,hw,hh){let t0=0,t1=1;const dx=b.x-a.x,dy=b.y-a.y,tests=[[-dx,a.x+hw],[dx,hw-a.x],[-dy,a.y+hh],[dy,hh-a.y]];for(const[p,q]of tests){if(Math.abs(p)<1e-9){if(q<0)return false;continue;}const r=q/p;if(p<0){if(r>t1)return false;if(r>t0)t0=r;}else{if(r<t0)return false;if(r<t1)t1=r;}}return t0<=t1&&t1>=0&&t0<=1;}
  function segmentHitsObstacle(a,b,o,pad=clearance){const la=toLocal(a,o),lb=toLocal(b,o),hw=o.w*.5+pad,hh=o.h*.5+pad,startInside=Math.abs(la.x)<hw&&Math.abs(la.y)<hh;if(startInside){const endInside=Math.abs(lb.x)<hw&&Math.abs(lb.y)<hh;if(!endInside){const startNorm=Math.max(Math.abs(la.x)/hw,Math.abs(la.y)/hh),endNorm=Math.max(Math.abs(lb.x)/hw,Math.abs(lb.y)/hh);if(endNorm>startNorm+1e-4)return false;}}return segmentAabbHitLocal(la,lb,hw,hh);}
  function firstBlocker(a,b,ignoreId=null,pad=clearance){let best=null,bestD=Infinity;for(const o of obstacles()){if(o.id===ignoreId)continue;if(!segmentHitsObstacle(a,b,o,pad))continue;const d=Math.hypot(a.x-o.x,a.y-o.y);if(d<bestD){best=o;bestD=d;}}return best;}
  function pointClear(p,ignoreId=null,pad=clearance){if(p.x<10||p.y<10||p.x>WORLD.width-10||p.y>WORLD.height-10)return false;for(const o of obstacles())if(o.id!==ignoreId&&insideExpanded(p,o,pad))return false;return true;}
  function projectTargetOutside(p,o,pad=clearance){if(!insideExpanded(p,o,pad))return p;const q=toLocal(p,o),hw=o.w*.5+pad,hh=o.h*.5+pad,px=hw-Math.abs(q.x),py=hh-Math.abs(q.y);if(px<py)q.x=(q.x<0?-1:1)*(hw+.5);else q.y=(q.y<0?-1:1)*(hh+.5);return toWorld(q,o);}
  function sanitizedTarget(target){let p={x:target.x,y:target.y};for(let pass=0;pass<6;pass++){let changed=false;for(const o of obstacles()){if(!insideExpanded(p,o,clearance))continue;p=projectTargetOutside(p,o,clearance);changed=true;}if(!changed)break;}return p;}
  function cornerCandidates(o){const hw=o.w*.5+clearance+cornerClearance,hh=o.h*.5+clearance+cornerClearance;return[[-hw,-hh],[-hw,hh],[hw,-hh],[hw,hh]].map(([x,y])=>toWorld({x,y},o));}
  function localWaypoint(a,target,unit){const safeTarget=sanitizedTarget(target),blocker=firstBlocker(a,safeTarget,null,clearance);if(!blocker)return{target:safeTarget,waypoint:null,blocker:null};stats.blockedDirectSteps++;const candidates=cornerCandidates(blocker).filter(p=>pointClear(p,blocker.id,clearance));let best=null,bestCost=Infinity;for(const p of candidates){if(firstBlocker(a,p,blocker.id,clearance))continue;if(firstBlocker(p,safeTarget,null,clearance))continue;const cost=Math.hypot(p.x-a.x,p.y-a.y)+Math.hypot(safeTarget.x-p.x,safeTarget.y-p.y);if(cost<bestCost){best=p;bestCost=cost;}}if(!best){for(const p of candidates){if(firstBlocker(a,p,blocker.id,clearance))continue;const cost=Math.hypot(p.x-a.x,p.y-a.y)+Math.hypot(safeTarget.x-p.x,safeTarget.y-p.y);if(cost<bestCost){best=p;bestCost=cost;}}}return{target:safeTarget,waypoint:best,blocker};}

  function groupCenter(reg){const m=regimentMembers(reg);return m.length?centroid(m):null;}
  function crossingOwnsRecovery(reg){const info=reg?.crossingTrafficV068;return!!(info?.forcedColumn&&['queued','waiting','approach','crossing','clearing'].includes(info.state));}
  function crossingIds(reg){return(reg?.routeCrossingsV067||[]).map(x=>x?.id).filter(Boolean);}
  function activeGroupMove(reg){return!!reg&&!reg.destroyed&&Array.isArray(reg.path)&&reg.path.length>0&&reg.movementPhaseV063!=='deploying';}
  function replanGroup(reg,now){
    if(crossingOwnsRecovery(reg)){stats.crossingReplansSuppressed++;return false;}
    const target=reg.finalTarget||{x:reg.targetX,y:reg.targetY};if(!target||!Number.isFinite(target.x)||!Number.isFinite(target.y))return false;
    const state=groupState.get(reg.id)||{};if(now-(state.lastRecovery??-Infinity)<cooldown)return false;
    const before={pathLength:reg.path?.length||0,pathIndex:reg.pathIndex||0,crossings:crossingIds(reg),phase:reg.movementPhaseV063||null};
    orderGroupPathV06(reg,target.x,target.y,reg.formation,reg.finalFacing??reg.targetFacing??null);
    const after={pathLength:reg.path?.length||0,pathIndex:reg.pathIndex||0,crossings:crossingIds(reg),phase:reg.movementPhaseV063||null};
    const changed=before.crossings.join('|')!==after.crossings.join('|');if(changed)stats.crossingChangedReplans++;
    replanTrace.push({regId:reg.id,at:+now.toFixed(2),target:{x:+target.x.toFixed(1),y:+target.y.toFixed(1)},before,after,crossingChanged:changed});if(replanTrace.length>24)replanTrace.shift();
    state.lastRecovery=now;state.stillSeconds=0;groupState.set(reg.id,state);stats.groupReplans++;return true;
  }
  function sampleGroups(dt){for(const reg of regiments){if(!activeGroupMove(reg)){groupState.delete(reg.id);continue;}if(crossingOwnsRecovery(reg)){groupState.delete(reg.id);continue;}const c=groupCenter(reg);if(!c)continue;let s=groupState.get(reg.id);if(!s){s={x:c.x,y:c.y,clock:0,stillSeconds:0,lastRecovery:-Infinity};groupState.set(reg.id,s);continue;}s.clock+=dt;if(s.clock<sampleSeconds)continue;const travel=Math.hypot(c.x-s.x,c.y-s.y),sampleDt=s.clock;s.clock=0;s.x=c.x;s.y=c.y;stats.samples++;if(travel<minTravel)s.stillSeconds+=sampleDt;else s.stillSeconds=0;if(s.stillSeconds>=triggerSeconds)replanGroup(reg,elapsed);}}
  function nudgeLooseUnit(u){const dx=(u.targetX??u.x)-u.x,dy=(u.targetY??u.y)-u.y,len=Math.hypot(dx,dy)||1,px=-dy/len,py=dx/len;let nearest=null;for(const o of obstacles()){const d=Math.hypot(u.x-o.x,u.y-o.y);if(!nearest||d<nearest.d)nearest={o,d};}let sign=((u.id||1)%2)?1:-1;if(nearest){const a={x:u.x+px*nudge,y:u.y+py*nudge},b={x:u.x-px*nudge,y:u.y-py*nudge};sign=Math.hypot(a.x-nearest.o.x,a.y-nearest.o.y)>=Math.hypot(b.x-nearest.o.x,b.y-nearest.o.y)?1:-1;}const proposed={x:Math.max(12,Math.min(WORLD.width-12,u.x+px*nudge*sign)),y:Math.max(12,Math.min(WORLD.height-12,u.y+py*nudge*sign))};if(pointClear(proposed,null,2)){u.x=proposed.x;u.y=proposed.y;u.arrivedAtTarget=false;stats.unitNudges++;}}
  function sampleLoose(dt){for(const u of units){if(u.dead||u.routing||u.regimentId||u.task==='gather'||u.task==='return'||u.task==='build'){unitState.delete(u.id);continue;}const remaining=Math.hypot((u.targetX??u.x)-u.x,(u.targetY??u.y)-u.y);if(remaining<20){unitState.delete(u.id);continue;}let s=unitState.get(u.id);if(!s){s={x:u.x,y:u.y,clock:0,stillSeconds:0,lastRecovery:-Infinity};unitState.set(u.id,s);continue;}s.clock+=dt;if(s.clock<sampleSeconds)continue;const travel=Math.hypot(u.x-s.x,u.y-s.y),sampleDt=s.clock;s.clock=0;s.x=u.x;s.y=u.y;if(travel<Math.max(2,minTravel*.35))s.stillSeconds+=sampleDt;else s.stillSeconds=0;if(s.stillSeconds>=triggerSeconds&&elapsed-s.lastRecovery>=cooldown){nudgeLooseUnit(u);s.lastRecovery=elapsed;s.stillSeconds=0;s.x=u.x;s.y=u.y;}}}
  const previousMoveToward=moveToward;
  moveToward=function moveTowardWithLocalAvoidanceV2(u,tx,ty,dt,speed=TYPES[u.type].speed){if(!u||u.dead||!(dt>0))return previousMoveToward(u,tx,ty,dt,speed);const finalTarget=sanitizedTarget({x:tx,y:ty});let state=u.localAvoidanceV2||null;if(state){const waypointDistance=Math.hypot(u.x-state.x,u.y-state.y),directClear=!firstBlocker({x:u.x,y:u.y},finalTarget,null,clearance);if(directClear||waypointDistance<=waypointArrival||elapsed-(state.startedAt??elapsed)>maxWaypointSeconds){u.localAvoidanceV2=null;state=null;stats.detourResumes++;}}if(!state){const route=localWaypoint({x:u.x,y:u.y},finalTarget,u);if(route.waypoint){state={x:route.waypoint.x,y:route.waypoint.y,blockerId:route.blocker?.id||null,startedAt:elapsed,finalX:finalTarget.x,finalY:finalTarget.y};u.localAvoidanceV2=state;stats.localDetours++;}}if(state){previousMoveToward(u,state.x,state.y,dt,speed);u.arrivedAtTarget=false;return false;}return previousMoveToward(u,finalTarget.x,finalTarget.y,dt,speed);};
  const previousUpdate=update;
  update=function updateWithStuckRecoveryV2(dt){previousUpdate(dt);if(!(dt>0)||gameOver)return;sampleGroups(dt);sampleLoose(dt);};
  const api=Object.freeze({version:'stuck-recovery-v2.1',groupReplanning:true,looseUnitEscape:true,localBuildingAvoidance:true,formationSlotResume:true,crossingRecoveryIsolation:true,replanTracing:true,stats:()=>({...stats,trackedGroups:groupState.size,trackedUnits:unitState.size,lastGroupReplans:replanTrace.slice()}),localWaypoint:(a,b)=>localWaypoint(a,b,null),segmentBlocked:(a,b)=>Boolean(firstBlocker(a,b,null,clearance))});
  global.__STUCK_RECOVERY_V1__=api;global.__STUCK_RECOVERY_V2__=api;
  if(nrts.subsystems.has('stuck-recovery'))nrts.services?.provide?.('stuck-recovery','src/systems/movement/stuck-recovery-v1.js',api,{generation:23,legacyBridge:false});
  else nrts.subsystems.register('stuck-recovery',api,{phase:'architecture-v2.1',legacyBridge:false,responsibility:'detect non-progressing troop movement and locally route units around gameplay and village buildings'});
})(window);
