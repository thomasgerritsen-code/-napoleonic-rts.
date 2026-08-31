'use strict';
// ---------- Architecture v2.1: dynamic gameplay-building route avoidance ----------
(function installGameplayBuildingRoutingV1(global){
  const nrts=global.NRTS;
  if(!nrts) throw new Error('NRTS foundation runtime must load before gameplay-building routing.');
  if(typeof orderGroupPathV06!=='function') throw new Error('Group path planner must load before gameplay-building routing.');

  const cfg=global.NRTS_CONFIG?.navigation?.gameplayBuildings||{};
  const paddingByKind=cfg.routeMargin||{infantry:34,cavalry:42,artillery:46,worker:24};
  const cornerExtra=cfg.cornerExtra??14;
  const maxResolvePasses=cfg.maxResolvePasses??10;
  const stats={orders:0,reroutedOrders:0,insertedWaypoints:0,adjustedGoals:0,failedSections:0};

  function kindOf(reg){return typeof groupKindV06==='function'?groupKindV06(reg):(reg?.kind||'infantry');}
  function margin(kind){return Number(paddingByKind[kind]??paddingByKind.infantry??34);}
  function obstacles(){
    return buildings.filter(b=>b&&!b.dead&&Number.isFinite(b.x)&&Number.isFinite(b.y)&&Number.isFinite(b.w)&&Number.isFinite(b.h)).map(b=>({
      id:`g:${b.id}`,buildingId:b.id,x:b.x,y:b.y,w:b.w,h:b.h
    }));
  }
  function inside(p,o,pad){return Math.abs(p.x-o.x)<o.w*.5+pad&&Math.abs(p.y-o.y)<o.h*.5+pad;}
  function exitsBuffer(a,b,o,pad){
    const hw=o.w*.5+pad,hh=o.h*.5+pad,ax=a.x-o.x,ay=a.y-o.y;
    if(Math.abs(ax)>=hw||Math.abs(ay)>=hh)return false;
    const bx=b.x-o.x,by=b.y-o.y;
    const startNorm=Math.max(Math.abs(ax)/hw,Math.abs(ay)/hh),endNorm=Math.max(Math.abs(bx)/hw,Math.abs(by)/hh);
    return endNorm>startNorm+1e-4;
  }
  function segmentAabbHit(a,b,o,pad){
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
  function firstBuildingHit(a,b,kind,ignoreId=null){
    const pad=margin(kind);let best=null,bestD=Infinity;
    for(const o of obstacles()){
      if(o.id===ignoreId||!segmentAabbHit(a,b,o,pad))continue;
      const d=Math.hypot(a.x-o.x,a.y-o.y);
      if(d<bestD){best=o;bestD=d;}
    }
    return best;
  }
  function otherNavigationClear(a,b,kind){
    if(typeof segmentCrossesBlockedWaterV067==='function'&&segmentCrossesBlockedWaterV067(a.x,a.y,b.x,b.y))return false;
    const village=global.__VILLAGE_NAVIGATION_V7__;
    if(village?.pathClear&&!village.pathClear(a,[b],kind))return false;
    return true;
  }
  function edgeClear(a,b,kind,ignoreId=null){return !firstBuildingHit(a,b,kind,ignoreId)&&otherNavigationClear(a,b,kind);}
  function pointClear(p,kind,ignoreId=null){
    if(p.x<12||p.y<12||p.x>WORLD.width-12||p.y>WORLD.height-12)return false;
    const pad=margin(kind);
    for(const o of obstacles())if(o.id!==ignoreId&&inside(p,o,pad))return false;
    if(typeof waterAtV067==='function'&&waterAtV067(p.x,p.y))return false;
    const village=global.__VILLAGE_NAVIGATION_V7__;
    if(village?.nearestOpenPoint){const q=village.nearestOpenPoint(p,kind);if(Math.hypot(q.x-p.x,q.y-p.y)>2)return false;}
    return true;
  }
  function nearestOpenGoal(point,kind){
    let p={x:point.x,y:point.y};const pad=margin(kind);
    for(let pass=0;pass<maxResolvePasses;pass++){
      let moved=false;
      for(const o of obstacles()){
        if(!inside(p,o,pad))continue;
        const hw=o.w*.5+pad,hh=o.h*.5+pad,dx=p.x-o.x,dy=p.y-o.y;
        const px=hw-Math.abs(dx),py=hh-Math.abs(dy);
        if(px<py)p.x=o.x+(dx<0?-1:1)*(hw+1);
        else p.y=o.y+(dy<0?-1:1)*(hh+1);
        moved=true;
      }
      if(!moved)break;
    }
    p.x=Math.max(12,Math.min(WORLD.width-12,p.x));p.y=Math.max(12,Math.min(WORLD.height-12,p.y));
    return p;
  }
  function cornerNodes(o,kind){
    const pad=margin(kind)+cornerExtra,hw=o.w*.5+pad,hh=o.h*.5+pad;
    return[
      {x:o.x-hw,y:o.y-hh,obstacleId:o.id},{x:o.x-hw,y:o.y+hh,obstacleId:o.id},
      {x:o.x+hw,y:o.y-hh,obstacleId:o.id},{x:o.x+hw,y:o.y+hh,obstacleId:o.id}
    ].filter(p=>pointClear(p,kind,o.id));
  }
  function routeSection(start,goal,kind){
    if(edgeClear(start,goal,kind))return[{x:goal.x,y:goal.y}];
    const obs=obstacles();
    const nodes=[{x:start.x,y:start.y,role:'start'},{x:goal.x,y:goal.y,role:'goal'}];
    for(const o of obs)for(const p of cornerNodes(o,kind))nodes.push(p);
    const n=nodes.length,dist=new Array(n).fill(Infinity),prev=new Array(n).fill(-1),done=new Set();dist[0]=0;
    for(let iter=0;iter<n;iter++){
      let u=-1,best=Infinity;for(let i=0;i<n;i++)if(!done.has(i)&&dist[i]<best){best=dist[i];u=i;}
      if(u<0)break;if(u===1)break;done.add(u);
      for(let v=0;v<n;v++){
        if(v===u||done.has(v)||!edgeClear(nodes[u],nodes[v],kind))continue;
        const nd=dist[u]+Math.hypot(nodes[v].x-nodes[u].x,nodes[v].y-nodes[u].y);
        if(nd<dist[v]){dist[v]=nd;prev[v]=u;}
      }
    }
    if(!Number.isFinite(dist[1])){stats.failedSections++;return null;}
    const indexes=[];let cursor=1;while(cursor>=0){indexes.push(cursor);if(cursor===0)break;cursor=prev[cursor];if(cursor<0)return null;}
    indexes.reverse();return indexes.slice(1).map(i=>({x:nodes[i].x,y:nodes[i].y}));
  }
  function avoidPath(start,path,kind){
    const out=[];let cursor={x:start.x,y:start.y};
    for(const raw of path||[]){
      const goal=nearestOpenGoal(raw,kind),section=routeSection(cursor,goal,kind);
      if(!section)return null;
      for(const p of section){const last=out[out.length-1];if(!last||Math.hypot(last.x-p.x,last.y-p.y)>2)out.push(p);cursor=p;}
    }
    return out;
  }

  const orderBefore=orderGroupPathV06;
  orderGroupPathV06=function orderGroupPathGameplayBuildingsV1(reg,x,y,formation=reg?.formation,finalFacing=null){
    if(!reg||reg.destroyed)return orderBefore(reg,x,y,formation,finalFacing);
    stats.orders++;
    const kind=kindOf(reg),safeGoal=nearestOpenGoal({x,y},kind);
    if(Math.hypot(safeGoal.x-x,safeGoal.y-y)>1)stats.adjustedGoals++;
    orderBefore(reg,safeGoal.x,safeGoal.y,formation,finalFacing);
    if(!reg.path?.length)return;
    const members=typeof regimentMembers==='function'?regimentMembers(reg):[];
    const start=reg.marchV063?.v064?{x:reg.marchV063.anchorX,y:reg.marchV063.anchorY}:(members.length?centroid(members):{x:reg.targetX,y:reg.targetY});
    const oldLength=reg.path.length,newPath=avoidPath(start,reg.path,kind);
    if(!newPath?.length)return;
    const changed=newPath.length!==oldLength||newPath.some((p,i)=>!reg.path[i]||Math.hypot(p.x-reg.path[i].x,p.y-reg.path[i].y)>2);
    if(changed){stats.reroutedOrders++;stats.insertedWaypoints+=Math.max(0,newPath.length-oldLength);}
    reg.path=newPath;reg.pathIndex=0;reg.finalTarget={x:safeGoal.x,y:safeGoal.y};
    if(reg.marchV063?.v064){reg.marchV063.finalX=safeGoal.x;reg.marchV063.finalY=safeGoal.y;const first=newPath[0];if(first)reg.marchV063.marchFacing=Math.atan2(first.y-reg.marchV063.anchorY,first.x-reg.marchV063.anchorX);}
    reg.gameplayBuildingRouteV1={active:true,rerouted:changed,kind,waypoints:newPath.length};
  };

  const api=Object.freeze({version:'gameplay-building-routing-v1',dynamicBuildings:true,formationAware:true,avoidPath,nearestOpenGoal,segmentBlocked:(a,b,kind='infantry')=>Boolean(firstBuildingHit(a,b,kind)),stats:()=>({...stats,activeBuildings:obstacles().length})});
  global.__GAMEPLAY_BUILDING_ROUTING_V1__=api;
  nrts.subsystems.register('gameplay-building-routing',api,{phase:'architecture-v2.1',legacyBridge:false,responsibility:'route battalion anchors around dynamic gameplay-building footprints before per-unit avoidance'});
})(window);
