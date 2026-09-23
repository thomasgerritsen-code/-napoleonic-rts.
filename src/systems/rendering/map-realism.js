'use strict';
// ---------- Architecture v2.1: Map Realism v2 ----------
(function installMapRealismV2(global){
  const nrts=global.NRTS;
  if(!nrts)throw new Error('NRTS foundation runtime must load before map realism renderer.');
  const roadCfg=global.NRTS_CONFIG?.world?.roads?.rendering || {};
  const activeRoads=global.NRTS_ROAD_NETWORK_V7 || ROAD_NETWORK_V066;
  const vegetationRoadPadding=roadCfg.vegetationPadding??10;

  function seeded(seed){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
  function visibleBounds(margin=0){
    const halfW=innerWidth/(2*Math.max(.05,camera.zoom))+margin;
    const halfH=innerHeight/(2*Math.max(.05,camera.zoom))+margin;
    const left=Math.max(0,camera.x-halfW),right=Math.min(WORLD.width,camera.x+halfW);
    const top=Math.max(0,camera.y-halfH),bottom=Math.min(WORLD.height,camera.y+halfH);
    return{left,right,top,bottom,width:Math.max(0,right-left),height:Math.max(0,bottom-top)};
  }
  function pointVisible(b,x,y,margin=0){return x>=b.left-margin&&x<=b.right+margin&&y>=b.top-margin&&y<=b.bottom+margin;}
  function rectVisible(b,x,y,w,h,margin=0){return x+w>=b.left-margin&&x<=b.right+margin&&y+h>=b.top-margin&&y<=b.bottom+margin;}
  function pointSegmentDistanceSq(px,py,ax,ay,bx,by){
    const dx=bx-ax,dy=by-ay,lenSq=dx*dx+dy*dy;
    if(lenSq<=.0001){const ex=px-ax,ey=py-ay;return ex*ex+ey*ey;}
    const t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/lenSq));
    const qx=ax+t*dx,qy=ay+t*dy,ex=px-qx,ey=py-qy;
    return ex*ex+ey*ey;
  }
  function roadConflictAt(x,y,radius=0,padding=vegetationRoadPadding){
    const rr=Math.max(0,Number(radius)||0),pad=Math.max(0,Number(padding)||0);
    for(const road of activeRoads){
      const points=road.points||[],clearance=Math.max(9,Number(road.width)||9)*.5+rr+pad;
      const clearanceSq=clearance*clearance;
      for(let i=1;i<points.length;i++)if(pointSegmentDistanceSq(x,y,points[i-1].x,points[i-1].y,points[i].x,points[i].y)<=clearanceSq)return true;
    }
    return false;
  }

  const rand=seeded(1805),fields=[];
  for(let i=0;i<18;i++){
    const w=170+rand()*260,h=110+rand()*190;
    fields.push({x:120+rand()*(WORLD.width-240-w),y:130+rand()*(WORLD.height-260-h),w,h,angle:(rand()-.5)*.13,tone:i%3,rows:7+Math.floor(rand()*7)});
  }

  // v1.3.2: static map texture positions are generated once. Previously all 900
  // deterministic ground marks were recalculated and redrawn across the entire world every frame.
  const groundMarks=[];
  {
    const local=seeded(1815);
    for(let i=0;i<900;i++)groundMarks.push({
      x:local()*WORLD.width,
      y:local()*WORLD.height,
      r:.7+local()*2.1,
      light:local()<=.5
    });
  }

  const woodRenderData=(typeof TERRAIN_WOODS!=='undefined'?TERRAIN_WOODS:[]).map((w,index)=>{
    const local=seeded(9000+index*97);
    const cx=w.x+w.w/2,cy=w.y+w.h/2,rx=w.w/2,ry=w.h/2;
    const outline=[];
    for(let i=0;i<22;i++){
      const a=i/22*Math.PI*2,jitter=.83+local()*.22;
      outline.push({x:cx+Math.cos(a)*rx*jitter,y:cy+Math.sin(a)*ry*jitter});
    }
    const trees=[];
    const count=Math.max(12,Math.floor(w.w*w.h/3400));
    for(let i=0;i<count;i++){
      const tree={x:w.x+local()*w.w,y:w.y+local()*w.h,canopy:5+local()*8};
      if(!roadConflictAt(tree.x,tree.y,tree.canopy))trees.push(tree);
    }
    return{w,index,outline,trees};
  });

  const roadRenderData=activeRoads.map(road=>{
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    const path=new Path2D();
    road.points.forEach((p,i)=>{
      if(i===0)path.moveTo(p.x,p.y);else path.lineTo(p.x,p.y);
      minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);
    });
    return{road,path,minX,minY,maxX,maxY};
  });

  const junctions=[];
  {
    const byPoint=new Map();
    for(const road of activeRoads){
      for(const p of road.points){
        const key=`${Math.round(p.x)},${Math.round(p.y)}`;
        const item=byPoint.get(key)||{x:p.x,y:p.y,count:0,maxWidth:0,classes:new Set()};
        item.count++;item.maxWidth=Math.max(item.maxWidth,road.width);item.classes.add(road.roadClass);byPoint.set(key,item);
      }
    }
    for(const j of byPoint.values())if(j.count>=2)junctions.push(j);
  }

  function drawGround(bounds){
    ctx.fillStyle='#687b52';ctx.fillRect(bounds.left,bounds.top,bounds.width,bounds.height);
    for(const mark of groundMarks){
      if(!pointVisible(bounds,mark.x,mark.y,4))continue;
      ctx.fillStyle=mark.light?'rgba(188,178,126,.07)':'rgba(96,117,72,.18)';
      ctx.beginPath();ctx.arc(mark.x,mark.y,mark.r,0,Math.PI*2);ctx.fill();
    }
  }
  function drawFields(bounds){
    fields.forEach((f,index)=>{
      if(!rectVisible(bounds,f.x,f.y,f.w,f.h,35))return;
      const centerX=f.x+f.w/2,centerY=f.y+f.h/2,ca=Math.cos(f.angle),sa=Math.sin(f.angle);
      ctx.save();ctx.translate(centerX,centerY);ctx.rotate(f.angle);
      ctx.fillStyle=f.tone===0?'rgba(154,145,88,.20)':f.tone===1?'rgba(130,126,78,.17)':'rgba(175,157,101,.16)';ctx.fillRect(-f.w/2,-f.h/2,f.w,f.h);
      ctx.strokeStyle='rgba(96,82,53,.25)';ctx.lineWidth=1.6;ctx.strokeRect(-f.w/2,-f.h/2,f.w,f.h);
      ctx.strokeStyle='rgba(88,75,45,.15)';ctx.lineWidth=1;const spacing=f.h/f.rows;
      for(let y=-f.h/2+spacing;y<f.h/2;y+=spacing){
        const start=-f.w/2+5,end=f.w/2-5,step=18;
        for(let x=start;x<end;x+=step){
          const x2=Math.min(end,x+step),mx=(x+x2)/2;
          const wx=centerX+mx*ca-y*sa,wy=centerY+mx*sa+y*ca;
          if(roadConflictAt(wx,wy,2))continue;
          ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y);ctx.stroke();
        }
      }
      if(index%3===0){ctx.strokeStyle='rgba(75,70,43,.30)';ctx.lineWidth=2.3;ctx.beginPath();ctx.moveTo(-f.w/2,-f.h/2);ctx.lineTo(f.w/2,-f.h/2);ctx.stroke();}
      ctx.restore();
    });
  }
  function drawHillRealistic(h,bounds){
    if(!rectVisible(bounds,h.x-h.rx,h.y-h.ry,h.rx*2,h.ry*2,20))return;
    ctx.save();for(let ring=0;ring<4;ring++){const scale=1-ring*.16;ctx.fillStyle=ring===0?'rgba(154,145,92,.11)':'rgba(189,176,117,.035)';ctx.strokeStyle='rgba(213,197,145,.16)';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(h.x,h.y,h.rx*scale,h.ry*scale,0,0,Math.PI*2);ctx.fill();ctx.stroke();}
    ctx.strokeStyle='rgba(96,83,54,.10)';ctx.lineWidth=6;ctx.beginPath();ctx.ellipse(h.x+6,h.y+7,h.rx*.57,h.ry*.57,0,0,Math.PI*2);ctx.stroke();ctx.restore();
  }
  function drawWoodRealistic(data,bounds){
    const w=data.w;
    if(!rectVisible(bounds,w.x,w.y,w.w,w.h,25))return;
    ctx.save();ctx.fillStyle='rgba(39,67,38,.15)';ctx.beginPath();
    data.outline.forEach((p,i)=>{if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);});ctx.closePath();ctx.fill();
    for(const tree of data.trees){
      if(!pointVisible(bounds,tree.x,tree.y,16)||roadConflictAt(tree.x,tree.y,tree.canopy))continue;
      ctx.fillStyle='rgba(29,65,34,.58)';ctx.beginPath();ctx.arc(tree.x,tree.y,tree.canopy,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='rgba(83,112,61,.32)';ctx.beginPath();ctx.arc(tree.x-2,tree.y-2,tree.canopy*.55,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }

  function roadSurfaceColor(road){return road.roadClass==='chaussee'?'rgba(191,174,134,.91)':road.roadClass==='secondary'?'rgba(163,136,95,.84)':'rgba(137,102,67,.75)';}
  function roadShoulderColor(road){return road.roadClass==='track'?'rgba(90,69,48,.25)':'rgba(72,61,44,.34)';}
  function roadVisible(data,bounds,margin=40){return data.maxX>=bounds.left-margin&&data.minX<=bounds.right+margin&&data.maxY>=bounds.top-margin&&data.minY<=bounds.bottom+margin;}

  function drawRoadNetworkBlended(bounds){
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
    const shoulderExtra=roadCfg.shoulderExtra??13;
    const visibleRoads=roadRenderData.filter(data=>roadVisible(data,bounds,55));
    for(const data of visibleRoads){ctx.strokeStyle=roadShoulderColor(data.road);ctx.lineWidth=data.road.width+shoulderExtra;ctx.stroke(data.path);}
    for(const data of visibleRoads){ctx.strokeStyle=roadSurfaceColor(data.road);ctx.lineWidth=data.road.width;ctx.stroke(data.path);}

    for(const j of junctions){
      if(!pointVisible(bounds,j.x,j.y,j.maxWidth+18))continue;
      const radius=j.maxWidth*(roadCfg.junctionApronScale??.62);
      ctx.fillStyle=j.classes.has('chaussee')?'rgba(190,173,133,.91)':j.classes.has('secondary')?'rgba(160,134,94,.84)':'rgba(137,102,67,.75)';
      ctx.beginPath();ctx.arc(j.x,j.y,radius,0,Math.PI*2);ctx.fill();
    }

    const rutFraction=roadCfg.rutFraction??.19;
    for(const data of visibleRoads){
      const road=data.road;
      if(road.roadClass==='track')ctx.setLineDash([18,10]);else ctx.setLineDash([]);
      ctx.strokeStyle='rgba(91,70,47,.24)';ctx.lineWidth=1.7;
      const off=Math.max(3.5,road.width*rutFraction);
      ctx.save();ctx.translate(0,-off);ctx.stroke(data.path);ctx.restore();
      ctx.save();ctx.translate(0,off);ctx.stroke(data.path);ctx.restore();
      ctx.setLineDash([]);ctx.strokeStyle='rgba(229,216,177,.13)';ctx.lineWidth=1;ctx.stroke(data.path);
    }
    ctx.restore();
  }

  function drawWaterSystem(){if(typeof drawRiverV067==='function')drawRiverV067();}
  function drawCrossingSystem(){if(typeof drawCrossingsV067==='function')drawCrossingsV067();}

  drawTerrain=function drawTerrainMapRealismV2(){
    const bounds=visibleBounds(70);
    ctx.save();ctx.beginPath();ctx.rect(bounds.left,bounds.top,bounds.width,bounds.height);ctx.clip();
    drawGround(bounds);drawFields(bounds);
    if(typeof TERRAIN_HILLS!=='undefined')TERRAIN_HILLS.forEach(h=>drawHillRealistic(h,bounds));
    woodRenderData.forEach(data=>drawWoodRealistic(data,bounds));
    drawWaterSystem();
    drawRoadNetworkBlended(bounds);
    drawCrossingSystem();
    if(typeof drawHamletsV066==='function')drawHamletsV066();
    ctx.restore();
  };

  const api=Object.freeze({
    version:'map-realism-v2.4-road-clearance',
    fieldCount:fields.length,
    preservesNavigation:true,
    roadCount:activeRoads.length,
    usesActiveRoadNetwork:true,
    riverRestored:typeof drawRiverV067==='function',
    crossingsRestored:typeof drawCrossingsV067==='function',
    blendedJunctions:true,
    viewportCulling:true,
    precomputedGroundMarks:true,
    precomputedRoadPaths:true,
    precomputedJunctions:true,
    roadClearance2D:true,
    vegetationRoadPadding,
    roadConflictAt,
    visibleBounds
  });
  if(nrts.subsystems.has('map-renderer'))global.__MAP_REALISM_V2__=api;
  else{nrts.subsystems.register('map-renderer',api,{phase:'architecture-v2.1',legacyBridge:false,responsibility:'viewport-culled deterministic terrain with road-cleared woodland/crops and seam-free active-road rendering'});global.__MAP_REALISM_V2__=api;}
})(window);