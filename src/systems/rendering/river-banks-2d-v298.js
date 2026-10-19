'use strict';
// v298: 2D-ONLY riverbank erosion, point bars and shoreline meadow blending.
// Geometry is purely decorative; never changes waterAtV067, roads, bridges,
// navigation, houses, or any existing 3D module.
(function installRiverBanks2DV298(root){
  if(root.__RIVER_BANKS_2D_V298__)return;
  const river=root.__RIVER_GEOMETRY_V296__;
  if(!river || !root.__RIVER_SURFACE_V297__)return;
  const points=river.samples,half=RIVER_NAV_HALF_WIDTH_V067;
  const previousDraw=drawRiverV067;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const noise=(n)=>{let x=(Math.imul(n|0,1664525)+1013904223)>>>0;x^=x>>>13;return (x>>>0)/4294967295;};
  const bridgeNear=y=>WATER_CROSSINGS_V067.some(c=>Math.abs(c.y-y)<158);
  function frame(i){
    const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
    const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1;
    return{x:dy/d,y:-dx/d,tx:dx/d,ty:dy/d};
  }
  function bankShapeAt(i){
    const index=clamp(i,5,points.length-6);
    const p0=points[index-5],p1=points[index],p2=points[index+5];
    const ax=p1.x-p0.x,ay=p1.y-p0.y,bx=p2.x-p1.x,by=p2.y-p1.y;
    const turn=(ax*by-ay*bx)/(Math.hypot(ax,ay)*Math.hypot(bx,by)||1);
    // +turn bends left, whereas frame().normal points right.
    return {turn,inside:turn>0?-1:1,outside:turn>0?1:-1,
      severity:clamp(Math.abs(turn)*26,0,1)};
  }
  function visible(y){
    const c=root.camera||camera;
    return Math.abs(y-c.y)<innerHeight/(2*Math.max(.05,c.zoom)) + 260;
  }
  function position(i,side,distance){
    const p=points[i],n=frame(i);
    return{x:p.x+n.x*side*distance,y:p.y+n.y*side*distance};
  }
  function barPolygon(center,inside,severity){
    const start=center-8,end=center+8;
    ctx.beginPath();
    for(let i=start;i<=end;i++){
      const f=Math.max(0,1-Math.abs(i-center)/9);
      const ripple=Math.sin(i*1.37+center*.3)*1.8;
      const out=position(i,inside,half-3+ripple);
      if(i===start)ctx.moveTo(out.x,out.y);else ctx.lineTo(out.x,out.y);
    }
    for(let i=end;i>=start;i--){
      const f=Math.max(0,1-Math.abs(i-center)/9);
      const inner=position(i,inside,half-2-(7+13*severity)*f);
      ctx.lineTo(inner.x,inner.y);
    }
    ctx.closePath();
  }
  function paintBar(center,inside,severity){
    barPolygon(center,inside,severity);
    ctx.fillStyle='rgba(178,160,117,'+(.18+.20*severity).toFixed(3)+')';
    ctx.fill();
    const p=position(center,inside,half-11-6*severity),n=frame(center);
    // Sparse silt texture, not a painted continuous sandy canal stripe.
    for(let j=0;j<5;j++){
      const dx=(noise(center*23+j*5)-.5)*29;
      const dy=(noise(center*11+j*7)-.5)*31;
      ctx.beginPath();
      ctx.ellipse(p.x+dx,p.y+dy,1.6+noise(j+center)*2.2,.75,
        Math.atan2(n.ty,n.tx),0,Math.PI*2);
      ctx.fillStyle='rgba(96,91,70,.17)';ctx.fill();
    }
  }
  function paintErosion(center,outside,severity){
    ctx.beginPath();
    for(let i=center-7;i<=center+7;i++){
      const n=frame(i),p=points[i],dist=half+4+
        (Math.sin(i*.73)*1.7)*severity;
      const x=p.x+n.x*outside*dist,y=p.y+n.y*outside*dist;
      if(i===center-7)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }
    ctx.lineCap='round';ctx.lineJoin='round';
    ctx.lineWidth=1.65+severity;
    ctx.strokeStyle='rgba(69,62,43,'+(.14+.16*severity).toFixed(3)+')';
    ctx.stroke();
  }
  function grassOnBank(i,side){
    const n=frame(i),p=points[i],w=half+21+noise(i*51)*10;
    const x=p.x+n.x*side*w,y=p.y+n.y*side*w;
    const spread=2.8+noise(i*17)*2;
    const h=4.1+noise(i*11)*3;
    ctx.beginPath();
    ctx.moveTo(x-spread,y+1);ctx.lineTo(x-spread*.3,y-h*.65);
    ctx.moveTo(x,y+1);ctx.lineTo(x+.6,y-h);
    ctx.moveTo(x+spread,y+1);ctx.lineTo(x+spread*.75,y-h*.55);
    ctx.lineWidth=1.3;
    ctx.strokeStyle=i%4===0?'rgba(71,99,57,.44)':'rgba(83,111,63,.37)';
    ctx.stroke();
  }
  function drawDetail(){
    ctx.save();
    let sediment=0,erosion=0,tufts=0;
    // One motif per ~220 world units; camera culling keeps mobile cheap.
    for(let i=11;i<points.length-11;i+=11){
      const p=points[i];if(!visible(p.y)||bridgeNear(p.y))continue;
      const curve=bankShapeAt(i);
      if(curve.severity>.07){
        paintBar(i,curve.inside,curve.severity);sediment++;
        paintErosion(i,curve.outside,curve.severity);erosion++;
      }
      // Grass remains outside the actual waterline, including on bends.
      for(const side of[-1,1]){
        grassOnBank(i-4,side);grassOnBank(i+4,side);tufts+=2;
      }
    }
    ctx.restore();
    return {sediment,erosion,tufts};
  }
  drawRiverV067=function drawRiverNatural2DV298(){
    previousDraw();
    drawDetail();
  };
  const api=Object.freeze({
    version:'298.0',twoDOnly:true,threeDUntouched:true,
    sharedGeometry:true,
    erosionByBend:true,
    bankShapeAt,
    bridgeNear,
    drawDetail,
    stats:()=>({sampleCount:points.length,bridgeCount:WATER_CROSSINGS_V067.length})
  });
  root.__RIVER_BANKS_2D_V298__=api;
  root.NRTS?.subsystems?.register?.('river-banks-2d-v298',api,{
    phase:'rendering',legacyBridge:false,
    responsibility:'visual 2D-only meander sediment deposition, outer-bank erosion and meadow shoreline'
  });
})(window);
