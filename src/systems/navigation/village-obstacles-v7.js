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

  const ROUTE_MARGIN=Object.freeze({infantry:15,cavalry:20,artillery:23,worker:8});
  const UNIT_MARGIN=3.5;
  const RING_BUFFER=26;

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

  function exitsExistingBuffer(a,b,obstacle,r){
    const ax=a.x-obstacle.x,ay=a.y-obstacle.y;
    const startDistance=Math.hypot(ax,ay);
    if(startDistance>=r) return false;
    const vx=b.x-a.x,vy=b.y-a.y;
    const outwardDerivative=ax*vx+ay*vy;
    const endDistance=Math.hypot(b.x-obstacle.x,b.y-obstacle.y);
    // A segment that begins in a formation-clearance buffer may leave it, but may never
    // initially move deeper through that buffer. This keeps units from becoming trapped by
    // a safety margin while preserving the actual roof as a hard per-unit obstacle.
    return outwardDerivative>=-1e-6 && endDistance>startDistance+0.5;
  }

  function firstRouteHit(a,b,kind,ignoreId=null){
    let best=null;
    for(const obstacle of obstacles){
      if(obstacle.id===ignoreId) continue;
      const r=routeRadius(obstacle,kind);
      if(exitsExistingBuffer(a,b,obstacle,r)) continue;
      const hit=segmentCircleHit(a,b,obstacle,r);
      if(hit && (!best || hit.t<best.hit.t)) best={obstacle,hit};
    }
    return best;
  }

  function inWorld(p,margin=8){
    return p.x>=margin&&p.y>=margin&&p.x<=WORLD.width-margin&&p.y<=WORLD.height-margin;
  }

  function routePointClear(point,kind,extra=3){
    if(!inWorld(point,8)) return false;
    for(const obstacle of obstacles){
      if(Math.hypot(point.x-obstacle.x,point.y-obstacle.y)<=routeRadius(obstacle,kind)+extra) return false;
    }
    return true;
  }

  function relevantObstacles(a,b,kind,pad){
    if(!Number.isFinite(pad)) return obstacles;
    return obstacles.filter(obstacle=>segmentCircleHit(a,b,obstacle,routeRadius(obstacle,kind)+pad));
  }

  function visibilityNodes(a,b,kind,pad,samples){
    const relevant=relevantObstacles(a,b,kind,pad);
    const nodes=[{x:a.x,y:a.y,role:'start'},{x:b.x,y:b.y,role:'goal'}];
    for(const obstacle of relevant){
      const ring=routeRadius(obstacle,kind)+RING_BUFFER;
      for(let i=0;i<samples;i++){
        const angle=(i/samples)*Math.PI*2;
        const p={
          x:obstacle.x+Math.cos(angle)*ring,
          y:obstacle.y+Math.sin(angle)*ring,
          role:'ring',obstacleId:obstacle.id
        };
        if(routePointClear(p,kind,2)) nodes.push(p);
      }
    }
    return nodes;
  }

  function reconstructVisibilityPath(nodes,previous,goalIndex){
    const indexes=[];
    let cursor=goalIndex;
    while(cursor>=0){
      indexes.push(cursor);
      if(cursor===0) break;
      cursor=previous[cursor];
      if(cursor===undefined || cursor===null || cursor<0) return null;
    }
    indexes.reverse();
    return indexes.slice(1).map(index=>({x:nodes[index].x,y:nodes[index].y}));
  }

  function simplifyClearPath(start,path,kind){
    const source=path||[];
    if(source.length<2) return source.map(p=>({x:p.x,y:p.y}));
    const out=[];
    let cursor={x:start.x,y:start.y};
    let index=0;
    while(index<source.length){
      let chosen=index;
      for(let candidate=source.length-1;candidate>=index;candidate--){
        if(!firstRouteHit(cursor,source[candidate],kind)){
          chosen=candidate;
          break;
        }
      }
      const point={x:source[chosen].x,y:source[chosen].y};
      out.push(point);
      cursor=point;
      index=chosen+1;
    }
    return out;
  }

  function visibilityRoute(a,b,kind,pad=220,samples=12){
    if(!firstRouteHit(a,b,kind)) return [{x:b.x,y:b.y}];
    const nodes=visibilityNodes(a,b,kind,pad,samples);
    if(nodes.length<3) return null;

    const count=nodes.length;
    const g=new Array(count).fill(Infinity);
    const f=new Array(count).fill(Infinity);
    const previous=new Array(count).fill(-1);
    const open=new Set([0]);
    const closed=new Set();
    g[0]=0;
    f[0]=Math.hypot(b.x-a.x,b.y-a.y);

    for(let iteration=0;open.size && iteration<count*3;iteration++){
      let current=-1,best=Infinity;
      for(const index of open){
        if(f[index]<best){best=f[index];current=index;}
      }
      if(current<0) break;
      if(current===1){
        const raw=reconstructVisibilityPath(nodes,previous,1);
        if(!raw) return null;
        const simplified=simplifyClearPath(a,raw,kind);
        return pathClear(a,simplified,kind)?simplified:raw;
      }

      open.delete(current);
      closed.add(current);
      const from=nodes[current];

      for(let next=0;next<count;next++){
        if(next===current || closed.has(next)) continue;
        const to=nodes[next];
        if(firstRouteHit(from,to,kind)) continue;
        const step=Math.hypot(to.x-from.x,to.y-from.y);
        const tentative=g[current]+step;
        if(tentative>=g[next]) continue;
        previous[next]=current;
        g[next]=tentative;
        f[next]=tentative+Math.hypot(b.x-to.x,b.y-to.y);
        open.add(next);
      }
    }
    return null;
  }

  function avoidSegment(a,b,kind){
    if(!firstRouteHit(a,b,kind)) return [{x:b.x,y:b.y}];
    const attempts=[
      {pad:180,samples:12},
      {pad:340,samples:16},
      {pad:560,samples:16},
      {pad:Infinity,samples:16}
    ];
    for(const attempt of attempts){
      const route=visibilityRoute(a,b,kind,attempt.pad,attempt.samples);
      if(route && pathClear(a,route,kind)) return route;
    }
    return [{x:b.x,y:b.y}];
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
    for(let pass=0;pass<12;pass++){
      let moved=false;
      for(const obstacle of obstacles){
        const r=routeRadius(obstacle,kind)+6;
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
    for(let pass=0;pass<8;pass++){
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
    clusteredVisibilityRouting:true,
    routeBufferEscape:true,
    routeMargin:Object.freeze({...ROUTE_MARGIN}),
    avoidPath,
    pathClear,
    nearestOpenPoint,
    resolveUnitPoint
  });
  global.__VILLAGE_NAVIGATION_V7__=api;
  nrts.subsystems.register('village-navigation-v7',api,{
    phase:'architecture-v2',legacyBridge:false,
    responsibility:'route regiments around enlarged scenery structures and prevent individual units from entering visible roofs'
  });
})(window);
