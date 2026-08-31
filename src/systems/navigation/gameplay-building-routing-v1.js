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
  const stats={orders:0,reroutedOrders:0,insertedWaypoints:0,adjustedGoals:0,failedSections:0,fallbackSections:0,waypointActivations:0,marchStateUpdates:0,artilleryStartWaypointsSkipped:0};

  function kindOf(reg){return typeof groupKindV06==='function'?groupKindV06(reg):(reg?.kind||'infantry');}
  function baseMargin(kind){return Number(paddingByKind[kind]??paddingByKind.infantry??34);}
  function formationMargin(reg,kind){
    const base=baseMargin(kind),members=typeof regimentMembers==='function'?regimentMembers(reg):[];
    if(!members.length)return base;
    const c=centroid(members);let spread=0,maxRadius=0;
    for(const u of members){spread=Math.max(spread,Math.abs(u.x-c.x),Math.abs(u.y-c.y));maxRadius=Math.max(maxRadius,Number(TYPES[u.type]?.radius||6));}
    return Math.max(base,Math.min(base+82,spread+maxRadius+12));
  }
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
  function firstBuildingHit(a,b,pad,ignoreId=null){
    let best=null,bestAlong=Infinity;
    const total=Math.hypot(b.x-a.x,b.y-a.y)||1;
    for(const o of obstacles()){
      if(o.id===ignoreId||!segmentAabbHit(a,b,o,pad))continue;
      const along=Math.hypot(a.x-o.x,a.y-o.y)/total;
      if(along<bestAlong){best=o;bestAlong=along;}
    }
    return best;
  }
  function otherNavigationClear(a,b,kind){
    if(typeof segmentCrossesBlockedWaterV067==='function'&&segmentCrossesBlockedWaterV067(a.x,a.y,b.x,b.y))return false;
    const village=global.__VILLAGE_NAVIGATION_V7__;
    if(village?.pathClear&&!village.pathClear(a,[b],kind))return false;
    return true;
  }
  function edgeClear(a,b,kind,pad,ignoreId=null){return !firstBuildingHit(a,b,pad,ignoreId)&&otherNavigationClear(a,b,kind);}
  function pointClear(p,kind,pad,ignoreId=null){
    if(p.x<12||p.y<12||p.x>WORLD.width-12||p.y>WORLD.height-12)return false;
    for(const o of obstacles())if(o.id!==ignoreId&&inside(p,o,pad))return false;
    if(typeof waterAtV067==='function'&&waterAtV067(p.x,p.y))return false;
    const village=global.__VILLAGE_NAVIGATION_V7__;
    if(village?.nearestOpenPoint){const q=village.nearestOpenPoint(p,kind);if(Math.hypot(q.x-p.x,q.y-p.y)>2)return false;}
    return true;
  }
  function nearestOpenGoal(point,kind,pad=baseMargin(kind)){
    let p={x:point.x,y:point.y};
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
  function cornerNodes(o,kind,pad){
    const safePad=pad+cornerExtra,hw=o.w*.5+safePad,hh=o.h*.5+safePad;
    return[
      {x:o.x-hw,y:o.y-hh,obstacleId:o.id},{x:o.x-hw,y:o.y+hh,obstacleId:o.id},
      {x:o.x+hw,y:o.y-hh,obstacleId:o.id},{x:o.x+hw,y:o.y+hh,obstacleId:o.id}
    ].filter(p=>pointClear(p,kind,pad,o.id));
  }
  function fallbackAroundFirst(start,goal,kind,pad){
    const o=firstBuildingHit(start,goal,pad);if(!o)return null;
    const safePad=pad+cornerExtra,hw=o.w*.5+safePad,hh=o.h*.5+safePad;
    const left=o.x-hw,right=o.x+hw,top=o.y-hh,bottom=o.y+hh;
    const horizontal=Math.abs(goal.x-start.x)>=Math.abs(goal.y-start.y);
    const candidates=horizontal?
      [[{x:left,y:top},{x:right,y:top}],[{x:left,y:bottom},{x:right,y:bottom}]]:
      [[{x:left,y:top},{x:left,y:bottom}],[{x:right,y:top},{x:right,y:bottom}]];
    let best=null,bestCost=Infinity;
    for(let pts of candidates){
      if(horizontal&&start.x>goal.x)pts=pts.slice().reverse();
      if(!horizontal&&start.y>goal.y)pts=pts.slice().reverse();
      const chain=[start,...pts,goal];let valid=true,cost=0;
      for(let i=1;i<chain.length;i++){
        if(!pointClear(chain[i],kind,pad,i===chain.length-1?null:o.id)||!edgeClear(chain[i-1],chain[i],kind,pad,i<chain.length-1?o.id:null)){valid=false;break;}
        cost+=Math.hypot(chain[i].x-chain[i-1].x,chain[i].y-chain[i-1].y);
      }
      if(valid&&cost<bestCost){best=pts.map(p=>({x:p.x,y:p.y})).concat([{x:goal.x,y:goal.y}]);bestCost=cost;}
    }
    if(best)stats.fallbackSections++;
    return best;
  }
  function routeSection(start,goal,kind,pad){
    if(edgeClear(start,goal,kind,pad))return[{x:goal.x,y:goal.y}];
    const obs=obstacles();
    const nodes=[{x:start.x,y:start.y,role:'start'},{x:goal.x,y:goal.y,role:'goal'}];
    for(const o of obs)for(const p of cornerNodes(o,kind,pad))nodes.push(p);
    const n=nodes.length,dist=new Array(n).fill(Infinity),prev=new Array(n).fill(-1),done=new Set();dist[0]=0;
    for(let iter=0;iter<n;iter++){
      let u=-1,best=Infinity;for(let i=0;i<n;i++)if(!done.has(i)&&dist[i]<best){best=dist[i];u=i;}
      if(u<0)break;if(u===1)break;done.add(u);
      for(let v=0;v<n;v++){
        if(v===u||done.has(v)||!edgeClear(nodes[u],nodes[v],kind,pad))continue;
        const nd=dist[u]+Math.hypot(nodes[v].x-nodes[u].x,nodes[v].y-nodes[u].y);
        if(nd<dist[v]){dist[v]=nd;prev[v]=u;}
      }
    }
    if(!Number.isFinite(dist[1])){
      const fallback=fallbackAroundFirst(start,goal,kind,pad);
      if(fallback)return fallback;
      stats.failedSections++;return null;
    }
    const indexes=[];let cursor=1;while(cursor>=0){indexes.push(cursor);if(cursor===0)break;cursor=prev[cursor];if(cursor<0)return null;}
    indexes.reverse();return indexes.slice(1).map(i=>({x:nodes[i].x,y:nodes[i].y}));
  }
  function avoidPath(start,path,kind,pad=baseMargin(kind)){
    const out=[];let cursor={x:start.x,y:start.y};
    for(const raw of path||[]){
      const goal=nearestOpenGoal(raw,kind,pad),section=routeSection(cursor,goal,kind,pad);
      if(!section)return null;
      for(const p of section){const last=out[out.length-1];if(!last||Math.hypot(last.x-p.x,last.y-p.y)>2)out.push(p);cursor=p;}
    }
    return out;
  }
  function activateArtilleryRoute(reg,start){
    if(groupKindV06(reg)!=='artillery'||!Array.isArray(reg.path)||!reg.path.length||typeof setGroupWaypointV06!=='function')return false;
    // Grid routes often begin with the centre of the cannon's current cell. Because
    // artillery crew sit behind the gun, the battery centroid is offset and generic
    // stuck recovery can repeatedly reset to this already-reached point. Consume any
    // start-adjacent waypoint before activating the first real travel waypoint.
    while(reg.pathIndex<reg.path.length-1){
      const p=reg.path[reg.pathIndex];
      if(Math.hypot(start.x-p.x,start.y-p.y)>=62)break;
      reg.pathIndex++;stats.artilleryStartWaypointsSkipped++;
    }
    setGroupWaypointV06(reg);stats.waypointActivations++;return true;
  }

  const orderBefore=orderGroupPathV06;
  orderGroupPathV06=function orderGroupPathGameplayBuildingsV1(reg,x,y,formation=reg?.formation,finalFacing=null){
    if(!reg||reg.destroyed)return orderBefore(reg,x,y,formation,finalFacing);
    stats.orders++;
    const kind=kindOf(reg),pad=formationMargin(reg,kind),safeGoal=nearestOpenGoal({x,y},kind,pad);
    if(Math.hypot(safeGoal.x-x,safeGoal.y-y)>1)stats.adjustedGoals++;
    orderBefore(reg,safeGoal.x,safeGoal.y,formation,finalFacing);
    if(!reg.path?.length)return;
    const members=typeof regimentMembers==='function'?regimentMembers(reg):[];
    const start=members.length?centroid(members):{x:reg.targetX,y:reg.targetY};
    const oldPath=reg.path.slice(),oldLength=oldPath.length,newPath=avoidPath(start,oldPath,kind,pad);
    if(!newPath?.length){reg.gameplayBuildingRouteV1={active:false,rerouted:false,kind,pad,waypoints:oldLength,failed:true};return;}
    const changed=newPath.length!==oldLength||newPath.some((p,i)=>!oldPath[i]||Math.hypot(p.x-oldPath[i].x,p.y-oldPath[i].y)>2);
    if(changed){stats.reroutedOrders++;stats.insertedWaypoints+=Math.max(0,newPath.length-oldLength);}
    reg.path=newPath;reg.pathIndex=0;reg.finalTarget={x:safeGoal.x,y:safeGoal.y};
    reg.gameplayBuildingRouteV1={active:true,rerouted:changed,kind,pad,waypoints:newPath.length,failed:false};
    if(reg.marchV063){
      const first=newPath[0]||safeGoal;
      reg.marchV063.marchFacing=Math.atan2(first.y-start.y,first.x-start.x);
      if(reg.marchV063.v064){reg.marchV063.finalX=safeGoal.x;reg.marchV063.finalY=safeGoal.y;}
      stats.marchStateUpdates++;
    }else if(kind==='artillery'){
      activateArtilleryRoute(reg,start);
    }
  };

  const api=Object.freeze({version:'gameplay-building-routing-v1.3',dynamicBuildings:true,formationAware:true,physicalFormationEnvelope:true,marchOwnerCompatible:true,artilleryStartWaypointRecovery:true,avoidPath,nearestOpenGoal,segmentBlocked:(a,b,kind='infantry',pad=baseMargin(kind))=>Boolean(firstBuildingHit(a,b,pad)),stats:()=>({...stats,activeBuildings:obstacles().length})});
  global.__GAMEPLAY_BUILDING_ROUTING_V1__=api;
  nrts.subsystems.register('gameplay-building-routing',api,{phase:'architecture-v2.1',legacyBridge:false,responsibility:'route battalion anchors around dynamic gameplay-building footprints without overriding the active formation movement owner'});
})(window);
