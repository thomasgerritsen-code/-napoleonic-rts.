'use strict';
// ---------- Architecture v2: Map Realism v1 ----------
(function installMapRealism(global){
  const nrts=global.NRTS;
  if(!nrts) throw new Error('NRTS foundation runtime must load before map realism renderer.');

  function seeded(seed){
    let s=seed>>>0;
    return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
  }

  const rand=seeded(1805);
  const fields=[];
  for(let i=0;i<18;i++){
    const w=170+rand()*260,h=110+rand()*190;
    fields.push({
      x:120+rand()*(WORLD.width-240-w),y:130+rand()*(WORLD.height-260-h),w,h,
      angle:(rand()-.5)*.13,tone:i%3,rows:7+Math.floor(rand()*7)
    });
  }

  function drawGround(){
    ctx.fillStyle='#687b52';ctx.fillRect(0,0,WORLD.width,WORLD.height);
    const local=seeded(1815);
    for(let i=0;i<900;i++){
      const x=local()*WORLD.width,y=local()*WORLD.height,r=.7+local()*2.1;
      ctx.fillStyle=local()>.5?'rgba(96,117,72,.18)':'rgba(188,178,126,.07)';
      ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
    }
  }

  function drawFields(){
    fields.forEach((f,index)=>{
      ctx.save();ctx.translate(f.x+f.w/2,f.y+f.h/2);ctx.rotate(f.angle);
      ctx.fillStyle=f.tone===0?'rgba(154,145,88,.20)':f.tone===1?'rgba(130,126,78,.17)':'rgba(175,157,101,.16)';
      ctx.fillRect(-f.w/2,-f.h/2,f.w,f.h);
      ctx.strokeStyle='rgba(96,82,53,.30)';ctx.lineWidth=2;
      ctx.strokeRect(-f.w/2,-f.h/2,f.w,f.h);
      ctx.strokeStyle='rgba(88,75,45,.18)';ctx.lineWidth=1;
      const spacing=f.h/f.rows;
      for(let y=-f.h/2+spacing;y<f.h/2;y+=spacing){
        ctx.beginPath();ctx.moveTo(-f.w/2+5,y);ctx.lineTo(f.w/2-5,y);ctx.stroke();
      }
      if(index%3===0){
        ctx.strokeStyle='rgba(75,70,43,.35)';ctx.lineWidth=2.5;
        ctx.beginPath();ctx.moveTo(-f.w/2,-f.h/2);ctx.lineTo(f.w/2,-f.h/2);ctx.stroke();
      }
      ctx.restore();
    });
  }

  function drawHillRealistic(h,index){
    ctx.save();
    for(let ring=0;ring<4;ring++){
      const scale=1-ring*.16;
      ctx.fillStyle=ring===0?'rgba(154,145,92,.11)':'rgba(189,176,117,.035)';
      ctx.strokeStyle='rgba(213,197,145,.16)';ctx.lineWidth=2;
      ctx.beginPath();ctx.ellipse(h.x,h.y,h.rx*scale,h.ry*scale,0,0,Math.PI*2);ctx.fill();ctx.stroke();
    }
    ctx.strokeStyle='rgba(96,83,54,.10)';ctx.lineWidth=6;
    ctx.beginPath();ctx.ellipse(h.x+6,h.y+7,h.rx*.57,h.ry*.57,0,0,Math.PI*2);ctx.stroke();
    ctx.restore();
  }

  function drawWoodRealistic(w,index){
    const local=seeded(9000+index*97);
    ctx.save();
    ctx.fillStyle='rgba(39,67,38,.18)';
    ctx.beginPath();
    const cx=w.x+w.w/2,cy=w.y+w.h/2,rx=w.w/2,ry=w.h/2;
    for(let i=0;i<22;i++){
      const a=i/22*Math.PI*2;
      const jitter=.83+local()*.22;
      const x=cx+Math.cos(a)*rx*jitter,y=cy+Math.sin(a)*ry*jitter;
      if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }
    ctx.closePath();ctx.fill();
    const count=Math.max(12,Math.floor(w.w*w.h/2800));
    for(let i=0;i<count;i++){
      const x=w.x+local()*w.w,y=w.y+local()*w.h;
      const canopy=5+local()*8;
      ctx.fillStyle='rgba(29,65,34,.72)';ctx.beginPath();ctx.arc(x,y,canopy,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='rgba(63,96,52,.50)';ctx.beginPath();ctx.arc(x-2,y-2,canopy*.58,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }

  function roadTrace(road){
    const pts=road.points;ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);
    for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);
  }

  function drawRoadRealistic(road){
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
    ctx.strokeStyle='rgba(75,63,45,.35)';ctx.lineWidth=road.width+12;roadTrace(road);ctx.stroke();
    ctx.strokeStyle=road.roadClass==='chaussee'?'rgba(194,177,137,.90)':road.roadClass==='secondary'?'rgba(166,139,97,.82)':'rgba(139,104,68,.72)';
    ctx.lineWidth=road.width;roadTrace(road);ctx.stroke();
    const rutOffset=Math.max(4,road.width*.18);
    ctx.strokeStyle='rgba(100,76,49,.22)';ctx.lineWidth=2;ctx.setLineDash(road.roadClass==='track'?[18,9]:[]);
    ctx.save();ctx.translate(0,-rutOffset);roadTrace(road);ctx.stroke();ctx.restore();
    ctx.save();ctx.translate(0,rutOffset);roadTrace(road);ctx.stroke();ctx.restore();
    ctx.setLineDash([]);
    ctx.strokeStyle='rgba(229,216,177,.17)';ctx.lineWidth=1.2;roadTrace(road);ctx.stroke();
    ctx.restore();
  }

  drawTerrain=function drawTerrainMapRealismV1(){
    drawGround();
    drawFields();
    if(typeof TERRAIN_HILLS!=='undefined')TERRAIN_HILLS.forEach(drawHillRealistic);
    if(typeof TERRAIN_WOODS!=='undefined')TERRAIN_WOODS.forEach(drawWoodRealistic);
    for(const cls of ['track','secondary','chaussee']){
      for(const road of ROAD_NETWORK_V066)if(road.roadClass===cls)drawRoadRealistic(road);
    }
    if(typeof drawHamletsV066==='function')drawHamletsV066();
  };

  const api=Object.freeze({
    version:'map-realism-v1',
    fieldCount:fields.length,
    preservesNavigation:true,
    roadCount:ROAD_NETWORK_V066.length
  });
  nrts.subsystems.register('map-renderer',api,{
    phase:'architecture-v2',legacyBridge:false,
    responsibility:'deterministic battlefield terrain, fields, woods, hills and road surface visuals without navigation changes'
  });
  global.__MAP_REALISM_V1__=api;
})(window);
