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

  function groupedHouses(houses){
    const groups=new Map();
    for(const house of houses){
      const id=house.sharedYardId||house.clusterId;
      if(!id) continue;
      if(!groups.has(id)) groups.set(id,[]);
      groups.get(id).push(house);
    }
    return groups;
  }

  function drawSharedHouseholdGround(village,houses,seed){
    const groups=groupedHouses(houses);
    let gi=0;
    for(const [id,members] of groups){
      if(!members.length) continue;
      const cx=members.reduce((sum,h)=>sum+h.x,0)/members.length;
      const cy=members.reduce((sum,h)=>sum+h.y,0)/members.length;
      const maxDx=Math.max(...members.map(h=>Math.abs(h.x-cx)+h.w*.7),28);
      const maxDy=Math.max(...members.map(h=>Math.abs(h.y-cy)+h.h*.9),22);
      const angle=members.reduce((sum,h)=>sum+(h.angle||0),0)/members.length;
      const zone=members[0].zone;
      const fill=zone==='core'?'rgba(139,128,86,.085)':zone==='residential'?'rgba(117,130,78,.058)':'rgba(126,109,70,.070)';
      const groupSeed=(seed ^ Math.imul(id.length+1,2654435761) ^ Math.imul(gi+1,2246822519))>>>0;
      irregularBlob(cx,cy,maxDx*1.05,maxDy*1.12,groupSeed,fill,angle);

      if(members.length>1){
        const sorted=[...members].sort((a,b)=>Math.atan2(a.y-cy,a.x-cx)-Math.atan2(b.y-cy,b.x-cx));
        for(let i=1;i<sorted.length;i++){
          const a=sorted[i-1],b=sorted[i];
          curvedPath(a.x,a.y,b.x,b.y,seed^(gi*811+i*97),zone==='farm-edge'?4.6:2.6,zone==='core'?.15:.10);
        }
      }
      gi++;
    }
  }

  function drawRoadFrontageConnections(village,houses){
    for(let i=0;i<houses.length;i++){
      const h=houses[i],hs=seedFor(village,i+1);
      let road=null;
      if(typeof nearestRoadGeometryV069==='function') road=nearestRoadGeometryV069(h.x,h.y);
      const ax=road?.px ?? h.accessX;
      const ay=road?.py ?? h.accessY;
      if(Number.isFinite(ax)&&Number.isFinite(ay)){
        curvedPath(h.x,h.y,ax,ay,hs,h.zone==='core'?5.2:h.zone==='farm-edge'?3.8:3.0,h.zone==='core'?.30:h.zone==='farm-edge'?.16:.18);
      }
    }
  }

  function drawVillageLandscapeV6(village){
    const houses=village?.houses||[];if(!houses.length)return;
    const seed=seedFor(village);
    const core=houses.filter(h=>h.zone==='core');
    const residential=houses.filter(h=>h.zone==='residential');
    const farm=houses.filter(h=>h.zone==='farm-edge');

    // A continuous village floor plus cluster-shaped household commons prevents every house
    // from reading as a separate rectangular plot while preserving collision-safe spacing.
    irregularBlob(village.x,village.y,92+core.length*11,66+core.length*8,seed,'rgba(137,127,84,.12)',0);
    drawSharedHouseholdGround(village,houses,seed^0x2f31);

    // Road frontage paths start from the actual post-collision position, so paths remain correct
    // when the collision normalizer has shifted a building away from its generated anchor.
    drawRoadFrontageConnections(village,houses);

    for(let i=0;i<core.length;i++){
      const h=core[i],hs=seedFor(village,70+i);
      curvedPath(h.x,h.y,village.x,village.y,hs,4.2,.18);
    }
    for(let i=0;i<residential.length;i++){
      const h=residential[i],hs=seedFor(village,110+i);
      const n=nearestHouse(h,houses,o=>o.zone==='residential'||o.zone==='core');
      if(n&&Math.hypot(n.x-h.x,n.y-h.y)<165) curvedPath(h.x,h.y,n.x,n.y,hs^0x411,2.3,.085);
    }

    // Agricultural fringe: paired farm buildings share tracks, cultivated ground and vegetation.
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
    version:'village-landscape-v6',sharedGround:true,footpaths:true,agriculturalFringe:true,farmTracks:true,individualPlotDominance:false,
    clusterCommons:true,roadFrontageConnections:true,continuousVillageFabric:true,postCollisionPathAnchoring:true
  });
  global.drawVillageLandscapeV6=drawVillageLandscapeV6;
  global.__VILLAGE_LANDSCAPE_V6__=api;
  nrts.subsystems.register('village-landscape-v6',api,{
    phase:'architecture-v2',legacyBridge:false,
    responsibility:'continuous settlement fabric with shared household commons, road frontage paths and agricultural transition'
  });
})(window);
