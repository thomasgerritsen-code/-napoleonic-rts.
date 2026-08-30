'use strict';
// ---------- Architecture v2.1: Map Realism v2 ----------
(function installMapRealismV2(global){
  const nrts=global.NRTS;
  if(!nrts)throw new Error('NRTS foundation runtime must load before map realism renderer.');
  const roadCfg=global.NRTS_CONFIG?.world?.roads?.rendering || {};
  const activeRoads=global.NRTS_ROAD_NETWORK_V7 || ROAD_NETWORK_V066;

  function seeded(seed){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
  const rand=seeded(1805),fields=[];
  for(let i=0;i<18;i++){
    const w=170+rand()*260,h=110+rand()*190;
    fields.push({x:120+rand()*(WORLD.width-240-w),y:130+rand()*(WORLD.height-260-h),w,h,angle:(rand()-.5)*.13,tone:i%3,rows:7+Math.floor(rand()*7)});
  }

  function drawGround(){
    ctx.fillStyle='#687b52';ctx.fillRect(0,0,WORLD.width,WORLD.height);
    const local=seeded(1815);
    for(let i=0;i<900;i++){
      const x=local()*WORLD.width,y=local()*WORLD.height,r=.7+local()*2.1;
      ctx.fillStyle=local()>.5?'rgba(96,117,72,.18)':'rgba(188,178,126,.07)';ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
    }
  }
  function drawFields(){
    fields.forEach((f,index)=>{
      ctx.save();ctx.translate(f.x+f.w/2,f.y+f.h/2);ctx.rotate(f.angle);
      ctx.fillStyle=f.tone===0?'rgba(154,145,88,.20)':f.tone===1?'rgba(130,126,78,.17)':'rgba(175,157,101,.16)';ctx.fillRect(-f.w/2,-f.h/2,f.w,f.h);
      ctx.strokeStyle='rgba(96,82,53,.25)';ctx.lineWidth=1.6;ctx.strokeRect(-f.w/2,-f.h/2,f.w,f.h);
      ctx.strokeStyle='rgba(88,75,45,.15)';ctx.lineWidth=1;const spacing=f.h/f.rows;
      for(let y=-f.h/2+spacing;y<f.h/2;y+=spacing){ctx.beginPath();ctx.moveTo(-f.w/2+5,y);ctx.lineTo(f.w/2-5,y);ctx.stroke();}
      if(index%3===0){ctx.strokeStyle='rgba(75,70,43,.30)';ctx.lineWidth=2.3;ctx.beginPath();ctx.moveTo(-f.w/2,-f.h/2);ctx.lineTo(f.w/2,-f.h/2);ctx.stroke();}
      ctx.restore();
    });
  }
  function drawHillRealistic(h){
    ctx.save();for(let ring=0;ring<4;ring++){const scale=1-ring*.16;ctx.fillStyle=ring===0?'rgba(154,145,92,.11)':'rgba(189,176,117,.035)';ctx.strokeStyle='rgba(213,197,145,.16)';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(h.x,h.y,h.rx*scale,h.ry*scale,0,0,Math.PI*2);ctx.fill();ctx.stroke();}
    ctx.strokeStyle='rgba(96,83,54,.10)';ctx.lineWidth=6;ctx.beginPath();ctx.ellipse(h.x+6,h.y+7,h.rx*.57,h.ry*.57,0,0,Math.PI*2);ctx.stroke();ctx.restore();
  }
  function drawWoodRealistic(w,index){
    const local=seeded(9000+index*97);ctx.save();ctx.fillStyle='rgba(39,67,38,.15)';ctx.beginPath();
    const cx=w.x+w.w/2,cy=w.y+w.h/2,rx=w.w/2,ry=w.h/2;
    for(let i=0;i<22;i++){const a=i/22*Math.PI*2,jitter=.83+local()*.22,x=cx+Math.cos(a)*rx*jitter,y=cy+Math.sin(a)*ry*jitter;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.closePath();ctx.fill();
    const count=Math.max(12,Math.floor(w.w*w.h/3400));
    for(let i=0;i<count;i++){const x=w.x+local()*w.w,y=w.y+local()*w.h,canopy=5+local()*8;ctx.fillStyle='rgba(29,65,34,.58)';ctx.beginPath();ctx.arc(x,y,canopy,0,Math.PI*2);ctx.fill();ctx.fillStyle='rgba(83,112,61,.32)';ctx.beginPath();ctx.arc(x-2,y-2,canopy*.55,0,Math.PI*2);ctx.fill();}
    ctx.restore();
  }

  function roadTrace(road){const pts=road.points;ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);}
  function roadSurfaceColor(road){return road.roadClass==='chaussee'?'rgba(191,174,134,.91)':road.roadClass==='secondary'?'rgba(163,136,95,.84)':'rgba(137,102,67,.75)';}
  function roadShoulderColor(road){return road.roadClass==='track'?'rgba(90,69,48,.25)':'rgba(72,61,44,.34)';}

  function drawRoadNetworkBlended(){
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
    const shoulderExtra=roadCfg.shoulderExtra??13;
    // Draw all shoulders first, then all surfaces. This removes the dark seams where roads meet.
    for(const road of activeRoads){ctx.strokeStyle=roadShoulderColor(road);ctx.lineWidth=road.width+shoulderExtra;roadTrace(road);ctx.stroke();}
    for(const road of activeRoads){ctx.strokeStyle=roadSurfaceColor(road);ctx.lineWidth=road.width;roadTrace(road);ctx.stroke();}

    // Junction aprons merge road surfaces into one naturally worn patch.
    const junctions=new Map();
    for(const road of activeRoads){
      for(const p of road.points){const key=`${Math.round(p.x)},${Math.round(p.y)}`,item=junctions.get(key)||{x:p.x,y:p.y,count:0,maxWidth:0,classes:new Set()};item.count++;item.maxWidth=Math.max(item.maxWidth,road.width);item.classes.add(road.roadClass);junctions.set(key,item);}
    }
    for(const j of junctions.values()){
      if(j.count<2)continue;
      const radius=j.maxWidth*(roadCfg.junctionApronScale??.62);
      ctx.fillStyle=j.classes.has('chaussee')?'rgba(190,173,133,.91)':j.classes.has('secondary')?'rgba(160,134,94,.84)':'rgba(137,102,67,.75)';
      ctx.beginPath();ctx.arc(j.x,j.y,radius,0,Math.PI*2);ctx.fill();
    }

    // Wheel ruts are drawn after merging so they continue visually through junctions.
    const rutFraction=roadCfg.rutFraction??.19;
    for(const road of activeRoads){
      if(road.roadClass==='track')ctx.setLineDash([18,10]);else ctx.setLineDash([]);
      ctx.strokeStyle='rgba(91,70,47,.24)';ctx.lineWidth=1.7;
      // Slight translated traces are intentionally subtle; surface overlap remains continuous.
      const off=Math.max(3.5,road.width*rutFraction);
      ctx.save();ctx.translate(0,-off);roadTrace(road);ctx.stroke();ctx.restore();ctx.save();ctx.translate(0,off);roadTrace(road);ctx.stroke();ctx.restore();
      ctx.setLineDash([]);ctx.strokeStyle='rgba(229,216,177,.13)';ctx.lineWidth=1;roadTrace(road);ctx.stroke();
    }
    ctx.restore();
  }

  function drawWaterSystem(){
    if(typeof drawRiverV067==='function')drawRiverV067();
  }
  function drawCrossingSystem(){
    if(typeof drawCrossingsV067==='function')drawCrossingsV067();
  }

  drawTerrain=function drawTerrainMapRealismV2(){
    drawGround();drawFields();
    if(typeof TERRAIN_HILLS!=='undefined')TERRAIN_HILLS.forEach(drawHillRealistic);
    if(typeof TERRAIN_WOODS!=='undefined')TERRAIN_WOODS.forEach(drawWoodRealistic);
    // Water must be below roads/bridges but above fields.
    drawWaterSystem();
    drawRoadNetworkBlended();
    drawCrossingSystem();
    if(typeof drawHamletsV066==='function')drawHamletsV066();
  };

  const api=Object.freeze({
    version:'map-realism-v2',
    fieldCount:fields.length,
    preservesNavigation:true,
    roadCount:activeRoads.length,
    usesActiveRoadNetwork:true,
    riverRestored:typeof drawRiverV067==='function',
    crossingsRestored:typeof drawCrossingsV067==='function',
    blendedJunctions:true
  });
  if(nrts.subsystems.has('map-renderer'))global.__MAP_REALISM_V2__=api;
  else{nrts.subsystems.register('map-renderer',api,{phase:'architecture-v2.1',legacyBridge:false,responsibility:'deterministic terrain with restored water system and seam-free active-road rendering'});global.__MAP_REALISM_V2__=api;}
})(window);
