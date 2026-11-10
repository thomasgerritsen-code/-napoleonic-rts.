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
  const stats={groupReplans:0,unitNudges:0,unsafeNudgesRejected:0,alternativeNudges:0,waterRescues:0,samples:0,localDetours:0,detourResumes:0,blockedDirectSteps:0,crossingReplansSuppressed:0,crossingChangedReplans:0,formationReplansSuppressed:0,trafficYieldReplansSuppressed:0,nearTargetReplansSuppressed:0,phaseResets:0};

  const obstacleCell=256,emptyVillages=[];
  let villageSource=null,villageRects=[],villageGrid=new Map(),villageCellRects=new Map();
  // Numeric cell keys (cells stay far inside ±2^15 on any map) instead of 'x:y' strings.
  const cellKey=(x,y)=>(x+32768)*65536+(y+32768);
  function villageObstacles(){
    const villages=global.VILLAGE_SCENERY_V4||global.__VILLAGE_SCENERY_V4_DATA__||emptyVillages;
    if(villages===villageSource)return villageRects;
    villageSource=villages;villageGrid=new Map();stats.obstacleBuilds=(stats.obstacleBuilds||0)+1;
    villageRects=villages.flatMap(v=>v.houses||[]).map(h=>({id:`v:${h.id||`${h.kind}-${h.x}-${h.y}`}`,x:h.x,y:h.y,w:h.w,h:h.h,angle:h.angle||0,kind:'village'}));
    villageRects.forEach((o,i)=>{
      const c=Math.abs(Math.cos(o.angle)),s=Math.abs(Math.sin(o.angle));
      const ex=(o.w*c+o.h*s)/2,ey=(o.w*s+o.h*c)/2;
      for(let y=Math.floor((o.y-ey)/obstacleCell);y<=Math.floor((o.y+ey)/obstacleCell);y++)
        for(let x=Math.floor((o.x-ex)/obstacleCell);x<=Math.floor((o.x+ex)/obstacleCell);x++){
          const key=cellKey(x,y);if(!villageGrid.has(key))villageGrid.set(key,[]);villageGrid.get(key).push(i);
        }
    });
    // Each cell's ids are already ascending (houses are visited in order), so a
    // query that stays in one cell can hand out that cell's houses as they are.
    villageCellRects=new Map();
    for(const[key,ids]of villageGrid)villageCellRects.set(key,ids.map(i=>villageRects[i]));
    return villageRects;
  }
  // Buildings stand square (angle 0), so with a point or segment only those whose
  // box, grown by the pad, overlaps the segment's box can block it.
  function gameplayObstacles(a=null,b=a,pad=clearance){
    const out=[],bounded=a&&b&&[a.x,a.y,b.x,b.y,pad].every(Number.isFinite);
    const minX=bounded?Math.min(a.x,b.x)-pad:0,maxX=bounded?Math.max(a.x,b.x)+pad:0,minY=bounded?Math.min(a.y,b.y)-pad:0,maxY=bounded?Math.max(a.y,b.y)+pad:0;
    for(const g of buildings){
      if(g.dead)continue;
      if(bounded&&(g.x+g.w*.5<minX||g.x-g.w*.5>maxX||g.y+g.h*.5<minY||g.y-g.h*.5>maxY))continue;
      out.push({id:`g:${g.id}`,x:g.x,y:g.y,w:g.w,h:g.h,angle:0,kind:'gameplay'});
    }
    return out;
  }
  function obstacles(a=null,b=a,pad=clearance){
    const all=villageObstacles();let nearby=all;
    // Invalid/very long segments use the original full scan. Apart from being
    // cheaper than visiting empty cells, this prevents unbounded grid loops.
    const finite=!!(a&&b)&&Number.isFinite(a.x)&&Number.isFinite(a.y)&&Number.isFinite(b.x)&&Number.isFinite(b.y)&&Number.isFinite(pad);
    const cellCount=finite?(Math.ceil((Math.abs(a.x-b.x)+pad*3)/obstacleCell)+2)*(Math.ceil((Math.abs(a.y-b.y)+pad*3)/obstacleCell)+2):Infinity;
    if(finite&&cellCount<=Math.max(16,all.length*2)){
      const margin=pad*Math.SQRT2;
      const x0=Math.floor((Math.min(a.x,b.x)-margin)/obstacleCell),x1=Math.floor((Math.max(a.x,b.x)+margin)/obstacleCell);
      const y0=Math.floor((Math.min(a.y,b.y)-margin)/obstacleCell),y1=Math.floor((Math.max(a.y,b.y)+margin)/obstacleCell);
      if(x0===x1&&y0===y1)nearby=villageCellRects.get(cellKey(x0,y0))||emptyVillages;
      else{
        const ids=new Set();
        for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)
          for(const id of villageGrid.get(cellKey(x,y))||emptyVillages)ids.add(id);
        nearby=[...ids].sort((a,b)=>a-b).map(i=>all[i]);
      }
    }
    stats.obstacleQueries=(stats.obstacleQueries||0)+1;stats.obstacleCandidates=(stats.obstacleCandidates||0)+nearby.length;
    // Player buildings stay live: placing, moving or destroying one is visible immediately.
    return nearby.concat(gameplayObstacles(a,b,pad));
  }
  nrts.events.on('game:reset',()=>{villageSource=null;});
  function toLocal(p,o){const c=Math.cos(o.angle||0),s=Math.sin(o.angle||0),dx=p.x-o.x,dy=p.y-o.y;return{x:dx*c+dy*s,y:-dx*s+dy*c};}
  function toWorld(p,o){const c=Math.cos(o.angle||0),s=Math.sin(o.angle||0);return{x:o.x+p.x*c-p.y*s,y:o.y+p.x*s+p.y*c};}
  function insideExpanded(p,o,pad=clearance){const q=toLocal(p,o);return Math.abs(q.x)<o.w*.5+pad&&Math.abs(q.y)<o.h*.5+pad;}
  function segmentAabbHitLocal(a,b,hw,hh){let t0=0,t1=1;const dx=b.x-a.x,dy=b.y-a.y,tests=[[-dx,a.x+hw],[dx,hw-a.x],[-dy,a.y+hh],[dy,hh-a.y]];for(const[p,q]of tests){if(Math.abs(p)<1e-9){if(q<0)return false;continue;}const r=q/p;if(p<0){if(r>t1)return false;if(r>t0)t0=r;}else{if(r<t0)return false;if(r<t1)t1=r;}}return t0<=t1&&t1>=0&&t0<=1;}
  function segmentHitsObstacle(a,b,o,pad=clearance){
    const la=toLocal(a,o),lb=toLocal(b,o),hw=o.w*.5+pad,hh=o.h*.5+pad;
    if(Math.abs(la.x)<hw&&Math.abs(la.y)<hh){
      const startNorm=Math.max(Math.abs(la.x)/hw,Math.abs(la.y)/hh),endNorm=Math.max(Math.abs(lb.x)/hw,Math.abs(lb.y)/hh);
      // Units spawned in a clearance buffer must be able to leave in small
      // physical steps; requiring one step to exit the entire box traps them.
      const outward=la.x*(lb.x-la.x)/(hw*hw)+la.y*(lb.y-la.y)/(hh*hh);
      if(endNorm>startNorm+1e-7&&outward>=-1e-9)return false;
    }
    return segmentAabbHitLocal(la,lb,hw,hh);
  }
  function firstBlocker(a,b,ignoreId=null,pad=clearance){let best=null,bestD=Infinity;for(const o of obstacles(a,b,pad)){if(o.id===ignoreId)continue;if(!segmentHitsObstacle(a,b,o,pad))continue;const d=Math.hypot(a.x-o.x,a.y-o.y);if(d<bestD){best=o;bestD=d;}}return best;}
  function pointClear(p,ignoreId=null,pad=clearance){if(p.x<10||p.y<10||p.x>WORLD.width-10||p.y>WORLD.height-10)return false;for(const o of obstacles(p,p,pad))if(o.id!==ignoreId&&insideExpanded(p,o,pad))return false;return true;}
  function projectTargetOutside(p,o,pad=clearance){if(!insideExpanded(p,o,pad))return p;const q=toLocal(p,o),hw=o.w*.5+pad,hh=o.h*.5+pad,px=hw-Math.abs(q.x),py=hh-Math.abs(q.y);if(px<py)q.x=(q.x<0?-1:1)*(hw+.5);else q.y=(q.y<0?-1:1)*(hh+.5);return toWorld(q,o);}
  function sanitizedTarget(target,pad=clearance){let p={x:target.x,y:target.y};for(let pass=0;pass<6;pass++){let changed=false;for(const o of obstacles(p,p,pad)){if(!insideExpanded(p,o,pad))continue;p=projectTargetOutside(p,o,pad);changed=true;}if(!changed)break;}return p;}
  function cornerCandidates(o,pad=clearance){const hw=o.w*.5+pad+cornerClearance,hh=o.h*.5+pad+cornerClearance;return[[-hw,-hh],[-hw,hh],[hw,-hh],[hw,hh]].map(([x,y])=>toWorld({x,y},o));}
  function localWaypoint(a,target,unit){
    const pad=Math.max(clearance,(TYPES[unit?.type]?.radius||0)+2);
    const safeTarget=sanitizedTarget(target,pad),blocker=firstBlocker(a,safeTarget,null,pad);
    if(!blocker)return{target:safeTarget,waypoint:null,waypoints:[],blocker:null};
    stats.blockedDirectSteps++;
    // Every leg must see free space, INCLUDING the obstacle being rounded.
    // Ignoring that obstacle selected its far corner and sent men through its wall.
    const relevant=new Map([[blocker.id,blocker]]);
    for(let attempt=0;attempt<8;attempt++){
      const nodes=[a,safeTarget,...[...relevant.values()].flatMap(o=>cornerCandidates(o,pad)).filter(p=>pointClear(p,null,pad))];
      const costs=nodes.map(()=>Infinity),parent=nodes.map(()=>-1),done=new Set(),blocked=new Map();costs[0]=0;
      for(let step=0;step<nodes.length;step++){
        let next=-1;for(let i=0;i<nodes.length;i++)if(!done.has(i)&&(next<0||costs[i]<costs[next]))next=i;
        if(next<0||!Number.isFinite(costs[next]))break;
        if(next===1){const path=[];for(let at=1;at!==0;at=parent[at])path.unshift(nodes[at]);path.pop();return{target:safeTarget,waypoint:path[0]||null,waypoints:path,blocker};}
        done.add(next);
        for(let i=1;i<nodes.length;i++){
          if(done.has(i))continue;
          const cost=costs[next]+Math.hypot(nodes[i].x-nodes[next].x,nodes[i].y-nodes[next].y);if(cost>=costs[i])continue;
          const hit=firstBlocker(nodes[next],nodes[i],null,pad);
          if(hit){if(!relevant.has(hit.id))blocked.set(hit.id,hit);continue;}
          costs[i]=cost;parent[i]=next;
        }
      }
      if(!blocked.size)break;
      for(const [id,o]of blocked){if(relevant.size>=10)break;relevant.set(id,o);}
    }
    return{target:safeTarget,waypoint:null,waypoints:[],blocker};
  }

  function groupCenter(reg){const m=regimentMembers(reg);return m.length?centroid(m):null;}
  function crossingOwnsRecovery(reg){const info=reg?.crossingTrafficV068;return!!(info?.forcedColumn&&['queued','waiting','approach','crossing','clearing'].includes(info.state));}
  function crossingIds(reg){return(reg?.routeCrossingsV067||[]).map(x=>x?.id).filter(Boolean);}
  function movementPhase(reg){return reg?.marchV063?.phase||reg?.movementPhaseV063||null;}
  function formationIsSettling(reg){const phase=movementPhase(reg);return phase==='forming-column'||phase==='deploying';}
  function trafficYieldOwnsRecovery(reg){const bias=reg?.formationTrafficV132;return!!(bias&&bias.reason==='bridge-yield'&&bias.until>elapsed);}
  function nearFinalTarget(reg,center){const target=reg?.finalTarget||((Number.isFinite(reg?.targetX)&&Number.isFinite(reg?.targetY))?{x:reg.targetX,y:reg.targetY}:null);if(!target||!center)return false;return Math.hypot(center.x-target.x,center.y-target.y)<52;}
  function activeGroupMove(reg){return!!reg&&!reg.destroyed&&Array.isArray(reg.path)&&reg.path.length>0&&!formationIsSettling(reg)&&!global.__CAVALRY_CONTACT_V1__?.engaged(reg);}
  function replanGroup(reg,now){
    if(crossingOwnsRecovery(reg)){stats.crossingReplansSuppressed++;return false;}
    if(formationIsSettling(reg)){stats.formationReplansSuppressed++;return false;}
    if(trafficYieldOwnsRecovery(reg)){stats.trafficYieldReplansSuppressed++;return false;}
    const center=groupCenter(reg);if(nearFinalTarget(reg,center)){stats.nearTargetReplansSuppressed++;return false;}
    const target=reg.finalTarget||{x:reg.targetX,y:reg.targetY};if(!target||!Number.isFinite(target.x)||!Number.isFinite(target.y))return false;
    const state=groupState.get(reg.id)||{};if(now-(state.lastRecovery??-Infinity)<cooldown)return false;
    const before={pathLength:reg.path?.length||0,pathIndex:reg.pathIndex||0,crossings:crossingIds(reg),phase:movementPhase(reg)};
    orderGroupPathV06(reg,target.x,target.y,reg.formation,reg.finalFacing??reg.targetFacing??null);
    const after={pathLength:reg.path?.length||0,pathIndex:reg.pathIndex||0,crossings:crossingIds(reg),phase:movementPhase(reg)};
    const changed=before.crossings.join('|')!==after.crossings.join('|');if(changed)stats.crossingChangedReplans++;
    replanTrace.push({regId:reg.id,at:+now.toFixed(2),target:{x:+target.x.toFixed(1),y:+target.y.toFixed(1)},before,after,crossingChanged:changed});if(replanTrace.length>24)replanTrace.shift();
    state.lastRecovery=now;state.stillSeconds=0;state.phase=movementPhase(reg);groupState.set(reg.id,state);stats.groupReplans++;return true;
  }
  function sampleGroups(dt){for(const reg of regiments){if(!activeGroupMove(reg)){if(groupState.has(reg.id)){groupState.delete(reg.id);stats.phaseResets++;}continue;}if(crossingOwnsRecovery(reg)){groupState.delete(reg.id);continue;}if(trafficYieldOwnsRecovery(reg)){groupState.delete(reg.id);stats.trafficYieldReplansSuppressed++;continue;}const c=groupCenter(reg);if(!c)continue;if(nearFinalTarget(reg,c)){groupState.delete(reg.id);stats.nearTargetReplansSuppressed++;continue;}const phase=movementPhase(reg);let s=groupState.get(reg.id);if(!s){s={x:c.x,y:c.y,clock:0,stillSeconds:0,lastRecovery:-Infinity,phase};groupState.set(reg.id,s);continue;}if(s.phase!==phase){s.x=c.x;s.y=c.y;s.clock=0;s.stillSeconds=0;s.phase=phase;stats.phaseResets++;continue;}s.clock+=dt;if(s.clock<sampleSeconds)continue;const travel=Math.hypot(c.x-s.x,c.y-s.y),sampleDt=s.clock;s.clock=0;s.x=c.x;s.y=c.y;stats.samples++;if(travel<minTravel)s.stillSeconds+=sampleDt;else s.stillSeconds=0;if(s.stillSeconds>=triggerSeconds)replanGroup(reg,elapsed);}}
  function nudgeLooseUnit(u){
    const dx=(u.targetX??u.x)-u.x,dy=(u.targetY??u.y)-u.y,len=Math.hypot(dx,dy)||1,px=-dy/len,py=dx/len;
    let nearest=null;
    for(const o of obstacles()){const d=Math.hypot(u.x-o.x,u.y-o.y);if(!nearest||d<nearest.d)nearest={o,d};}
    let sign=((u.id||1)%2)?1:-1;
    if(nearest){
      const a={x:u.x+px*nudge,y:u.y+py*nudge},b={x:u.x-px*nudge,y:u.y-py*nudge};
      sign=Math.hypot(a.x-nearest.o.x,a.y-nearest.o.y)>=Math.hypot(b.x-nearest.o.x,b.y-nearest.o.y)?1:-1;
    }
    // First try the usual sidestep, then the opposite lane and a small
    // forward/backward escape. A free building tile may still be river water:
    // never teleport a stranded soldier off the legal bridge/ford passage.
    const offsets=[
      {x:px*nudge*sign,y:py*nudge*sign},
      {x:-px*nudge*sign,y:-py*nudge*sign},
      {x:dx/len*nudge*.75,y:dy/len*nudge*.75},
      {x:-dx/len*nudge*.75,y:-dy/len*nudge*.75}
    ];
    for(let i=0;i<offsets.length;i++){
      const delta=offsets[i];
      const proposed={x:Math.max(12,Math.min(WORLD.width-12,u.x+delta.x)),y:Math.max(12,Math.min(WORLD.height-12,u.y+delta.y))};
      if(!pointClear(proposed,null,2)||waterAtV067(proposed.x,proposed.y)||segmentCrossesBlockedWaterV067(u.x,u.y,proposed.x,proposed.y)){
        stats.unsafeNudgesRejected++;
        continue;
      }
      if(Math.hypot(proposed.x-u.x,proposed.y-u.y)<1)continue;
      u.x=proposed.x;u.y=proposed.y;u.arrivedAtTarget=false;
      stats.unitNudges++;
      if(i>0)stats.alternativeNudges++;
      return;
    }
  }
  function rescueLooseFromRiver(u){
    if(!waterAtV067(u.x,u.y))return false;
    // This is a last-resort correction for an already invalid position. The
    // regular movement guard cannot walk out: its first step still hits water.
    // Choose the nearest unobstructed bank rather than leaving the unit stuck.
    const originalX=u.x,originalY=u.y;
    const preferred=bankSideV067(originalX,originalY)>=0?1:-1;
    let best=null,bestDistance=Infinity;
    for(const yOffset of [0,-24,24,-48,48]){
      const y=Math.max(12,Math.min(WORLD.height-12,originalY+yOffset));
      const riverX=riverCenterXAtYV067(y);
      for(const side of [preferred,-preferred]){
        const p={x:riverX+side*(RIVER_NAV_HALF_WIDTH_V067+16),y};
        const distance=Math.hypot(p.x-originalX,p.y-originalY);
        if(distance>=bestDistance||!pointClear(p,null,2)||waterAtV067(p.x,p.y))continue;
        best=p;bestDistance=distance;
      }
    }
    if(!best)return false;
    u.x=best.x;u.y=best.y;u.arrivedAtTarget=false;
    u.localAvoidanceV2=null;
    u.navigationBridgeV2=null;
    u.waterCrossingIdV067=null;
    unitState.delete(u.id);
    stats.waterRescues++;
    return true;
  }
  function sampleLoose(dt){for(const u of units){if(u.dead||u.routing||u.regimentId||u.task==='gather'||u.task==='return'||u.task==='build'){unitState.delete(u.id);continue;}if(global.__CHARGE_STUMBLE_V1__?.down(u)||global.__CAVALRY_CONTACT_V1__?.state(u)){unitState.delete(u.id);continue;}if(rescueLooseFromRiver(u))continue;const remaining=Math.hypot((u.targetX??u.x)-u.x,(u.targetY??u.y)-u.y);if(remaining<20){unitState.delete(u.id);continue;}let s=unitState.get(u.id);if(!s){s={x:u.x,y:u.y,clock:0,stillSeconds:0,lastRecovery:-Infinity};unitState.set(u.id,s);continue;}s.clock+=dt;if(s.clock<sampleSeconds)continue;const travel=Math.hypot(u.x-s.x,u.y-s.y),sampleDt=s.clock;s.clock=0;s.x=u.x;s.y=u.y;if(travel<Math.max(2,minTravel*.35))s.stillSeconds+=sampleDt;else s.stillSeconds=0;if(s.stillSeconds>=triggerSeconds&&elapsed-s.lastRecovery>=cooldown){nudgeLooseUnit(u);s.lastRecovery=elapsed;s.stillSeconds=0;s.x=u.x;s.y=u.y;}}}
  const previousMoveToward=moveToward;
  moveToward=function moveTowardWithLocalAvoidanceV2(u,tx,ty,dt,speed=TYPES[u.type].speed){
    if(!u||u.dead||!(dt>0))return previousMoveToward(u,tx,ty,dt,speed);
    const pad=Math.max(clearance,(TYPES[u.type]?.radius||0)+2),finalTarget=sanitizedTarget({x:tx,y:ty},pad);
    let state=u.localAvoidanceV2||null;
    if(state){
      const changed=Math.hypot(finalTarget.x-state.finalX,finalTarget.y-state.finalY)>60;
      const directClear=!firstBlocker(u,finalTarget,null,pad+(avoidCfg.directResumeClearance??2));
      if(Math.hypot(u.x-state.progressX,u.y-state.progressY)>2){state.progressAt=elapsed;state.progressX=u.x;state.progressY=u.y;}
      const stalled=elapsed-(state.progressAt??elapsed)>maxWaypointSeconds;
      if(changed||directClear||stalled){u.localAvoidanceV2=null;state=null;stats.detourResumes++;}
      else if(Math.hypot(u.x-state.x,u.y-state.y)<=Math.min(waypointArrival,4)){
        state.waypoints.shift();
        if(state.waypoints.length){Object.assign(state,state.waypoints[0]);}
        else{u.localAvoidanceV2=null;state=null;stats.detourResumes++;}
      }
    }
    if(!state){
      const route=localWaypoint(u,finalTarget,u);
      if(route.waypoint){state={...route.waypoint,waypoints:route.waypoints,blockerId:route.blocker?.id||null,startedAt:elapsed,progressAt:elapsed,progressX:u.x,progressY:u.y,finalX:finalTarget.x,finalY:finalTarget.y};u.localAvoidanceV2=state;stats.localDetours++;}
    }
    const before={x:u.x,y:u.y};
    const arrived=previousMoveToward(u,state?state.x:finalTarget.x,state?state.y:finalTarget.y,dt,speed);
    // Damped followers carry velocity around corners. Guard the actual swept step
    // as well as the route; discard wall-directed momentum after a correction.
    const hit=firstBlocker(before,u,null,pad);
    // A unit that stands on (or inside) an obstacle's margin - stopped beside a
    // wall, or pushed there by a crowd - slides along the wall instead: the part
    // of its step that goes towards the wall is dropped, the part along it kept.
    // Reverting the whole step left it rooted to the spot for good.
    let slid=false;
    if(hit){
      const qB=toLocal(before,hit),qU=toLocal(u,hit),gx=Math.abs(qB.x)-hit.w*.5,gy=Math.abs(qB.y)-hit.h*.5;
      if(Math.max(gx,gy)<=pad+.5){
        const axis=gx>=gy?'x':'y';
        if(Math.abs(qU[axis])<Math.abs(qB[axis]))qU[axis]=qB[axis];
        const p=toWorld(qU,hit);
        if(Math.hypot(p.x-before.x,p.y-before.y)>.01&&!insideExpanded(p,hit,(TYPES[u.type]?.radius||0))&&!firstBlocker(before,p,hit.id,pad)){
          u.x=p.x;u.y=p.y;slid=true;stats.wallSlides=(stats.wallSlides||0)+1;
        }
      }
    }
    if(hit&&!slid){
      const dx=u.x-before.x,dy=u.y-before.y;let lo=0,hi=1;
      for(let i=0;i<8;i++){const mid=(lo+hi)/2;if(firstBlocker(before,{x:before.x+dx*mid,y:before.y+dy*mid},null,pad))hi=mid;else lo=mid;}
      u.x=before.x+dx*lo;u.y=before.y+dy*lo;
      if(u.slotFollowerV071){u.slotFollowerV071.vx=0;u.slotFollowerV071.vy=0;}
      u.arrivedAtTarget=false;return false;
    }
    if(state){u.arrivedAtTarget=false;return false;}
    return arrived;
  };
  const previousUpdate=update;
  update=function updateWithStuckRecoveryV2(dt){previousUpdate(dt);if(!(dt>0)||gameOver)return;sampleGroups(dt);sampleLoose(dt);};
  const api=Object.freeze({version:'stuck-recovery-v2.2',groupReplanning:true,looseUnitEscape:true,localBuildingAvoidance:true,formationSlotResume:true,crossingRecoveryIsolation:true,formationPhaseIsolation:true,trafficYieldIsolation:true,nearTargetIsolation:true,replanTracing:true,stats:()=>({...stats,trackedGroups:groupState.size,trackedUnits:unitState.size,lastGroupReplans:replanTrace.slice()}),localWaypoint:(a,b)=>localWaypoint(a,b,null),segmentBlocked:(a,b)=>Boolean(firstBlocker(a,b,null,clearance))});
  global.__STUCK_RECOVERY_V1__=api;global.__STUCK_RECOVERY_V2__=api;
  if(nrts.subsystems.has('stuck-recovery'))nrts.services?.provide?.('stuck-recovery','src/systems/movement/stuck-recovery-v1.js',api,{generation:24,legacyBridge:false});
  else nrts.subsystems.register('stuck-recovery',api,{phase:'architecture-v2.2',legacyBridge:false,responsibility:'detect genuinely stalled troop movement without fighting formation settling, bridge traffic, or final deployment'});
})(window);
