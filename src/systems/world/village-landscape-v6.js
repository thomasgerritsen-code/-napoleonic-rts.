'use strict';
// ---------- Village landscape v6: commons, footpaths and agricultural fringe ----------
(function installVillageLandscapeV6(global){
  const nrts=global.NRTS;
  if(!nrts) throw new Error('NRTS foundation runtime must load before Village V6 landscape.');

  function hash01(seed){
    let x=(seed>>>0)||1;x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;
  }
  function seedFor(village,index=0){
    let h=2166136261;const text=`${village.name||'village'}:${index}`;
    for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;
  }

  function irregularBlob(x,y,rx,ry,seed,fill,rotation=0){
    ctx.save();ctx.translate(x,y);ctx.rotate(rotation);ctx.fillStyle=fill;ctx.beginPath();
    const points=18;
    for(let i=0;i<points;i++){
      const a=i/points*Math.PI*2;
      const wobble=.84+hash01(seed^(i*2654435761))*.22;
      const px=Math.cos(a)*rx*wobble,py=Math.sin(a)*ry*wobble;
      if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
    }
    ctx.closePath();ctx.fill();ctx.restore();
  }

  function curvedPath(ax,ay,bx,by,seed,width,alpha=.26){
    const dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy)||1;
    const nx=-dy/len,ny=dx/len;
    const bend=(hash01(seed^0x91)-.5)*Math.min(44,len*.24);
    const mx=(ax+bx)*.5+nx*bend,my=(ay+by)*.5+ny*bend;
    ctx.save();ctx.strokeStyle=`rgba(151,128,86,${alpha})`;ctx.lineWidth=Math.max(width,width/camera.zoom);ctx.lineCap='round';ctx.lineJoin='round';
    ctx.beginPath();ctx.moveTo(ax,ay);ctx.quadraticCurveTo(mx,my,bx,by);ctx.stroke();
    ctx.strokeStyle=`rgba(103,88,62,${alpha*.26})`;ctx.lineWidth=Math.max(1.1,width*.18/camera.zoom);ctx.beginPath();ctx.moveTo(ax,ay);ctx.quadraticCurveTo(mx,my,bx,by);ctx.stroke();ctx.restore();
  }

  function drawFarmStrip(house,seed){
    const rear=house.side>0?1:-1;
    const w=Math.max(56,house.w*1.45),h=Math.max(34,house.h*1.55);
    ctx.save();ctx.translate(house.x,house.y);ctx.rotate(house.angle||0);
    const cx=0,cy=rear*(house.h*.75+h*.48);
    ctx.fillStyle='rgba(108,93,55,.16)';ctx.fillRect(cx-w/2,cy-h/2,w,h);
    ctx.strokeStyle='rgba(79,99,56,.34)';ctx.lineWidth=Math.max(.55,.9/camera.zoom);
    const rows=5+Math.floor(hash01(seed^0x511)*3);
    for(let i=1;i<=rows;i++){
      const yy=cy-h/2+i*h/(rows+1);ctx.beginPath();ctx.moveTo(cx-w*.44,yy);ctx.lineTo(cx+w*.44,yy);ctx.stroke();
    }
    ctx.restore();
  }

  function drawEdgeVegetation(house,seed){
    if(house.zone!=='farm-edge') return;
    const rear=house.side>0?1:-1;
    ctx.save();ctx.translate(house.x,house.y);ctx.rotate(house.angle||0);
    for(let i=0;i<5;i++){
      const px=(hash01(seed^(0x700+i*23))-.5)*house.w*1.8;
      const py=rear*(house.h*.9+hash01(seed^(0x800+i*31))*house.h*1.5);
      const r=3+hash01(seed^(0x900+i*37))*3.2;
      ctx.fillStyle='rgba(42,72,39,.70)';ctx.beginPath();ctx.arc(px,py,r,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='rgba(78,104,56,.34)';ctx.beginPath();ctx.arc(px-1.2,py-1.2,r*.55,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }

  function nearestHouse(house,houses,predicate=()=>true){
    let best=null,bestD=Infinity;
    for(const other of houses){
      if(other===house||!predicate(other)) continue;
      const d=Math.hypot(other.x-house.x,other.y-house.y);
      if(d<bestD){bestD=d;best=other;}
    }
    return best;
  }

  function drawVillageLandscapeV6(village){
    const houses=village?.houses||[];if(!houses.length)return;
    const seed=seedFor(village);
    const core=houses.filter(h=>h.zone==='core');
    const residential=houses.filter(h=>h.zone==='residential');
    const farm=houses.filter(h=>h.zone==='farm-edge');

    // One shared village floor instead of one visible rectangle per property.
    irregularBlob(village.x,village.y,92+core.length*11,66+core.length*8,seed,'rgba(137,127,84,.12)',0);
    for(let i=0;i<core.length;i++) irregularBlob(core[i].x,core[i].y,58,42,seed^(i+1)*101,'rgba(139,128,86,.075)',core[i].angle||0);
    for(let i=0;i<residential.length;i++) irregularBlob(residential[i].x,residential[i].y,43,30,seed^(i+1)*211,'rgba(117,130,78,.045)',residential[i].angle||0);

    // Pedestrian network: houses connect to the road, core and nearby neighbours.
    for(let i=0;i<houses.length;i++){
      const h=houses[i],hs=seedFor(village,i+1);
      if(typeof nearestRoadGeometryV069==='function'){
        const road=nearestRoadGeometryV069(h.x,h.y);
        if(road) curvedPath(h.x,h.y,road.px,road.py,hs, h.zone==='core'?5.2:3.2, h.zone==='core'?.30:.19);
      }
      if(h.zone==='core') curvedPath(h.x,h.y,village.x,village.y,hs^0x311,4.2,.18);
      if(h.zone==='residential'){
        const n=nearestHouse(h,houses,o=>o.zone==='residential'||o.zone==='core');
        if(n&&Math.hypot(n.x-h.x,n.y-h.y)<150) curvedPath(h.x,h.y,n.x,n.y,hs^0x411,2.3,.095);
      }
    }

    // Agricultural fringe: paired farm buildings share tracks and cultivated ground.
    const compounds=new Map();
    for(const h of farm){
      if(h.kind==='farmhouse') drawFarmStrip(h,seedFor(village,houses.indexOf(h)+33));
      drawEdgeVegetation(h,seedFor(village,houses.indexOf(h)+55));
      if(h.compoundId){if(!compounds.has(h.compoundId)) compounds.set(h.compoundId,[]);compounds.get(h.compoundId).push(h);}
    }
    for(const [id,members] of compounds){
      if(members.length<2) continue;
      const a=members[0],b=members[1];
      curvedPath(a.x,a.y,b.x,b.y,seed^id.length*977,4.8,.17);
      irregularBlob((a.x+b.x)/2,(a.y+b.y)/2,Math.max(34,Math.hypot(a.x-b.x,a.y-b.y)*.38),24,seed^id.length*1237,'rgba(126,109,70,.075)',Math.atan2(b.y-a.y,b.x-a.x));
    }
  }

  const api=Object.freeze({
    version:'village-landscape-v6',sharedGround:true,footpaths:true,agriculturalFringe:true,farmTracks:true,individualPlotDominance:false
  });
  global.drawVillageLandscapeV6=drawVillageLandscapeV6;
  global.__VILLAGE_LANDSCAPE_V6__=api;
  nrts.subsystems.register('village-landscape-v6',api,{
    phase:'architecture-v2',legacyBridge:false,
    responsibility:'shared settlement ground, footpath network and agricultural transition around Village V6 structures'
  });
})(window);
