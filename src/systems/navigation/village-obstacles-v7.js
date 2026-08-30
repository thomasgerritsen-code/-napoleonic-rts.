'use strict';
// ---------- Village navigation v7: scenery roofs are real movement obstacles ----------
(function installVillageNavigationV7(global) {
  const nrts=global.NRTS;
  if (!nrts) throw new Error('NRTS foundation runtime must load before Village V7 navigation.');
  const villages=global.VILLAGE_SCENERY_V4 || global.__VILLAGE_SCENERY_V4_DATA__;
  if (!villages) throw new Error('Village collision data must load before Village V7 navigation.');
  if (typeof orderGroupPathV06!=='function' || typeof moveToward!=='function') {
    throw new Error('Movement/path functions must load before Village V7 navigation.');
  }

  const obstacles=Object.freeze(villages.flatMap(v=>v.houses.map(h=>Object.freeze({
    id:h.id || `${h.kind}-${Math.round(h.x)}-${Math.round(h.y)}`,
    x:h.x,y:h.y,w:h.w,h:h.h,angle:h.angle||0,kind:h.kind||'cottage',zone:h.zone||'legacy'
  }))));

  const ROUTE_MARGIN=Object.freeze({infantry:13,cavalry:18,artillery:20,worker:7});
  const UNIT_MARGIN=2.8;

  function kindMargin(kind){return ROUTE_MARGIN[kind] ?? ROUTE_MARGIN.infantry;}
  function routeRadius(obstacle,kind){return Math.hypot(obstacle.w,obstacle.h)*.5+kindMargin(kind);}

  function segmentCircleHit(a,b,o,r){
    const vx=b.x-a.x,vy=b.y-a.y;
    const len2=vx*vx+vy*vy;
    if(len2<1e-6) return Math.hypot(a.x-o.x,a.y-o.y)<=r?{t:0,d:0}:null;
    const t=Math.max(0,Math.min(1,((o.x-a.x)*vx+(o.y-a.y)*vy)/len2));
    const px=a.x+vx*t,py=a.y+vy*t;
    const d=Math.hypot(px-o.x,py-o.y);
    return d<=r?{t,d}:null;
  }

  function firstRouteHit(a,b,kind,ignoreId=null){
    let best=null;
    for(const obstacle of obstacles){
      if(obstacle.id===ignoreId) continue;
      const hit=segmentCircleHit(a,b,obstacle,routeRadius(obstacle,kind));
      if(hit && (!best || hit.t<best.hit.t)) best={obstacle,hit};
    }
    return best;
  }

  function inWorld(p,margin=8){
    return p.x>=margin&&p.y>=margin&&p.x<=WORLD.width-margin&&p.y<=WORLD.height-margin;
  }

  function candidatePenalty(a,p1,p2,b,kind,hitObstacle){
    if(!inWorld(p1)||!inWorld(p2)) return Infinity;
    let penalty=Math.hypot(p1.x-a.x,p1.y-a.y)+Math.hypot(p2.x-p1.x,p2.y-p1.y)+Math.hypot(b.x-p2.x,b.y-p2.y);
    const segments=[[a,p1],[p1,p2],[p2,b]];
    for(const [s,e] of segments){
      for(const other of obstacles){
        if(other.id===hitObstacle.id) continue;
        if(segmentCircleHit(s,e,other,routeRadius(other,kind))) penalty+=10000;
      }
    }
    return penalty;
  }

  function bypassFor(a,b,kind,obstacle){
    let dx=b.x-a.x,dy=b.y-a.y;
    const len=Math.hypot(dx,dy)||1;dx/=len;dy/=len;
    const nx=-dy,ny=dx;
    const r=routeRadius(obstacle,kind);
    const options=[];
    for(const side of [-1,1]){
      const lateral=r*1.34+6;
      const along=r*.72;
      const p1={x:obstacle.x-dx*along+nx*side*lateral,y:obstacle.y-dy*along+ny*side*lateral};
      const p2={x:obstacle.x+dx*along+nx*side*lateral,y:obstacle.y+dy*along+ny*side*lateral};
      options.push({p1,p2,penalty:candidatePenalty(a,p1,p2,b,kind,obstacle)});
    }
    options.sort((p,q)=>p.penalty-q.penalty);
    return options[0];
  }

  function avoidSegment(a,b,kind,depth=0){
    if(depth>7) return [b];
    const blocked=firstRouteHit(a,b,kind);
    if(!blocked) return [b];
    const bypass=bypassFor(a,b,kind,blocked.obstacle);
    if(!bypass||!Number.isFinite(bypass.penalty)) return [b];
    const first=avoidSegment(a,bypass.p1,kind,depth+1);
    const c1=first[first.length-1]||a;
    const middle=avoidSegment(c1,bypass.p2,kind,depth+1);
    const c2=middle[middle.length-1]||c1;
    const last=avoidSegment(c2,b,kind,depth+1);
    return [...first,...middle,...last];
  }

  function dedupe(points,epsilon=2){
    const out=[];
    for(const p of points){
      if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)) continue;
      const last=out[out.length-1];
      if(!last||Math.hypot(last.x-p.x,last.y-p.y)>epsilon) out.push({x:p.x,y:p.y});
    }
    return out;
  }

  function nearestOpenPoint(point,kind='infantry'){
    let p={x:point.x,y:point.y};
    for(let pass=0;pass<8;pass++){
      let moved=false;
      for(const obstacle of obstacles){
        const r=routeRadius(obstacle,kind)+4;
        const dx=p.x-obstacle.x,dy=p.y-obstacle.y,d=Math.hypot(dx,dy);
        if(d>=r) continue;
        const angle=d>1e-4?Math.atan2(dy,dx):(obstacle.angle+Math.PI/2);
        p={x:obstacle.x+Math.cos(angle)*r,y:obstacle.y+Math.sin(angle)*r};
        p.x=Math.max(8,Math.min(WORLD.width-8,p.x));
        p.y=Math.max(8,Math.min(WORLD.height-8,p.y));
        moved=true;
      }
      if(!moved) break;
    }
    return p;
  }

  function avoidPath(start,path,kind='infantry'){
    const out=[];
    let cursor={x:start.x,y:start.y};
    for(const raw of path||[]){
      const target=nearestOpenPoint(raw,kind);
      const section=avoidSegment(cursor,target,kind);
      for(const p of section){out.push(p);cursor=p;}
    }
    return dedupe(out);
  }

  function localRoofCorrection(point,obstacle,margin=UNIT_MARGIN){
    const cos=Math.cos(obstacle.angle),sin=Math.sin(obstacle.angle);
    const dx=point.x-obstacle.x,dy=point.y-obstacle.y;
    let lx=dx*cos+dy*sin,ly=-dx*sin+dy*cos;
    const hw=obstacle.w*.5+margin,hh=obstacle.h*.5+margin;
    if(Math.abs(lx)>=hw||Math.abs(ly)>=hh) return null;
    const px=hw-Math.abs(lx),py=hh-Math.abs(ly);
    if(px<py) lx=(lx<0?-1:1)*hw;
    else ly=(ly<0?-1:1)*hh;
    return {x:obstacle.x+lx*cos-ly*sin,y:obstacle.y+lx*sin+ly*cos};
  }

  function resolveUnitPoint(point){
    let p={x:point.x,y:point.y},corrected=false;
    for(let pass=0;pass<4;pass++){
      let changed=false;
      for(const obstacle of obstacles){
        const next=localRoofCorrection(p,obstacle);
        if(!next) continue;
        p=next;changed=true;corrected=true;
      }
      if(!changed) break;
    }
    return {point:p,corrected};
  }

  function pathClear(start,path,kind='infantry'){
    let cursor=start;
    for(const p of path||[]){
      if(firstRouteHit(cursor,p,kind)) return false;
      cursor=p;
    }
    return true;
  }

  const orderBeforeVillageNavigation=orderGroupPathV06;
  orderGroupPathV06=function orderGroupPathVillageV7(reg,x,y,formation=reg?.formation,finalFacing=null){
    if(!reg||reg.destroyed) return orderBeforeVillageNavigation(reg,x,y,formation,finalFacing);
    const kind=typeof groupKindV06==='function'?groupKindV06(reg):(reg.kind||'infantry');
    const safeGoal=nearestOpenPoint({x,y},kind);
    const members=typeof regimentMembers==='function'?regimentMembers(reg):[];
    const start=members.length&&typeof centroid==='function'?centroid(members):{x:reg.targetX??safeGoal.x,y:reg.targetY??safeGoal.y};

    orderBeforeVillageNavigation(reg,safeGoal.x,safeGoal.y,formation,finalFacing);
    if(!reg.path?.length) return;

    const anchor=reg.marchV063?.v064?{x:reg.marchV063.anchorX,y:reg.marchV063.anchorY}:start;
    reg.path=avoidPath(anchor,reg.path,kind);
    reg.pathIndex=0;
    reg.finalTarget={x:safeGoal.x,y:safeGoal.y};
    if(reg.marchV063?.v064){
      reg.marchV063.finalX=safeGoal.x;
      reg.marchV063.finalY=safeGoal.y;
      const first=reg.path[0];
      if(first) reg.marchV063.marchFacing=Math.atan2(first.y-reg.marchV063.anchorY,first.x-reg.marchV063.anchorX);
      if(typeof setLocomotionTargetsV064==='function') setLocomotionTargetsV064(reg,reg.marchV063,Boolean(typeof roadNetworkAtV066==='function'&&roadNetworkAtV066(reg.marchV063.anchorX,reg.marchV063.anchorY)));
    }
    reg.villageNavigationV7={active:true,obstacleCount:obstacles.length,safeGoalAdjusted:Math.hypot(safeGoal.x-x,safeGoal.y-y)>1};
  };

  const moveTowardBeforeVillageNavigation=moveToward;
  moveToward=function moveTowardVillageV7(u,tx,ty,dt,speed=TYPES[u.type].speed){
    const arrived=moveTowardBeforeVillageNavigation(u,tx,ty,dt,speed);
    if(!u||u.dead) return arrived;
    const resolved=resolveUnitPoint({x:u.x,y:u.y});
    if(!resolved.corrected) return arrived;
    u.x=resolved.point.x;u.y=resolved.point.y;
    u.arrivedAtTarget=false;
    const targetResolved=resolveUnitPoint({x:u.targetX,y:u.targetY});
    if(targetResolved.corrected){u.targetX=targetResolved.point.x;u.targetY=targetResolved.point.y;}
    return false;
  };

  const api=Object.freeze({
    version:'village-navigation-v7',
    obstacleCount:obstacles.length,
    blocksSceneryRoofs:true,
    formationAwareRouting:true,
    finalTargetSanitization:true,
    perUnitRoofGuard:true,
    routeMargin:Object.freeze({...ROUTE_MARGIN}),
    avoidPath,
    pathClear,
    nearestOpenPoint,
    resolveUnitPoint
  });
  global.__VILLAGE_NAVIGATION_V7__=api;
  nrts.subsystems.register('village-navigation-v7',api,{
    phase:'architecture-v2',legacyBridge:false,
    responsibility:'route regiments around scenery structures and prevent individual units from entering visible roofs'
  });
})(window);
