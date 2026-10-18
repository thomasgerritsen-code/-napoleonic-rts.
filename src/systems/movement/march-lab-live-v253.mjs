import { Path } from '../../../vendor/yuka/Path.mjs';
import { Vector3 } from '../../../vendor/yuka/Vector3.mjs';

// RTS v257: single physical road/bridge column authority.
// YUKA Path (MIT, vendor/yuka/LICENSE) is the battle-tested waypoint/history
// container. One route-following ANCHOR navigates, then four fixed file slots
// sample its *traversed* path. Soldiers never pathfind individually on roads.
// Traffic arbitration, bridge permits, road-speed and combat remain in RTS.
const controllers = new WeakMap();
const stats = {orders:0,roadFrames:0,bridgeFrames:0,physicalMoves:0,
  skippedUnsafe:0,invalidRoutes:0,longRouteOrders:0,longRouteFallbacks:0,
  preservedReplans:0,formationHandovers:0,fieldFrames:0,trailResets:0,
  singleAuthorityFrames:0,blockedWaterSteps:0,waterCorrections:0,
  staleBridgeWaypointsSkipped:0,bridgeAnchorCaps:0,bridgeLaneRecoverySteps:0};
const finite = Number.isFinite;
const clamp = (x,a,b)=>Math.max(a,Math.min(b,x));
const distance = (a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const living = reg=>regimentMembers(reg).filter(u=>!u.dead&&!u.routing);
const infantry = reg=>living(reg).filter(u=>u.type==='infantry');
const infantryMarch = reg=>Boolean(reg&&!reg.destroyed&&reg.path&&
  reg.marchV063?.v064&&groupKindV06(reg)==='infantry'&&!reg.engagementV069&&
  !['combat-halt','deploying','arrived'].includes(reg.marchV063.phase));

function makeWaypoints(reg,march) {
  const path=new Path();
  path.add(new Vector3(march.anchorX,0,march.anchorY));
  let length=0,last={x:march.anchorX,y:march.anchorY};
  for(const p of reg.path||[]){
    if(!finite(p.x)||!finite(p.y)||distance(p,last)<0.5)continue;
    length+=distance(p,last);
    path.add(new Vector3(p.x,0,p.y));
    last=p;
  }
  return {path,length};
}
function startController(reg,previous=null) {
  const march=reg.marchV063;
  if(!march)return null;
  const plan=makeWaypoints(reg,march);
  if(plan.path._waypoints.length<2)return null;
  const preserve=previous?.march===march;
  const travel=preserve?previous.travel:new Path();
  if(!preserve)travel.add(new Vector3(march.anchorX,0,march.anchorY));
  const state={march,sourcePath:reg.path,plan:plan.path,routeLength:plan.length,
    travel,phase:preserve?previous.phase:'forming',active:false,
    startedAt:preserve?previous.startedAt:elapsed,
    bridgeProgress:preserve?previous.bridgeProgress:null,
    laneOverrides:preserve?previous.laneOverrides:new Map(),
    lastRoadAt:preserve?previous.lastRoadAt:-Infinity,
    bridgeId:preserve?previous.bridgeId:null,
    bridgeSide:preserve?previous.bridgeSide:null,
    rankIds:preserve?previous.rankIds:infantry(reg).map(u=>u.id),
    staffIds:preserve?previous.staffIds:living(reg).filter(u=>u.type!=='infantry').map(u=>u.id),
    desired:new Map(),distance:preserve?previous.distance:0,
    lastSafe:preserve?previous.lastSafe:new Map(living(reg).filter(u=>!waterAtV067(u.x,u.y))
      .map(u=>[u.id,{x:u.x,y:u.y}]))};
  controllers.set(reg,state);
  stats.orders++;
  if(plan.length>1800)stats.longRouteOrders++;
  if(preserve)stats.preservedReplans++;
  return state;
}
function bridgeFor(reg,state) {
  const info=reg.crossingTrafficV068;
  if(info?.forcedColumn && info.state!=='waiting' && info.state!=='queued'){
    const b=WATER_CROSSINGS_V067.find(x=>x.id===info.crossingId);
    if(b){if(state.bridgeId!==b.id)state.bridgeProgress=null;
      state.bridgeId=b.id;state.bridgeSide=info.initialSide;return b;}
  }
  if(!state.bridgeId)return null;
  const b=WATER_CROSSINGS_V067.find(x=>x.id===state.bridgeId);
  if(!b){state.bridgeId=null;state.bridgeProgress=null;state.laneOverrides.clear();return null;}
  const direction=-(state.bridgeSide||1);
  if(living(reg).every(u=>{
    const local=crossingLocalV068(b,u.x,u.y);
    return local.along*direction>b.length/2+35&&!waterAtV067(u.x,u.y);
  })){state.bridgeId=null;state.bridgeProgress=null;state.laneOverrides.clear();return null;}
  return b;
}
// Legacy traffic may release its holder while the tail is still on deck.
// A later navigation replan must not make the bridge leader run backwards.
function stabilizeBridgeAnchor(state,march,bridge){
  if(!finite(state.bridgeSide))return;
  const dir=-state.bridgeSide;
  const local=crossingLocalV068(bridge,march.anchorX,march.anchorY);
  let along=local.along*dir;
  const half=bridge.length/2;
  if(state.bridgeProgress===null&&(along< -half-35||along>half+85))return;
  if(state.bridgeProgress===null)state.bridgeProgress=along;
  const dt=typeof formationDtV063==='number'?clamp(formationDtV063,.001,.05):.05;
  // Do not pull the lead files arbitrarily far away from a stranded tail.
  // An earlier build marched a Pont de la Crête leader >2500 units from the deck.
  const ranks=Math.ceil(state.rankIds.length/4);
  const safeLimit=half+Math.max(150,(ranks+3)*19+55);
  const minimum=Math.min(safeLimit,state.bridgeProgress+dt*35);
  const maximum=Math.min(safeLimit,state.bridgeProgress+dt*150);
  const next=clamp(Math.max(along,minimum),state.bridgeProgress,Math.max(state.bridgeProgress,maximum));
  if(next>=safeLimit-.01)stats.bridgeAnchorCaps++;
  along=next;
  state.bridgeProgress=along;
  const p=crossingPointV068(bridge,along*dir,0);
  march.anchorX=p.x;
  march.anchorY=p.y;
  march.marchFacing=crossingHeadingV068(bridge,state.bridgeSide);
}
function discardPassedBridgeWaypoints(reg,state,bridge,march){
  // The bridge solver can carry the physical column farther than legacy path
  // indices advance. After the exit, stale approach/entry waypoints would
  // otherwise send the battalion straight BACK onto the bridge.
  const direction=-(state.bridgeSide||1);
  const front=crossingLocalV068(bridge,march.anchorX,march.anchorY).along*direction;
  if(front<bridge.length/2+24||!reg.path?.length)return;
  let index=reg.pathIndex||0;
  const start=index;
  const threshold=Math.max(bridge.length/2+14,front-32);
  while(index<reg.path.length-1){
    const p=reg.path[index];
    if(!finite(p?.x)||!finite(p?.y)){index++;continue;}
    const progress=crossingLocalV068(bridge,p.x,p.y).along*direction;
    if(progress>=threshold)break;
    index++;
  }
  if(index>start){reg.pathIndex=index;stats.staleBridgeWaypointsSkipped+=index-start;}
}
function recordLeader(state,march){
  // YUKA.Path stores the actual route already travelled: no corner shortcut.
  const path=state.travel,pts=path._waypoints;
  const p=new Vector3(march.anchorX,0,march.anchorY);
  const last=path.current()||pts[pts.length-1];
  if(!last){path.add(p);return;}
  const d=Math.hypot(p.x-last.x,p.z-last.z);
  if(d>125){path.clear();path.add(p);stats.trailResets++;return;}
  if(d<0.9)return;
  state.distance+=d;
  path.add(p);
  path.advance();
  // Bounded history means thousands of waypoints never leak memory.
  let accumulated=0,keep=pts.length-1;
  for(let i=pts.length-2;i>=0;i--){
    accumulated+=Math.hypot(pts[i+1].x-pts[i].x,pts[i+1].z-pts[i].z);
    if(accumulated>850){keep=i+1;break;}
  }
  if(keep>0){pts.splice(0,keep);path._index=Math.max(0,path._index-keep);}
}
function traveledPosition(state,back,heading){
  const pts=state.travel._waypoints;
  if(!pts.length)return null;
  const front=pts[pts.length-1];
  const prev=pts[pts.length-2];
  const initial=prev?Math.atan2(front.z-prev.z,front.x-prev.x):heading;
  if(back<=0)return{x:front.x-Math.cos(initial)*back,y:front.z-Math.sin(initial)*back,angle:initial};
  let remaining=back;
  for(let i=pts.length-1;i>0;i--){
    const a=pts[i],b=pts[i-1];
    const d=Math.hypot(a.x-b.x,a.z-b.z);
    if(d<0.001)continue;
    const angle=Math.atan2(a.z-b.z,a.x-b.x);
    if(remaining<=d){
      const t=remaining/d;
      return{x:a.x+(b.x-a.x)*t,y:a.z+(b.z-a.z)*t,angle};
    }
    remaining-=d;
  }
  const oldest=pts[0],next=pts[1];
  const angle=next?Math.atan2(next.z-oldest.z,next.x-oldest.x):initial;
  return{x:oldest.x-Math.cos(angle)*remaining,
    y:oldest.z-Math.sin(angle)*remaining,angle};
}
function targets(reg,state,march,bridge,people){
  const foot=people.filter(u=>u.type==='infantry');
  const liveIds=new Set(foot.map(u=>u.id));
  const kept=state.rankIds.filter(id=>liveIds.has(id));
  for(const u of foot)if(!kept.includes(u.id))kept.push(u.id);
  state.rankIds=kept;
  const rows=Math.ceil(kept.length/4);
  const gap=bridge?19:20;
  const fileGap=bridge?15:18;
  const half=(rows-1)*gap/2;
  const result=new Map();
  const info=reg.crossingTrafficV068;
  const direction=bridge?-(info?.initialSide??state.bridgeSide??-1):0;
  const local=bridge?crossingLocalV068(bridge,march.anchorX,march.anchorY):null;
  function point(back,side){
    let base;
    if(bridge && direction){
      base=crossingPointV068(bridge,local.along-direction*back,side);
      return{x:base.x,y:base.y,angle:crossingHeadingV068(bridge,state.bridgeSide)};
    }
    base=traveledPosition(state,back,march.marchFacing);
    if(!base)return null;
    return{x:base.x-Math.sin(base.angle)*side,y:base.y+Math.cos(base.angle)*side,angle:base.angle};
  }
  for(let i=0;i<kept.length;i++){
    const row=Math.floor(i/4),file=i%4;
    const lane=state.laneOverrides.get(kept[i]);
    result.set(kept[i],point(row*gap-half,lane??(file-1.5)*fileGap));
  }
  const staff=state.staffIds.filter(id=>people.some(u=>u.id===id));
  staff.forEach((id,i)=>result.set(id,point((rows+0.4)*gap-half,state.laneOverrides.get(id)??(i-.5)*fileGap)));
  return result;
}
function slotIsSafe(p,bridge){
  if(!p||!finite(p.x)||!finite(p.y)||waterAtV067(p.x,p.y))return false;
  if(bridge){
    const local=crossingLocalV068(bridge,p.x,p.y);
    if(Math.abs(local.along)<bridge.length/2+4&&
      Math.abs(local.perp)>bridge.width/2-13)return false;
  }
  return true;
}
function controlled(reg){
  const s=controllers.get(reg);
  return Boolean(s?.active&&infantryMarch(reg)&&
    !(reg.formationTrafficV132?.until>elapsed)&&
    !['waiting','queued'].includes(reg.crossingTrafficV068?.state));
}
function refresh(reg){
  if(!infantryMarch(reg)){
    const s=controllers.get(reg);
    if(s)s.active=false;
    return;
  }
  const march=reg.marchV063;
  let s=controllers.get(reg);
  if(!s||s.march!==march||s.sourcePath!==reg.path)
    s=startController(reg,s);
  if(!s)return;
  const people=living(reg),bridge=bridgeFor(reg,s);
  if(bridge){
    stabilizeBridgeAnchor(s,march,bridge);
    discardPassedBridgeWaypoints(reg,s,bridge,march);
  }
  const onRoad=Boolean(bridge||march.locomotionV064==='road-march'||
    (typeof roadAtV064==='function'&&roadAtV064(march.anchorX,march.anchorY)));
  if(onRoad)s.lastRoadAt=elapsed;
  const road=onRoad||elapsed-s.lastRoadAt<1.25;
  const wait=['waiting','queued'].includes(reg.crossingTrafficV068?.state);
  const passing=reg.formationTrafficV132?.until>elapsed;
  s.active=Boolean((road||bridge)&&!wait&&!passing);
  if(!s.active){
    s.phase=wait?'waiting':passing?'passing':'field';
    if(!road&&!bridge)stats.fieldFrames++;
    return;
  }
  if(s.phase==='field')stats.formationHandovers++;
  recordLeader(s,march);
  s.desired=targets(reg,s,march,bridge,people);
  for(const u of people){
    const p=s.desired.get(u.id);
    if(!slotIsSafe(p,bridge)){stats.skippedUnsafe++;continue;}
    u.targetX=p.x;u.targetY=p.y;
    u.formationFacing=p.angle;
    u.roadTangentV133=p.angle;
    u.marchingV064=true;
    u.arrivedAtTarget=false;
  }
  s.phase=bridge?'bridge':'marching';
  if(bridge)stats.bridgeFrames++;else stats.roadFrames++;
}
function advanceSoldiers(reg,s,dt){
  const bridge=bridgeFor(reg,s);
  const members=living(reg);
  if(!members.length)return;
  for(const u of members){
    const p=s.desired.get(u.id);
    if(!slotIsSafe(p,bridge))continue;
    const dx=p.x-u.x,dy=p.y-u.y;
    const d=Math.hypot(dx,dy);
    if(d<=0.001)continue;
    // One and only one source of physical infantry movement. The group anchor
    // supplies the normal pace; individual ranks catch up without teleporting.
    const normal=Number(TYPES[u.type]?.speed)||70;
    const age=Math.max(0,elapsed-s.startedAt);
    const speed=age<.95?clamp(normal*2.95,150,168):clamp(normal*2.60,130,149);
    const step=Math.min(d,speed*Math.max(0,Math.min(dt,0.1)));
    if(step<=0)continue;
    const x=u.x+dx/d*step,y=u.y+dy/d*step;
    if(waterAtV067(x,y)||segmentCrossesBlockedWaterV067(u.x,u.y,x,y)){
      stats.blockedWaterSteps++;
      if(bridge&&finite(s.bridgeSide)){
        const local=crossingLocalV068(bridge,u.x,u.y);
        const direction=-s.bridgeSide;
        // At a curved bridge mouth the outer file sometimes encounters a
        // narrow wedge of blocked river water *outside* the legal deck.
        // Slide inward by at most one physical step, not through the water.
        // Retain the temporary lane for the remainder of the crossing so
        // the ordinary formation solver cannot immediately pull it back.
        const signed=local.along*direction;
        if(signed<bridge.length/2+32&&Math.abs(local.perp)>1){
          const inward=Math.min(Math.abs(local.perp),Math.min(step,4.2));
          const newLane=local.perp-Math.sign(local.perp)*inward;
          const safe=crossingPointV068(bridge,local.along,newLane);
          if(!waterAtV067(safe.x,safe.y)&&
              !segmentCrossesBlockedWaterV067(u.x,u.y,safe.x,safe.y)){
            u.x=safe.x;u.y=safe.y;u.arrivedAtTarget=false;
            s.laneOverrides.set(u.id,newLane);
            stats.bridgeLaneRecoverySteps++;
            stats.physicalMoves++;
            continue;
          }
        }
      }
      continue;
    }
    if(bridge&&s.laneOverrides.has(u.id)){
      const local=crossingLocalV068(bridge,x,y);
      if(local.along*(-s.bridgeSide)>bridge.length/2+42)
        s.laneOverrides.delete(u.id);
    }
    u.x=x;u.y=y;stats.physicalMoves++;
    const facingDelta=Math.atan2(Math.sin(p.angle-u.facing),Math.cos(p.angle-u.facing));
    u.facing+=clamp(facingDelta,-dt*4.4,dt*4.4);
  }
  stats.singleAuthorityFrames++;
}
const originalOrder=orderGroupPathV06;
orderGroupPathV06=function orderRoadColumnV257(reg,...args){
  controllers.delete(reg);
  const value=originalOrder(reg,...args);
  if(infantryMarch(reg))startController(reg);
  return value;
};
const originalPaths=updateGroupPathsV06;
updateGroupPathsV06=function pathsRoadColumnV257(){
  originalPaths(); // one existing route planner + crossing permit owner
  for(const reg of regiments)refresh(reg);
};
const originalMove=moveToward;
moveToward=function moveTowardRoadColumnV257(u,...args){
  const reg=u.regimentId?getRegiment(u.regimentId):null;
  if(reg&&controlled(reg)){
    // No independent per-soldier seek/damping while the four-file controller
    // owns the actual coordinates. Combat, field, and waiting stay untouched.
    u.arrivedAtTarget=false;
    return false;
  }
  return originalMove(u,...args);
};
function guardPhysicalWater(state,reg){
  // Independent legacy field/bridge handoff code may update a soldier on the
  // frame the new controller yields. Keep the last valid (normally <=1 step
  // old) physical location; never expose a soldier in blocked river water.
  for(const u of living(reg)){
    if(waterAtV067(u.x,u.y)){
      const previous=state.lastSafe.get(u.id);
      if(previous&&!waterAtV067(previous.x,previous.y)){
        u.x=previous.x;u.y=previous.y;
        if(finite(u.vx))u.vx=0;
        if(finite(u.vy))u.vy=0;
        u.arrivedAtTarget=false;
        stats.waterCorrections++;
      }
    }else state.lastSafe.set(u.id,{x:u.x,y:u.y});
  }
}
const originalUpdate=update;
update=function updateRoadColumnV257(dt){
  const result=originalUpdate(dt);
  for(const reg of regiments){
    const s=controllers.get(reg);
    if(!s||reg.destroyed)continue;
    guardPhysicalWater(s,reg);
    if(controlled(reg))advanceSoldiers(reg,s,dt);
    guardPhysicalWater(s,reg);
  }
  return result;
};
const api=Object.freeze({
  version:'257.0',singleAuthority:true,openSource:'YUKA Path (MIT)',
  usingMarchLabCore:false,owns:controlled,
  state:reg=>{
    const s=controllers.get(reg);
    return s?{phase:s.phase,files:4,length:s.routeLength,progress:s.distance,
      bridgeId:s.bridgeId,trailPoints:s.travel._waypoints.length,
      trailLength:Math.min(850,s.distance),positions:s.desired.size,
      active:s.active}:null;
  },
  metrics:()=>({...stats})
});
window.__ROAD_COLUMN_V257__=api;
// Compatibility for older diagnostics only, not a second controller.
window.__MARCH_LAB_LIVE_V253__=api;
NRTS.subsystems.register('road-column-v257',api,{
  phase:'production-movement',legacyBridge:false,
  responsibility:'one YUKA-backed four-file physical column owner per infantry regiment'
});
