'use strict';
// Shared, cached access routes for workers. Work and delivery remain outside
// building walls. WeakMaps release routes when units leave the simulation.
(function workSiteNavigation(root){
  if(!root.NRTS_CONFIG?.mining||root.__WORK_SITE_NAV_V1__)return;
  const routes=new WeakMap(),approaches=new WeakMap();
  const edgeDistance=(u,b)=>Math.hypot(Math.max(0,Math.abs(u.x-b.x)-b.w/2),Math.max(0,Math.abs(u.y-b.y)-b.h/2));
  function approach(u,b){
    const old=approaches.get(u);if(old?.building===b.id&&old.task===u.task)return old.point;
    const candidates=[];
    for(let i=0;i<24;i++){
      const a=i/24*Math.PI*2,c=Math.cos(a),s=Math.sin(a),t=1/Math.max(Math.abs(c)/(b.w/2+44),Math.abs(s)/(b.h/2+44));
      const p={x:b.x+c*t,y:b.y+s*t};
      if(root.__UNIT_PLACEMENT__.clear(p,'worker',{ignore:u}))candidates.push(p);
    }
    candidates.sort((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y));
    const dx=u.x-b.x,dy=u.y-b.y,t=Math.max(Math.abs(dx)/(b.w/2+36),Math.abs(dy)/(b.h/2+36))||1;
    const point=candidates[0]||{x:b.x+dx/t,y:b.y+dy/t};
    approaches.set(u,{building:b.id,task:u.task,point});return point;
  }
  function walk(u,x,y,dt){
    u.targetX=x;u.targetY=y;
    let route=routes.get(u);
    if(!route||Math.hypot(route.x-x,route.y-y)>16||elapsed-route.at>4&&Math.hypot(route.px-u.x,route.py-u.y)<8){
      const path=root.__VILLAGE_NAVIGATION_V7__?.avoidPath(u,[{x,y}],'worker')||[{x,y}];
      route={x,y,path,index:0,at:elapsed,px:u.x,py:u.y};routes.set(u,route);
    }
    if(elapsed-route.at>4){route.at=elapsed;route.px=u.x;route.py=u.y;}
    while(route.index<route.path.length-1&&Math.hypot(u.x-route.path[route.index].x,u.y-route.path[route.index].y)<12)route.index++;
    const p=route.path[route.index]||{x,y};moveToward(u,p.x,p.y,dt);
  }
  root.__WORK_SITE_NAV_V1__=Object.freeze({edgeDistance,approach,walk});
})(window);
