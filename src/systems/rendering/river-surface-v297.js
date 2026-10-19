'use strict';
// v297: water art only. Navigation, crossing envelopes and river geometry
// remain exclusively authoritative in v067/v296.
(function installLivingRiverV297(global){
  if(typeof RIVER_SMOOTH_POINTS_V296==='undefined')throw new Error('Smooth river geometry required');
  const points=RIVER_SMOOTH_POINTS_V296,bankHalf=RIVER_NAV_HALF_WIDTH_V067;
  const floor=points[0].y,ceiling=points[points.length-1].y;
  const bounds=global.__MAP_REALISM_V2__?.visibleBounds;
  const fringe=(p,side,width)=>({
    x:p.x+side*width, y:p.y
  });
  function shorelineWidth(p,i){
    // The living river gently changes width, but the visible wetted extent
    // never strays more than six units from the navigation boundary.
    return bankHalf-3+4*Math.sin(p.y*.0045)+2*Math.sin(p.y*.011+i*.01);
  }
  function ribbon(multiplier,extra=0){
    const path=new Path2D(),n=points.length;
    function edge(i,side){
      const p=points[i],width=shorelineWidth(p,i)*multiplier+extra;
      const a=points[Math.max(0,i-1)],b=points[Math.min(n-1,i+1)];
      const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
      return{x:p.x-side*dy/len*width,y:p.y+side*dx/len*width};
    }
    for(let i=0;i<n;i++){const p=edge(i,1);if(!i)path.moveTo(p.x,p.y);else path.lineTo(p.x,p.y);}
    for(let i=n-1;i>=0;i--){const p=edge(i,-1);path.lineTo(p.x,p.y);}
    path.closePath();return path;
  }
  const soil=ribbon(1,18),silt=ribbon(1,11),shallow=ribbon(1,5);
  const river=ribbon(1,0),deep=ribbon(.82,0),current=ribbon(.54,0);
  const baseDraw=drawRiverV067;
  function drawNaturalRiverV297(){
    const visible=bounds?bounds(130):{top:0,bottom:WORLD.height,left:0,right:WORLD.width};
    // All polygons use the SAME centerline the soldiers collide with.
    ctx.save();
    ctx.fillStyle='rgba(59,61,42,.31)';ctx.fill(soil);
    ctx.fillStyle='rgba(119,105,73,.48)';ctx.fill(silt);
    ctx.fillStyle='rgba(155,141,105,.32)';ctx.fill(shallow);
    ctx.fillStyle='#5d807d';ctx.fill(river);
    ctx.fillStyle='rgba(48,85,86,.50)';ctx.fill(deep);
    ctx.fillStyle='rgba(46,81,87,.28)';ctx.fill(current);
    // Thin, low-contrast moving reflections follow the curve tangent;
    // near a bridge, smaller arcs mimic turbulence without white foam bars.
    const time=Number.isFinite(elapsed)?elapsed:0;
    for(let i=0;i<100;i++){
      const y=floor+(((i*.61803398875*(ceiling-floor)+time*(17+i%7*1.3))%(ceiling-floor))+(ceiling-floor))%(ceiling-floor);
      if(y<visible.top-50||y>visible.bottom+50)continue;
      const x=riverCenterXAtYV067(y);
      const tang=riverTangentAtV296(y),normal={x:-tang.y,y:tang.x};
      const side=Math.sin(i*19.13)*.80;
      const width=shorelineWidth({y},i);
      const px=x+side*width*normal.x,py=y+side*width*normal.y;
      const crossing=WATER_CROSSINGS_V067.some(c=>Math.hypot(c.x-px,c.y-py)<90);
      const length=crossing?6:12+i%4*3;
      ctx.strokeStyle=crossing?'rgba(198,218,207,.34)':'rgba(199,220,205,.13)';
      ctx.lineWidth=crossing?1.7:1.1;
      ctx.lineCap='round';ctx.beginPath();
      ctx.moveTo(px-length*.5*tang.x,py-length*.5*tang.y);
      ctx.lineTo(px+length*.5*tang.x,py+length*.5*tang.y);
      ctx.stroke();
    }
    ctx.restore();
  }
  drawRiverV067=drawNaturalRiverV297;
  global.__LIVING_RIVER_V297__=Object.freeze({
    version:'river-surface-v297',
    animatedFlow:true,
    visibleBankShading:true,
    sharedRiverGeometry:true,
    mobileBoundedHighlights:true,
    waterHalfWidth:bankHalf,
    baseDrawExists:typeof baseDraw==='function',
    draw:drawNaturalRiverV297
  });
  if(global.NRTS?.subsystems&&!global.NRTS.subsystems.has('river-surface-v297'))
    global.NRTS.subsystems.register('river-surface-v297',global.__LIVING_RIVER_V297__,{phase:'rendering-v2.1',legacyBridge:false,
      responsibility:'natural water surface, shallow banks and time-coherent flow highlights'});
})(window);
