'use strict';
// ---------- v1.2.2: final gameplay-building movement safety ----------
(function installBuildingMovementSafetyV1(global){
  const nrts=global.NRTS;
  if(!nrts)throw new Error('NRTS foundation runtime must load before building movement safety.');

  const stats={followerDetours:0,penetrationCorrections:0,duplicateReplansSuppressed:0,routeFailures:0,stableLocalDetours:0};
  const cornerExtra=10;
  const arrival=8;

  function obstacles(){
    return buildings.filter(b=>b&&!b.dead&&Number.isFinite(b.x)&&Number.isFinite(b.y)&&Number.isFinite(b.w)&&Number.isFinite(b.h));
  }
  function padFor(u){return Number(TYPES[u?.type]?.radius||6)+4;}
  function inside(p,o,pad){return Math.abs(p.x-o.x)<o.w*.5+pad&&Math.abs(p.y-o.y)<o.h*.5+pad;}
  function exitsBuffer(a,b,o,pad){
    const hw=o.w*.5+pad,hh=o.h*.5+pad,ax=a.x-o.x,ay=a.y-o.y;
    if(Math.abs(ax)>=hw||Math.abs(ay)>=hh)return false;
    const bx=b.x-o.x,by=b.y-o.y;
    return Math.max(Math.abs(bx)/hw,Math.abs(by)/hh)>Math.max(Math.abs(ax)/hw,Math.abs(ay)/hh)+1e-4;
  }
  function segmentHit(a,b,o,pad){
    if(exitsBuffer(a,b,o,pad))return false;
    const hw=o.w*.5+pad,hh=o.h*.5+pad;
    let t0=0,t1=1;const dx=b.x-a.x,dy=b.y-a.y;
    const tests=[[-dx,a.x-(o.x-hw)],[dx,(o.x+hw)-a.x],[-dy,a.y-(o.y-hh)],[dy,(o.y+hh)-a.y]];
    for(const [p,q] of tests){
      if(Math.abs(p)<1e-9){if(q<0)return false;continue;}
      const r=q/p;
      if(p<0){if(r>t1)return false;if(r>t0)t0=r;}
      else{if(r<t0)return false;if(r<t1)t1=r;}
    }
    return t0<=t1&&t1>=0&&t0<=1;
  }
  function firstHit(a,b,pad){
    let best=null,bestD=Infinity;
    for(const o of obstacles()){
      if(!segmentHit(a,b,o,pad))continue;
      const d=Math.hypot(a.x-o.x,a.y-o.y);
      if(d<bestD){best=o;bestD=d;}
    }
    return best;
  }
  function pointClear(p,pad,kind){
    if(p.x<12||p.y<12||p.x>WORLD.width-12||p.y>WORLD.height-12)return false;
    for(const o of obstacles())if(inside(p,o,pad))return false;
    if(typeof waterAtV067==='function'&&waterAtV067(p.x,p.y))return false;
    const village=global.__VILLAGE_NAVIGATION_V7__;
    if(village?.nearestOpenPoint){
      const q=village.nearestOpenPoint(p,kind);
      if(q&&Math.hypot(q.x-p.x,q.y-p.y)>2)return false;
    }
    return true;
  }
  function edgeClear(a,b,pad,kind){
    if(firstHit(a,b,pad))return false;
    if(typeof segmentCrossesBlockedWaterV067==='function'&&segmentCrossesBlockedWaterV067(a.x,a.y,b.x,b.y))return false;
    const village=global.__VILLAGE_NAVIGATION_V7__;
    if(village?.pathClear&&!village.pathClear(a,[b],kind))return false;
    return true;
  }
  function route(a,b,u,preferredBuildingId=null){
    const pad=padFor(u),kind=u?.type==='cavalry'?'cavalry':u?.type==='artillery'?'artillery':'infantry';
    if(edgeClear(a,b,pad,kind))return[b];
    const obs=obstacles();
    const nodes=[{x:a.x,y:a.y,role:'start'},{x:b.x,y:b.y,role:'goal'}];
    for(const o of obs){
      const hw=o.w*.5+pad+cornerExtra,hh=o.h*.5+pad+cornerExtra;
      const corners=[
        {x:o.x-hw,y:o.y-hh,buildingId:o.id},{x:o.x-hw,y:o.y+hh,buildingId:o.id},
        {x:o.x+hw,y:o.y-hh,buildingId:o.id},{x:o.x+hw,y:o.y+hh,buildingId:o.id}
      ];
      for(const p of corners)if(pointClear(p,pad,kind))nodes.push(p);
    }
    const n=nodes.length,dist=new Array(n).fill(Infinity),prev=new Array(n).fill(-1),done=new Array(n).fill(false);dist[0]=0;
    for(let iter=0;iter<n;iter++){
      let at=-1,best=Infinity;
      for(let i=0;i<n;i++)if(!done[i]&&dist[i]<best){best=dist[i];at=i;}
      if(at<0||at===1)break;done[at]=true;
      for(let j=0;j<n;j++){
        if(j===at||done[j]||!edgeClear(nodes[at],nodes[j],pad,kind))continue;
        let cost=Math.hypot(nodes[j].x-nodes[at].x,nodes[j].y-nodes[at].y);
        if(preferredBuildingId&&nodes[j].buildingId===preferredBuildingId)cost-=0.05;
        const nd=dist[at]+cost;
        if(nd<dist[j]){dist[j]=nd;prev[j]=at;}
      }
    }
    if(!Number.isFinite(dist[1])){stats.routeFailures++;return null;}
    const ids=[];let c=1;
    while(c>=0){ids.push(c);if(c===0)break;c=prev[c];if(c<0){stats.routeFailures++;return null;}}
    ids.reverse();return ids.slice(1).map(i=>nodes[i]);
  }
  function guardedFollowerTarget(u,reg,tx,ty){
    const final={x:tx,y:ty},pad=padFor(u),kind=groupKindV06(reg);
    let state=u.buildingFollowerSafetyV122||null;
    const directClear=edgeClear({x:u.x,y:u.y},final,pad,kind);
    if(directClear){u.buildingFollowerSafetyV122=null;return final;}
    if(state){
      const waypoint={x:state.x,y:state.y};
      const targetMoved=Math.hypot(final.x-state.finalX,final.y-state.finalY)>28;
      if(Math.hypot(u.x-waypoint.x,u.y-waypoint.y)<=arrival||targetMoved||!edgeClear({x:u.x,y:u.y},waypoint,pad,kind))state=null;
    }
    if(!state){
      const hit=firstHit({x:u.x,y:u.y},final,pad);
      const path=route({x:u.x,y:u.y},final,u,hit?.id||null);
      if(path?.length&&Math.hypot(path[0].x-final.x,path[0].y-final.y)>2){
        state={x:path[0].x,y:path[0].y,finalX:final.x,finalY:final.y,buildingId:hit?.id||null,startedAt:elapsed};
        u.buildingFollowerSafetyV122=state;stats.followerDetours++;
      }
    }
    return state?{x:state.x,y:state.y}:final;
  }
  function resolvePenetration(u){
    if(!u||u.dead)return false;
    const pad=padFor(u);let corrected=false;
    for(const o of obstacles()){
      if(!inside({x:u.x,y:u.y},o,pad))continue;
      const hw=o.w*.5+pad,hh=o.h*.5+pad,dx=u.x-o.x,dy=u.y-o.y;
      const px=hw-Math.abs(dx),py=hh-Math.abs(dy);
      if(px<py)u.x=o.x+(dx<0?-1:1)*(hw+.75);
      else u.y=o.y+(dy<0?-1:1)*(hh+.75);
      u.arrivedAtTarget=false;corrected=true;stats.penetrationCorrections++;
    }
    return corrected;
  }

  if(typeof dampedSlotMoveV071==='function'){
    const previousDamped=dampedSlotMoveV071;
    dampedSlotMoveV071=function dampedSlotMoveBuildingSafetyV122(u,reg,tx,ty,dt){
      const safe=guardedFollowerTarget(u,reg,tx,ty);
      // The generic local-avoidance layer has a short anti-stale timeout. A building
      // follower detour is authoritative while its corner is still valid, so keep the
      // nested local waypoint alive until we actually reach/clear that corner instead
      // of allowing a 3.2 s timeout to make the unit alternate corners indefinitely.
      if(u.buildingFollowerSafetyV122&&u.localAvoidanceV2){
        u.localAvoidanceV2.startedAt=elapsed;
        stats.stableLocalDetours++;
      }
      const result=previousDamped(u,reg,safe.x,safe.y,dt);
      resolvePenetration(u);
      return result;
    };
  }

  if(typeof orderGroupPathV06==='function'){
    const previousOrder=orderGroupPathV06;
    orderGroupPathV06=function orderGroupPathBuildingStabilityV122(reg,x,y,formation=reg?.formation,finalFacing=null){
      const buildingRoute=reg?.gameplayBuildingRouteV1;
      const target=reg?.finalTarget;
      const sameTarget=target&&Math.hypot(target.x-x,target.y-y)<2;
      const sameFormation=!formation||formation===reg?.formation;
      const crossingBusy=!!(reg?.crossingTrafficV068?.forcedColumn&&['queued','waiting','approach','crossing','clearing'].includes(reg.crossingTrafficV068.state));
      if(buildingRoute?.active&&!buildingRoute.failed&&sameTarget&&sameFormation&&!crossingBusy&&Array.isArray(reg.path)&&reg.path.length){
        // Validate the route chain itself. The current formation centroid may already
        // have passed the first waypoint; validating centroid -> path[0] then creates
        // a false blocker and made stuck-recovery rebuild the same route every ~3 s.
        const api=global.__GAMEPLAY_BUILDING_ROUTING_V1__;
        let safe=!!api?.segmentBlocked;
        if(safe){
          for(let i=1;i<reg.path.length;i++){
            if(api.segmentBlocked(reg.path[i-1],reg.path[i],buildingRoute.kind,buildingRoute.pad)){safe=false;break;}
          }
        }
        if(safe){stats.duplicateReplansSuppressed++;return;}
      }
      return previousOrder(reg,x,y,formation,finalFacing);
    };
  }

  const previousUpdate=update;
  update=function updateWithBuildingMovementSafetyV122(dt){
    previousUpdate(dt);
    if(!(dt>0)||gameOver)return;
    for(const u of units)resolvePenetration(u);
  };

  const api=Object.freeze({version:'building-movement-safety-v1.1',formalFollowerDetours:true,physicalBuildingSeparation:true,stableBuildingReplans:true,stableNestedDetours:true,stats:()=>({...stats})});
  global.__BUILDING_MOVEMENT_SAFETY_V1__=api;
  nrts.subsystems.register('building-movement-safety',api,{phase:'v1.2.2',legacyBridge:false,responsibility:'keep moving troop envelopes outside gameplay-building footprints and stabilize already-safe building detours'});
})(window);
