'use strict';
// v297: visual-only natural riverbank layers and current, using precisely the
// C1 river curve shared with navigation (v296). Do not modify waterAtV067.
(function installRiverSurfaceV297(global){
  const river=global.__RIVER_GEOMETRY_V296__;
  if(!river)throw new Error('v297 river rendering requires v296 shared curve');
  const points=river.samples;
  const sampleCount=points.length;
  const sampleHeight=points[sampleCount-1].y-points[0].y;
  function halfWidth(p,i,base){
    // Narrow scenic water channel inside the authoritative 72-unit wet bank;
    // slow broad silt/wetland changes are independent of bridge navigation.
    const shimmer=3.7*Math.sin(p.y*.0079+1.3)+2.5*Math.sin(p.y*.0173+i*.015);
    return Math.max(18,base+shimmer);
  }
  function normal(i){
    const prev=points[Math.max(0,i-1)],next=points[Math.min(sampleCount-1,i+1)];
    const tx=next.x-prev.x,ty=next.y-prev.y,d=Math.hypot(tx,ty)||1;
    return{x:ty/d,y:-tx/d};
  }
  const normals=points.map((_,i)=>normal(i));
  function ribbon(baseWidth,color){
    ctx.beginPath();
    for(let i=0;i<sampleCount;i++){
      const p=points[i],n=normals[i],w=halfWidth(p,i,baseWidth);
      if(!i)ctx.moveTo(p.x-n.x*w,p.y-n.y*w);
      else ctx.lineTo(p.x-n.x*w,p.y-n.y*w);
    }
    for(let i=sampleCount-1;i>=0;i--){
      const p=points[i],n=normals[i],w=halfWidth(p,i,baseWidth);
      ctx.lineTo(p.x+n.x*w,p.y+n.y*w);
    }
    ctx.closePath();ctx.fillStyle=color;ctx.fill();
  }
  // Animated wavelets are driven by game elapsed time (deterministic). They
  // follow the *local tangent*, never screen-horizontal or against the current.
  function flowSample(i,time){
    const phase=(i*97.7+time*22.5)%(sampleHeight+250);
    const y=points[0].y+phase-125;
    const tangent=river.tangentAt(y),n={x:tangent.y,y:-tangent.x};
    const side=(Math.sin(i*15.137)+Math.sin(i*3.716)*.43)*17.5;
    const x=river.centerAt(y)+n.x*side;
    return{x,y:y+n.y*side,tx:tangent.x,ty:tangent.y,
      length:12+((i*11)%17),intensity:.13+(i%5)*.035};
  }
  function drawFlow(time){
    // v299 replaces the repetitive fixed-speed strokes with the richer 2D
    // flow field; retain v297 as a safe fallback if the addon is absent.
    if(global.__RIVER_FLOW_2D_V299__?.draw) return global.__RIVER_FLOW_2D_V299__.draw(time);
    const c=global.camera||camera,zoom=c?.zoom||1;
    const left=(c?.x||0)-innerWidth/(2*zoom)-85,right=(c?.x||0)+innerWidth/(2*zoom)+85;
    const top=(c?.y||0)-innerHeight/(2*zoom)-95,bottom=(c?.y||0)+innerHeight/(2*zoom)+95;
    ctx.lineCap='round';
    for(let i=0;i<78;i++){
      const w=flowSample(i,time);
      if(w.y<top||w.y>bottom||w.x<left||w.x>right)continue;
      ctx.beginPath();
      ctx.moveTo(w.x-w.tx*w.length*.5,w.y-w.ty*w.length*.5);
      ctx.lineTo(w.x+w.tx*w.length*.5,w.y+w.ty*w.length*.5);
      ctx.strokeStyle='rgba(205,225,206,'+w.intensity.toFixed(3)+')';
      ctx.lineWidth=i%7===0?2:1.25;ctx.stroke();
    }
    // Light diffuse eddies at the stationary bridge piers, never big stripes.
    for(const crossing of WATER_CROSSINGS_V067){
      if(crossing.y<top-95||crossing.y>bottom+95)continue;
      const tangent=river.tangentAt(crossing.y);
      const pulse=.12+.05*Math.sin(time*1.2+crossing.y*.009);
      ctx.strokeStyle='rgba(204,216,189,'+pulse.toFixed(3)+')';
      ctx.lineWidth=1.3;
      for(const side of[-1,1]){
        const px=crossing.x+side*48,py=crossing.y+22;
        ctx.beginPath();ctx.ellipse(px,py,11,4,Math.atan2(tangent.y,tangent.x),0,Math.PI*.72);ctx.stroke();
      }
    }
  }
  const previous=drawRiverV067;
  drawRiverV067=function drawRiverNaturalV297(){
    ctx.save();
    // Sediment apron / vegetation, soft wet mud, light shallow border and
    // deep olive-blue channel. No opaque shoreline stroke or straight dashes.
    ribbon(RIVER_NAV_HALF_WIDTH_V067+23,'rgba(86,91,64,.20)');
    ribbon(RIVER_NAV_HALF_WIDTH_V067+13,'rgba(103,94,70,.30)');
    ribbon(RIVER_NAV_HALF_WIDTH_V067+5,'rgba(91,85,64,.36)');
    ribbon(RIVER_NAV_HALF_WIDTH_V067-5,'rgba(119,148,130,.91)');
    ribbon(RIVER_NAV_HALF_WIDTH_V067-15,'rgba(80,128,133,.91)');
    ribbon(RIVER_NAV_HALF_WIDTH_V067-32,'rgba(52,97,114,.62)');
    // Desktop tiles contain only stationary water color; animate the flow
    // separately over cached terrain every frame. Mobile retains its old path.
    if(!global.__STATIC_TERRAIN_CAPTURE_V301__)drawFlow(typeof elapsed==='number'?elapsed:0);
    ctx.restore();
  };
  global.__RIVER_SURFACE_V297__=Object.freeze({
    version:'river-surface-v297',
    sharedGeometry:true,
    flowingRipples:true,
    naturalBanks:true,
    channelWithinNavigation:true,
    surfaceLayers:6,
    sampleCount,
    flowSample,
    draw:()=>drawRiverV067(),
    originalRenderer:previous
  });
})(window);
