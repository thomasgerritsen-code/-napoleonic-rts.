'use strict';
// ---------- Village landscape v6: commons, footpaths, archetype ground and agricultural fringe ----------
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

  function activeRoadGeometryAt(x,y){
    if(typeof roadGeometryV069!=='function') return null;
    const network=global.NRTS_ROAD_NETWORK_V7 || (typeof ROAD_NETWORK_V066!=='undefined'?ROAD_NETWORK_V066:[]);
    let best=null;
    for(const road of network){
      const geometry=roadGeometryV069(road,x,y);
      if(geometry&&(!best||geometry.edgeClearance<best.edgeClearance)) best=geometry;
    }
    return best;
  }
  function roadConflictAt(x,y,radius=0,padding=8){
    const road=activeRoadGeometryAt(x,y);
    return Boolean(road&&Number.isFinite(road.edgeClearance)&&road.edgeClearance<Math.max(0,radius)+Math.max(0,padding));
  }

  function archetypeGround(village,seed,coreCount){
    const road=activeRoadGeometryAt(village.x,village.y);
    const roadAngle=road?Math.atan2(road.ty,road.tx):0;
    const type=village.archetype||'crossroads';
    if(type==='ribbon'){
      irregularBlob(village.x,village.y,158+coreCount*7,48+coreCount*4,seed,'rgba(137,127,84,.085)',roadAngle);
      return {type,rotation:roadAngle,rx:158,ry:48};
    }
    if(type==='parish-centre'){
      irregularBlob(village.x,village.y,124+coreCount*9,94+coreCount*7,seed,'rgba(137,127,84,.145)',roadAngle*.18);
      irregularBlob(village.x,village.y,50,34,seed^0x51a7,'rgba(178,161,105,.10)',roadAngle*.12);
      return {type,rotation:roadAngle*.18,rx:124,ry:94};
    }
    if(type==='agrarian'){
      irregularBlob(village.x,village.y,88+coreCount*7,62+coreCount*5,seed,'rgba(137,127,84,.085)',roadAngle*.25);
      return {type,rotation:roadAngle*.25,rx:88,ry:62};
    }
    if(type==='woodland'){
      irregularBlob(village.x,village.y,94+coreCount*8,70+coreCount*6,seed,'rgba(117,126,78,.078)',roadAngle*.36);
      return {type,rotation:roadAngle*.36,rx:94,ry:70};
    }
    irregularBlob(village.x,village.y,112+coreCount*9,80+coreCount*6,seed,'rgba(137,127,84,.115)',roadAngle*.12);
    return {type:'crossroads',rotation:roadAngle*.12,rx:112,ry:80};
  }

  function drawCoreSpokes(village,core,seed){
    const type=village.archetype||'crossroads';
    for(let i=0;i<core.length;i++){
      const h=core[i],hs=seedFor(village,70+i);
      const width=type==='parish-centre'?4.8:type==='agrarian'?3.4:4.2;
      const alpha=type==='woodland'?.12:type==='ribbon'?.14:.18;
      curvedPath(h.x,h.y,village.x,village.y,hs,width,alpha);
    }
    if(type==='crossroads'){
      const road=activeRoadGeometryAt(village.x,village.y);
      if(road){
        const span=56;
        curvedPath(village.x-road.tx*span,village.y-road.ty*span,village.x+road.tx*span,village.y+road.ty*span,seed^0x771,4.1,.10);
        curvedPath(village.x-road.ty*span*.68,village.y+road.tx*span*.68,village.x+road.ty*span*.68,village.y-road.tx*span*.68,seed^0x772,3.2,.075);
      }
    }
  }

  function drawWoodlandPocket(village,seed){
    if(village.archetype!=='woodland') return;
    for(let i=0;i<8;i++){
      const a=hash01(seed^(i*101+0x801))*Math.PI*2;
      const d=72+hash01(seed^(i*131+0x802))*64;
      const x=village.x+Math.cos(a)*d,y=village.y+Math.sin(a)*d;
      const r=3.5+hash01(seed^(i*151+0x803))*3.8;
      if(roadConflictAt(x,y,r,8))continue;
      ctx.fillStyle='rgba(45,73,42,.52)';ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
    }
  }

  function drawFarmStrip(house,seed){
    const rear=house.side>0?1:-1;
    const w=Math.max(56,house.w*1.45),h=Math.max(34,house.h*1.55),angle=house.angle||0;
    const ca=Math.cos(angle),sa=Math.sin(angle);
    ctx.save();ctx.translate(house.x,house.y);ctx.rotate(angle);
    const cx=0,cy=rear*(house.h*.75+h*.48);
    ctx.fillStyle='rgba(108,93,55,.16)';ctx.fillRect(cx-w/2,cy-h/2,w,h);
    ctx.strokeStyle='rgba(79,99,56,.34)';ctx.lineWidth=Math.max(.55,.9/camera.zoom);
    const rows=5+Math.floor(hash01(seed^0x511)*3);
    for(let i=1;i<=rows;i++){
      const yy=cy-h/2+i*h/(rows+1),start=cx-w*.44,end=cx+w*.44,step=12;
      for(let xx=start;xx<end;xx+=step){
        const xx2=Math.min(end,xx+step),mx=(xx+xx2)/2;
        const wx=house.x+mx*ca-yy*sa,wy=house.y+mx*sa+yy*ca;
        if(roadConflictAt(wx,wy,1.5,7))continue;
        ctx.beginPath();ctx.moveTo(xx,yy);ctx.lineTo(xx2,yy);ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawEdgeVegetation(house,seed){
    if(house.zone!=='farm-edge') return;
    const rear=house.side>0?1:-1,angle=house.angle||0,ca=Math.cos(angle),sa=Math.sin(angle);
    ctx.save();ctx.translate(house.x,house.y);ctx.rotate(angle);
    for(let i=0;i<5;i++){
      const px=(hash01(seed^(0x700+i*23))-.5)*house.w*1.8;
      const py=rear*(house.h*.9+hash01(seed^(0x800+i*31))*house.h*1.5);
      const r=3+hash01(seed^(0x900+i*37))*3.2;
      const wx=house.x+px*ca-py*sa,wy=house.y+px*sa+py*ca;
      if(roadConflictAt(wx,wy,r,8))continue;
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
      const type=village.archetype||'crossroads';
      const baseAlpha=type==='agrarian'?.080:type==='woodland'?.050:type==='parish-centre'?.072:.060;
      const fill=zone==='core'?`rgba(139,128,86,${baseAlpha+.025})`:zone==='residential'?`rgba(117,130,78,${baseAlpha})`:`rgba(126,109,70,${baseAlpha+.012})`;
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
      const road=activeRoadGeometryAt(h.x,h.y);
      const ax=road?.px ?? h.accessX;
      const ay=road?.py ?? h.accessY;
      if(Number.isFinite(ax)&&Number.isFinite(ay)){
        const type=village.archetype||'crossroads';
        const alphaScale=type==='woodland'?.82:type==='ribbon'?.90:1;
        curvedPath(h.x,h.y,ax,ay,hs,h.zone==='core'?5.2:h.zone==='farm-edge'?3.8:3.0,(h.zone==='core'?.30:h.zone==='farm-edge'?.16:.18)*alphaScale);
      }
    }
  }

  function drawVillageLandscapeV6(village){
    const houses=village?.houses||[];if(!houses.length)return;
    const seed=seedFor(village);
    const core=houses.filter(h=>h.zone==='core');
    const residential=houses.filter(h=>h.zone==='residential');
    const farm=houses.filter(h=>h.zone==='farm-edge');

    archetypeGround(village,seed,core.length);
    drawSharedHouseholdGround(village,houses,seed^0x2f31);
    drawRoadFrontageConnections(village,houses);
    drawCoreSpokes(village,core,seed);
    drawWoodlandPocket(village,seed^0x9551);

    for(let i=0;i<residential.length;i++){
      const h=residential[i],hs=seedFor(village,110+i);
      const n=nearestHouse(h,houses,o=>o.zone==='residential'||o.zone==='core');
      const maxLink=village.archetype==='ribbon'?190:village.archetype==='agrarian'?145:165;
      if(n&&Math.hypot(n.x-h.x,n.y-h.y)<maxLink) curvedPath(h.x,h.y,n.x,n.y,hs^0x411,2.3,village.archetype==='woodland'?.065:.085);
    }

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
    version:'village-landscape-v6.1-road-clearance',sharedGround:true,footpaths:true,agriculturalFringe:true,farmTracks:true,individualPlotDominance:false,
    clusterCommons:true,roadFrontageConnections:true,continuousVillageFabric:true,postCollisionPathAnchoring:true,activeRoadNetworkAware:true,
    archetypeGroundProfiles:true,parishCommon:true,ribbonGroundAxis:true,woodlandPockets:true,archetypePathDensity:true,roadVegetationClearance:true
  });
  global.drawVillageLandscapeV6=drawVillageLandscapeV6;
  global.__VILLAGE_LANDSCAPE_V6__=api;
  nrts.subsystems.register('village-landscape-v6',api,{
    phase:'architecture-v2',legacyBridge:false,
    responsibility:'archetype-aware settlement ground with road-cleared crops/vegetation and shared household commons'
  });
})(window);