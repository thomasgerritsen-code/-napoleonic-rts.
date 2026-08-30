'use strict';
// ---------- Village yard blend v5: shared commons + natural parcel edges ----------
(function installVillageYardBlendV5(global) {
  const nrts = global.NRTS;
  if (!nrts) throw new Error('NRTS foundation runtime must load before village yard blending.');
  if (typeof drawHouseV069 !== 'function') throw new Error('Village renderer v2 must load before village yard blending.');

  const YARD_MULTIPLIERS = Object.freeze({
    cottage:[2.0,2.35],
    farmhouse:[2.15,2.65],
    barn:[1.8,2.0],
    inn:[2.0,2.15],
    chapel:[1.8,2.5]
  });

  function yardGeometry(house) {
    const [mw,mh] = YARD_MULTIPLIERS[house.kind] || YARD_MULTIPLIERS.cottage;
    return {w:house.w*mw,h:house.h*mh};
  }

  function hash01(seed) {
    let x=(seed>>>0)||1;
    x^=x<<13;x^=x>>>17;x^=x<<5;
    return (x>>>0)/4294967296;
  }

  function seedFor(house,index) {
    return (house.yardSeed || (((Math.round(house.x)*73856093)^(Math.round(house.y)*19349663)^((index+1)*83492791))>>>0));
  }

  function near(a,b,epsilon=.4) { return Math.abs(a-b)<=epsilon; }

  function openSidesFor(house,village,yard) {
    const open={left:false,right:false,top:false,bottom:false};
    if (!village?.houses) return open;
    const ca=Math.cos(house.angle||0),sa=Math.sin(house.angle||0);
    for (const other of village.houses) {
      if (other===house) continue;
      const dx=other.x-house.x,dy=other.y-house.y;
      const distance=Math.hypot(dx,dy);
      const otherRadius=other.plotRadius || Math.hypot(other.w,other.h);
      const ownRadius=house.plotRadius || Math.hypot(yard.w,yard.h)*.5;
      if (distance>ownRadius+otherRadius+72) continue;
      const lx=dx*ca+dy*sa;
      const ly=-dx*sa+dy*ca;
      if (Math.abs(lx/yard.w)>Math.abs(ly/yard.h)) open[lx<0?'left':'right']=true;
      else open[ly<0?'top':'bottom']=true;
    }
    return open;
  }

  function drawOrganicPlot(yard,seed,fillStyle) {
    const hw=yard.w*.5,hh=yard.h*.5;
    const pts=[
      [-hw*.82,-hh],[-hw*.25,-hh*(.97+hash01(seed^0x11)*.05)],[hw*.42,-hh*(.96+hash01(seed^0x12)*.06)],[hw*.88,-hh*.84],
      [hw,-hh*.30],[hw*(.96+hash01(seed^0x13)*.04),hh*.36],[hw*.80,hh],[hw*.16,hh*(.96+hash01(seed^0x14)*.05)],
      [-hw*.48,hh*(.95+hash01(seed^0x15)*.06)],[-hw*.94,hh*.78],[-hw*(.96+hash01(seed^0x16)*.04),hh*.20],[-hw*.96,-hh*.42]
    ];
    ctx.save();
    ctx.fillStyle=fillStyle;
    ctx.beginPath();
    pts.forEach((p,i)=>{if(i===0)ctx.moveTo(p[0],p[1]);else ctx.lineTo(p[0],p[1]);});
    ctx.closePath();ctx.fill();
    ctx.restore();
  }

  function edgeSegments(side,yard,seed,isOpen) {
    const hw=yard.w*.5,hh=yard.h*.5;
    const gap=isOpen?.36:.18;
    const jitter=(hash01(seed^(side.length*7919))-.5)*3;
    if(side==='top'||side==='bottom'){
      const y=(side==='top'?-hh:hh)+jitter;
      return [[[-hw*.90,y],[-hw*gap,y+jitter*.12]],[[hw*gap,y-jitter*.12],[hw*.90,y]]];
    }
    const x=(side==='left'?-hw:hw)+jitter;
    return [[[x,-hh*.90],[x+jitter*.12,-hh*gap]],[[x-jitter*.12,hh*gap],[x,hh*.90]]];
  }

  function drawNaturalBoundary(yard,kind,seed,open) {
    ctx.save();
    ctx.setLineDash([]);
    ctx.lineCap='round';
    ctx.lineJoin='round';
    ctx.lineWidth=Math.max(.75,(kind==='chapel'?1.8:1.25)/camera.zoom);
    ctx.strokeStyle=kind==='chapel'?'rgba(109,105,91,.58)':kind==='barn'?'rgba(91,72,47,.48)':'rgba(53,78,43,.56)';

    for(const side of ['top','right','bottom','left']){
      const segments=edgeSegments(side,yard,seed,open[side]);
      // Shared edges are intentionally lighter and shorter so neighboring parcels read as one settlement.
      ctx.globalAlpha=open[side]?.48:1;
      for(const [[x1,y1],[x2,y2]] of segments){
        const mx=(x1+x2)*.5+(hash01(seed^(Math.round(x1*13)+Math.round(y1*17)))-.5)*4;
        const my=(y1+y2)*.5+(hash01(seed^(Math.round(x2*19)+Math.round(y2*23)))-.5)*4;
        ctx.beginPath();ctx.moveTo(x1,y1);ctx.quadraticCurveTo(mx,my,x2,y2);ctx.stroke();
      }
    }
    ctx.globalAlpha=1;
    ctx.restore();
  }

  function drawVillageCommonsV5(village) {
    const houses=village?.houses || [];
    if (!houses.length) return;
    ctx.save();
    ctx.lineCap='round';
    ctx.lineJoin='round';

    // A soft common-ground network visually joins nearby plots without changing collision geometry.
    for(let i=0;i<houses.length;i++){
      const a=houses[i];
      let links=0;
      const candidates=houses.map((b,j)=>({b,j,d:j===i?Infinity:Math.hypot(a.x-b.x,a.y-b.y)})).sort((p,q)=>p.d-q.d);
      for(const {b,d} of candidates){
        if(links>=2||d>180) break;
        ctx.strokeStyle='rgba(118,118,75,.105)';
        ctx.lineWidth=Math.max(18,Math.min(42,(a.plotRadius||30)*.42));
        ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
        links++;
      }
    }

    for(let i=0;i<houses.length;i++){
      const h=houses[i],yard=yardGeometry(h);
      ctx.save();ctx.translate(h.x,h.y);ctx.rotate(h.angle||0);
      ctx.fillStyle='rgba(111,126,78,.075)';
      ctx.beginPath();ctx.ellipse(0,0,yard.w*.48,yard.h*.47,0,0,Math.PI*2);ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  const previousDrawHouse=drawHouseV069;
  drawHouseV069=function drawHouseVillageYardBlendV5(house,index,village){
    const yard=yardGeometry(house);
    const seed=seedFor(house,index);
    const open=openSidesFor(house,village,yard);
    const originalFillRect=ctx.fillRect;
    const originalStrokeRect=ctx.strokeRect;

    ctx.fillRect=function(x,y,w,h){
      if(near(w,yard.w)&&near(h,yard.h)&&near(x,-yard.w/2)&&near(y,-yard.h/2)){
        const style=ctx.fillStyle;
        drawOrganicPlot(yard,seed,style);
        return;
      }
      return originalFillRect.call(ctx,x,y,w,h);
    };

    ctx.strokeRect=function(x,y,w,h){
      if(near(w,yard.w)&&near(h,yard.h)&&near(x,-yard.w/2)&&near(y,-yard.h/2)){
        drawNaturalBoundary(yard,house.kind||'cottage',seed,open);
        return;
      }
      return originalStrokeRect.call(ctx,x,y,w,h);
    };

    try { previousDrawHouse(house,index,village); }
    finally { ctx.fillRect=originalFillRect;ctx.strokeRect=originalStrokeRect; }
  };

  const api=Object.freeze({
    version:'village-yard-blend-v5',
    fullRectBoundaries:false,
    sharedEdgesOpen:true,
    organicPlotShape:true,
    villageGroundConnections:true,
    collisionGeometryUnchanged:true,
    drawVillageCommons:drawVillageCommonsV5
  });
  global.drawVillageCommonsV5=drawVillageCommonsV5;
  global.__VILLAGE_YARD_BLEND_V5__=api;
  nrts.subsystems.register('village-yard-blend-v5',api,{
    phase:'architecture-v2',
    legacyBridge:false,
    responsibility:'natural shared village ground and broken/open parcel boundaries without changing collision footprints'
  });
})(window);
