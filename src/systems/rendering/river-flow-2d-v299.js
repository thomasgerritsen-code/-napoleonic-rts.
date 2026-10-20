'use strict';
// v299: 2D-only physically inspired flow-field artwork. Speed is highest
// midstream, drops at the shore and changes around bends. Particles move along
// a shared pre-integrated travel-time curve with no per-frame physics state.
// Navigation, bridge logic, and water collision remain untouched.
(function installRiverFlow2DV299(root){
  if(root.__RIVER_FLOW_2D_V299__)return;
  const river=root.__RIVER_GEOMETRY_V296__;
  if(!river || !root.__RIVER_SURFACE_V297__)return;
  const points=river.samples, ymin=points[0].y,ymax=points[points.length-1].y;
  const WIDTH=40,LANES=[-.84,-.58,-.31,0,.31,.58,.84];
  const PARTICLES=168,WAKE_PARTICLES=28;
  const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
  function hash(n){
    let s=(Math.imul(n|0,1103515245)+12345)>>>0;
    s^=s>>>13;s=Math.imul(s,2246822519);s^=s>>>16;
    return (s>>>0)/4294967296;
  }
  function bendAt(y){
    const a=river.tangentAt(y-52),b=river.tangentAt(y+52);
    // Positive means turning towards the left of the downstream direction.
    return clamp((b.x-a.x)*7.2,-.85,.85);
  }
  function speedAt(y,lane){
    const u=clamp(lane,-1,1);
    const bankDrag=17.5*Math.pow(1-Math.abs(u),1.6);
    const turn=bendAt(y);
    // Outside bends slightly accelerate, quiet inner shallows slow down.
    const turnGain=1+turn*u*.34;
    return Math.max(9,(15.5+bankDrag)*turnGain);
  }
  function buildLane(lane){
    const times=new Float64Array(points.length);
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],arc=Math.hypot(b.x-a.x,b.y-a.y);
      times[i]=times[i-1]+arc/speedAt((a.y+b.y)/2,lane);
    }
    return{lane,times,total:times[times.length-1]};
  }
  const tracks=LANES.map(buildLane);
  function yAtTime(track,travel){
    const t=((travel%track.total)+track.total)%track.total;
    const ts=track.times;
    let lo=0,hi=ts.length-1;
    while(hi-lo>1){const mid=(lo+hi)>>1;if(ts[mid]<t)lo=mid;else hi=mid;}
    const a=points[lo],b=points[hi],alpha=(t-ts[lo])/Math.max(.00001,ts[hi]-ts[lo]);
    return a.y+(b.y-a.y)*alpha;
  }
  function sample(i,time){
    const laneIndex=Math.floor(hash(i*13+2)*LANES.length);
    const track=tracks[laneIndex],lane=track.lane;
    const lifetime=hash(i*23+7)*track.total;
    const y=yAtTime(track,lifetime+time);
    const tangent=river.tangentAt(y),nx=tangent.y,ny=-tangent.x;
    // Smooth sideways water movement, always bounded by the main channel.
    const lateral=lane*WIDTH+Math.sin(y*.014+i*.85+time*.24)*1.9;
    const x=river.centerAt(y)+nx*lateral, yy=y+ny*lateral;
    return{x,y:yy,centerY:y,tx:tangent.x,ty:tangent.y,lane,
      speed:speedAt(y,lane),alpha:.07+hash(i*9+5)*.14,
      length:9+hash(i*29+11)*15,
      width:.65+hash(i*7+15)*.9};
  }
  function drawWave(w,i){
    const tangent=river.tangentAt(clamp(w.centerY+w.length*.5,ymin,ymax));
    // Three-point gently curved strand, instead of perfectly straight dashes.
    const startX=w.x-w.tx*w.length*.5,startY=w.y-w.ty*w.length*.5;
    const endX=w.x+tangent.x*w.length*.5,endY=w.y+tangent.y*w.length*.5;
    const skew=Math.sin(i*1.19+w.centerY*.011)*2.2;
    ctx.beginPath();ctx.moveTo(startX,startY);
    ctx.quadraticCurveTo(w.x+w.ty*skew,w.y-w.tx*skew,endX,endY);
    ctx.strokeStyle=i%4===0?'rgba(213,230,209,'+w.alpha.toFixed(3)+')':
      'rgba(164,202,194,'+(w.alpha*.70).toFixed(3)+')';
    ctx.lineWidth=w.width;
    ctx.stroke();
  }
  function drawWake(time,top,bottom){
    let count=0;
    for(const bridge of WATER_CROSSINGS_V067){
      if(bridge.y<top-150||bridge.y>bottom+150)continue;
      const dir=river.tangentAt(bridge.y+35),nx=dir.y,ny=-dir.x;
      for(const side of[-1,1]){
        const centerX=river.centerAt(bridge.y+45)+nx*side*34;
        const centerY=bridge.y+45+ny*side*34;
        for(let j=0;j<4;j++){
          const cycle=(time*.58+j*.27+hash(j+bridge.y))%1;
          const spin=cycle*2*Math.PI;
          ctx.beginPath();
          ctx.ellipse(centerX,centerY,7+j*3,3+j*1.15,
            Math.atan2(dir.y,dir.x)+Math.sin(spin)*.08,
            spin,spin+Math.PI*(.42+.12*j));
          ctx.strokeStyle='rgba(217,225,205,'+(.10+.09*(1-cycle)).toFixed(3)+')';
          ctx.lineWidth=1;ctx.stroke();count++;
        }
      }
    }
    return count;
  }
  let lastDraw={visible:0,wakes:0,drawCalls:0};
  function draw(time){
    const c=root.camera||camera,zoom=Math.max(.05,c?.zoom||1);
    const bounds={top:c.y-innerHeight/(2*zoom)-70,
      bottom:c.y+innerHeight/(2*zoom)+70,
      left:c.x-innerWidth/(2*zoom)-90,
      right:c.x+innerWidth/(2*zoom)+90};
    // GPU is optional and draws exactly the same flow-field coordinates.
    // Bridge-pier eddies remain on Canvas for their changing arcs and alpha.
    const gpu=root.__GPU_RIVER_FLOW_V308__;
    const batch=gpu?.draw?.(time);
    if(batch){
      const wakes=drawWake(time,bounds.top,bounds.bottom);
      gpu.recordWakes(wakes);
      lastDraw={visible:batch.visible,wakes,drawCalls:batch.visible+wakes};
      return lastDraw;
    }
    let visible=0;
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
    // Two sets of coherent small ripples at different scales. Fixed bounded
    // loops, no creating DOM/canvas textures or offscreen buffers per frame.
    for(let i=0;i<PARTICLES;i++){
      const w=sample(i,time);
      if(w.y<bounds.top||w.y>bounds.bottom||
        w.x<bounds.left||w.x>bounds.right)continue;
      drawWave(w,i);visible++;
      // A second delayed low-contrast wake on occasional centerline flecks.
      if(i%9===0&&Math.abs(w.lane)<.6){
        const tail=sample(i,Math.max(0,time-.42));
        ctx.beginPath();ctx.moveTo(tail.x,tail.y);ctx.lineTo(w.x,w.y);
        ctx.strokeStyle='rgba(122,169,164,.07)';ctx.lineWidth=.65;ctx.stroke();
      }
    }
    // Soft alternating specular ripples on shallows, moving with the current.
    for(let i=0;i<WAKE_PARTICLES;i++){
      const w=sample(i+1000,time*.78);
      if(Math.abs(w.lane)<.58||w.y<bounds.top||w.y>bounds.bottom||
        w.x<bounds.left||w.x>bounds.right)continue;
      ctx.beginPath();
      ctx.moveTo(w.x-w.ty*2.8,w.y+w.tx*2.8);
      ctx.quadraticCurveTo(w.x,w.y,
        w.x+w.ty*2.8,w.y-w.tx*2.8);
      ctx.strokeStyle='rgba(193,211,189,.11)';ctx.lineWidth=.9;ctx.stroke();
      visible++;
    }
    const wakes=drawWake(time,bounds.top,bounds.bottom);
    ctx.restore();
    lastDraw={visible,wakes,drawCalls:visible+wakes};
    return lastDraw;
  }
  const api=Object.freeze({
    version:'299.0',twoDOnly:true,
    travelTimeFlow:true,curvatureResponsive:true,shoreDrag:true,
    bridgeEddies:true,particleLimit:PARTICLES+WAKE_PARTICLES,
    speedAt,bendAt,sample,draw,
    metrics:()=>({...lastDraw,lanes:tracks.length,bridgeCount:WATER_CROSSINGS_V067.length})
  });
  root.__RIVER_FLOW_2D_V299__=api;
  root.NRTS?.subsystems?.register?.('river-flow-2d-v299',api,{
    phase:'rendering',legacyBridge:false,
    responsibility:'2D-only bend-aware current, bank slowdown, tangent ripples and bridge eddies'
  });
})(window);
