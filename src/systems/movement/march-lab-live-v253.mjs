import {ColumnModel} from '../../../march-lab/column-core.mjs';

// Production bridge for the *same* tested arc-length formation geometry used
// by /march-lab/. Route planning, traffic permits and combat stay in RTS.
// Unlike the old target-only wrappers, a marching regiment's visible soldier
// coordinates are also brought into its own four-file arc-length positions.
const registry=new WeakMap();
const unsupported=new WeakSet();
const metrics={orders:0,roadFrames:0,bridgeFrames:0,physicalMoves:0,skippedUnsafe:0,
  invalidRoutes:0,formationHandovers:0,fieldFrames:0,longRouteFallbacks:0};
const num=v=>Number.isFinite(v);
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const live=reg=>regimentMembers(reg).filter(u=>u&&!u.dead&&!u.routing);
const infantry=reg=>live(reg).filter(u=>u.type==='infantry');
const phaseActive=reg=>!!(reg?.marchV063?.v064&&reg.path&&!reg.destroyed&&
  groupKindV06(reg)==='infantry'&&!reg.engagementV069 &&
  reg.marchV063.phase!=='combat-halt'&&reg.marchV063.phase!=='deploying');

function newPlan(reg,march){
  const waypoints=[{x:march.anchorX,y:march.anchorY}];
  for(const p of reg.path||[]){
    if(num(p.x)&&num(p.y)&&dist(p,waypoints[waypoints.length-1])>1)
      waypoints.push({x:p.x,y:p.y});
  }
  if(waypoints.length<2)return null;
  try{
    const model=new ColumnModel(waypoints,{count:Math.max(1,infantry(reg).length),fileGap:18,rankGap:20,curveDetail:8});
    // Stage the rollout: multi-road, cross-map expeditions include village
    // obstacles and multiple route re-plans. Preserve their proven legacy
    // navigation/formation controller until the new physical follower has a
    // dedicated obstacle-aware handoff. This is a known/visible fallback, not
    // pretending Marchlab already supports every map corner.
    // Stage v253 on local/regional (<=1.8k) routes. Extended multi-road
    // marches still need a follow-the-head replan and obstacle-safe handoff;
    // keep their existing stable controller until that is implemented.
    if(model.length>1800){
      unsupported.add(reg);metrics.longRouteFallbacks++;
      return null;
    }
    const state={march,path:reg.path,model,segment:0,phase:'forming',phaseSince:elapsed,
      lastRoadAt:-Infinity,bridgeId:null,bridgeSide:null,progress:0,arrived:false,
      rankIds:infantry(reg).map(u=>u.id),commandIds:live(reg).filter(u=>u.type!=='infantry').map(u=>u.id)};
    registry.set(reg,state);metrics.orders++;
    return state;
  }catch(_error){metrics.invalidRoutes++;return null;}
}
function projection(model,pt,previous=0){
  // Project the real group anchor onto the one shared route. The route
  // geometry, NOT any independent soldier steering, controls every rank.
  const pts=model.route,L=model.lengths;
  let best={error:Infinity,distance:previous,index:0};
  const from=Math.max(0,Math.min(pts.length-2,Math.floor(model._hint||0)-12));
  const to=Math.min(pts.length-2,Math.max(25,Math.floor(model._hint||0)+90));
  const visit=(start,end)=>{
    for(let i=start;i<end;i++){
      const a=pts[i],b=pts[i+1],dx=b.x-a.x,dy=b.y-a.y;
      const len=dx*dx+dy*dy;if(len<.000001)continue;
      const t=clamp(((pt.x-a.x)*dx+(pt.y-a.y)*dy)/len,0,1);
      const x=a.x+dx*t,y=a.y+dy*t;
      const e=(pt.x-x)**2+(pt.y-y)**2;
      const d=L[i]+Math.sqrt(len)*t;
      // Do not jump backwards along the route at a hairpin.
      if(d<previous-22)continue;
      if(e<best.error){best={error:e,distance:d,index:i};}
    }
  };
  visit(from,to+1);
  if(best.error>135**2)visit(0,pts.length-1);
  model._hint=best.index;
  return Math.max(previous,best.distance);
}
function activeBridge(reg,state,members){
  const info=reg.crossingTrafficV068;
  if(info?.forcedColumn&&info.state!=='waiting'&&info.state!=='queued'){
    const bridge=WATER_CROSSINGS_V067.find(c=>c.id===info.crossingId);
    if(bridge){state.bridgeId=bridge.id;state.bridgeSide=info.initialSide;return bridge;}
  }
  if(!state.bridgeId)return null;
  const bridge=WATER_CROSSINGS_V067.find(c=>c.id===state.bridgeId);
  if(!bridge){state.bridgeId=null;return null;}
  const direction=-state.bridgeSide;
  if(members.length&&members.every(u=>{
    const local=crossingLocalV068(bridge,u.x,u.y);
    return local.along*direction>bridge.length/2+35&&!waterAtV067(u.x,u.y);
  })){state.bridgeId=null;return null;}
  return bridge;
}
function geometry(reg,state,march,bridge,members){
  const existing=state.rankIds;
  const currentInfantry=members.filter(u=>u.type==='infantry');
  // Stable marching order: no random rank reshuffle at waypoints/bridges.
  if(currentInfantry.length!==existing.length||existing.some(id=>!currentInfantry.some(u=>u.id===id))){
    state.rankIds=currentInfantry.map(u=>u.id);
    state.model.count=currentInfantry.length;
  }
  const fileGap=bridge?15:18,rankGap=bridge?19:20;
  const positions=new Map();
  const info=reg.crossingTrafficV068;
  const direction=bridge?-(info?.initialSide??state.bridgeSide):0;
  const local=bridge?crossingLocalV068(bridge,march.anchorX,march.anchorY):null;
  for(const [i,id] of state.rankIds.entries()){
    const rank=Math.floor(i/4),file=i%4;
    const side=(file-1.5)*fileGap;
    let p;
    if(bridge&&direction){
      const along=local.along-direction*rank*rankGap;
      p=crossingPointV068(bridge,along,side);
      p.angle=crossingHeadingV068(bridge,state.bridgeSide);
    }else{
      const center=state.model.positionAt(state.progress-rank*rankGap);
      p={x:center.x-Math.sin(center.angle)*side,y:center.y+Math.cos(center.angle)*side,angle:center.angle};
    }
    positions.set(id,p);
  }
  // Officer and drummer remain in the same column (one short command rank).
  for(const [i,id] of state.commandIds.entries()){
    if(!members.some(u=>u.id===id))continue;
    const commandRank=state.rankIds.length/4+1;
    const commandBack=commandRank*rankGap;
    const side=(i%2?-.5:.5)*fileGap;
    let p;
    if(bridge&&direction){
      p=crossingPointV068(bridge,local.along-direction*commandBack,side);
      p.angle=crossingHeadingV068(bridge,state.bridgeSide);
    }else{
      const center=state.model.positionAt(state.progress-commandBack);
      p={x:center.x-Math.sin(center.angle)*side,y:center.y+Math.cos(center.angle)*side,angle:center.angle};
    }
    positions.set(id,p);
  }
  return positions;
}
function safeMove(u,p,bridge){
  if(!num(p?.x)||!num(p?.y)||waterAtV067(p.x,p.y))return false;
  if(bridge){
    const local=crossingLocalV068(bridge,p.x,p.y);
    if(Math.abs(local.along)<bridge.length/2+4&&Math.abs(local.perp)>bridge.width/2-13)return false;
  }
  // Never shortcut over water even when the sampled curve lies on shore.
  if(segmentCrossesBlockedWaterV067(u.x,u.y,p.x,p.y))return false;
  return true;
}
function syncRegiment(reg,dt,physical){
  if(unsupported.has(reg))return;
  if(!phaseActive(reg)){
    // The group's final *line deployment* is still part of the same order.
    // Keep the old v251 target writer disabled until the deployment has
    // actually finished; otherwise it can seize targets again and freeze
    // a long route 200 px from its destination.
    if(reg?.marchV063?.phase==='deploying'&&registry.has(reg))return;
    registry.delete(reg);
    return;
  }
  const march=reg.marchV063;
  let state=registry.get(reg);
  if(!state||state.march!==march||state.path!==reg.path)
    state=newPlan(reg,march);
  if(!state)return;
  const members=live(reg);
  if(!members.length)return;
  const bridge=activeBridge(reg,state,members);
  const onRoad=(typeof roadAtV064==='function'&&roadAtV064(march.anchorX,march.anchorY))||
    march.locomotionV064==='road-march';
  if(onRoad)state.lastRoadAt=elapsed;
  const road=onRoad||elapsed-state.lastRoadAt<1.35;
  if(!road&&!bridge){state.phase='field';metrics.fieldFrames++;return;}
  if(reg.crossingTrafficV068?.state==='waiting'){
    // Waiting batteries/regiments may not enter before acquiring the lane.
    state.phase='waiting';return;
  }
  const wasField=state.phase==='field';
  if(wasField){state.phase='forming';state.phaseSince=elapsed;metrics.formationHandovers++;}
  const anchor={x:march.anchorX,y:march.anchorY};
  state.progress=projection(state.model,anchor,state.progress);
  state.model.distance=state.progress;
  // The final 260 world units are a structured return to the game's native
  // deployment solver. If the independent column keeps positioning its rear
  // ranks right up to the last waypoint, the anchor can enter 'deploying'
  // while the visible centroid stays >200 units back and never finishes.
  // Hand off BEFORE deployment, only on the route's final leg.
  const finalLeg=reg.pathIndex>=Math.max(0,reg.path.length-2);
  if(!bridge && finalLeg && state.model.length-state.progress<260){
    state.phase='handoff';
    return;
  }
  // Preserve the battle-tested start-up solver until the battalion has had
  // time to assemble. This applies to BOTH target assignment and physical
  // movement; overriding targets from t=0 caused a 50% speed regression.
  // When the bridge traffic explicitly owns the route, use the narrow
  // shared crossing column immediately (the bridge test verifies this).
  if(!bridge && elapsed-state.phaseSince<4.1){
    state.phase='forming';
    return;
  }
  const positions=geometry(reg,state,march,bridge,members);
  if(bridge){metrics.bridgeFrames++;state.phase='bridge';}
  else{metrics.roadFrames++;if(state.phase==='waiting')state.phase='forming';}
  if(!physical){
    for(const u of members){
      const p=positions.get(u.id);
      if(!p||!safeMove(u,p,bridge))continue;
      u.targetX=p.x;u.targetY=p.y;u.formationFacing=p.angle;
      u.marchingV064=true;u.arrivedAtTarget=false;
    }
    return;
  }
  // Modelled *physical* locations: previously the RTS only gave four-file
  // targets to scattered agents. This is what the user's screenshots exposed.
  // Blend in from current positions on initial formation, then the exact
  // Marchlab model becomes authoritative for each soldier on the route.
  const age=elapsed-state.phaseSince;
  // Keep the proven initial acceleration/slot smoothing. The independent
  // Marchlab geometry gradually assumes *physical* ownership only after
  // the regiment has assembled, rather than dragging soldiers backwards
  // during the first seconds of a normal move.
  const weight=bridge?clamp((age-0.8)/0.9,0,1):clamp((age-4.0)/2.5,0,1);
  const cap=Math.max(0.5,Math.min(10,dt*145)); // bounded, never teleport
  for(const u of members){
    const p=positions.get(u.id);
    if(!p||!safeMove(u,p,bridge)){metrics.skippedUnsafe++;continue;}
    const dx=p.x-u.x,dy=p.y-u.y,len=Math.hypot(dx,dy);
    if(len>0.1){
      const amount=Math.min(len,cap)*weight;
      const x=u.x+dx/len*amount,y=u.y+dy/len*amount;
      if(!waterAtV067(x,y)&&!segmentCrossesBlockedWaterV067(u.x,u.y,x,y)){
        u.x=x;u.y=y;metrics.physicalMoves++;
      }
    }
    u.targetX=p.x;u.targetY=p.y;
    u.marchingV064=true;
    u.formationFacing=p.angle;
    u.roadTangentV133=p.angle;
  }
  state.phase=bridge?'bridge':weight>=.99?'marching':'forming';
}
const originalOrder=orderGroupPathV06;
orderGroupPathV06=function orderWithMarchLab(reg,...args){
  unsupported.delete(reg);
  registry.delete(reg);
  const result=originalOrder(reg,...args);
  if(phaseActive(reg))newPlan(reg,reg.marchV063);
  return result;
};
// The old navigation and hazard checks still run, but they no longer own the
// final infantry slot targets in the marching lane.
const previousPaths=updateGroupPathsV06;
updateGroupPathsV06=function updatePathsWithMarchLab(){
  previousPaths();
  for(const reg of regiments)syncRegiment(reg,0,false);
};
// Post-update physically reconcile each soldier to the Marchlab formation.
// This is called in both 60 Hz gameplay and deterministic RTS_SIM.step.
const previousFrame=update;
update=function updateWithMarchLab(dt){
  const value=previousFrame(dt);
  for(const reg of regiments)syncRegiment(reg,dt,true);
  return value;
};
window.__MARCH_LAB_LIVE_V253__=Object.freeze({
  version:'253.1',usingMarchLabCore:true,owns:reg=>registry.has(reg),
  state:reg=>{
    const s=registry.get(reg);
    return s?{phase:s.phase,progress:s.progress,files:4,bridgeId:s.bridgeId,
      length:s.model.length,positions:geometry(reg,s,reg.marchV063,null,live(reg)).size}:null;
  },
  metrics:()=>({...metrics})
});
NRTS.subsystems.register('march-lab-live-v253',window.__MARCH_LAB_LIVE_V253__,{
  phase:'production-formation',legacyBridge:false,
  responsibility:'shared arc-length four-file marching with physical soldier placement from standalone Marchlab'
});
