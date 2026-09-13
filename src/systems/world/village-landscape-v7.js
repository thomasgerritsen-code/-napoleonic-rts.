'use strict';
// ---------- Village landscape v7.2: archetype character, lived-in microdetail and shared landmarks ----------
(function installVillageLandscapeV7(global){
  const nrts=global.NRTS;
  if(!nrts) throw new Error('NRTS foundation runtime must load before Village V7 landscape.');
  if(typeof global.drawVillageLandscapeV6!=='function') throw new Error('Village landscape v6 must load before v7.');

  const previous=global.drawVillageLandscapeV6;
  function hash01(seed){let x=(seed>>>0)||1;x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296;}
  function seedFor(village){let h=2166136261;const text=String(village?.name||'village');for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
  function roadAt(x,y){
    if(typeof roadGeometryV069!=='function') return null;
    const network=global.NRTS_ROAD_NETWORK_V7||(typeof ROAD_NETWORK_V066!=='undefined'?ROAD_NETWORK_V066:[]);
    let best=null;
    for(const road of network){const g=roadGeometryV069(road,x,y);if(g&&(!best||g.edgeClearance<best.edgeClearance))best=g;}
    return best;
  }
  function strokePath(ax,ay,bx,by,width,color,dash){ctx.save();ctx.strokeStyle=color;ctx.lineWidth=Math.max(width,width/camera.zoom);ctx.lineCap='round';if(dash)ctx.setLineDash(dash.map(v=>v/camera.zoom));ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke();ctx.restore();}
  function drawWell(x,y){
    const r=5.5;ctx.save();ctx.fillStyle='rgba(94,92,79,.72)';ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.fillStyle='rgba(64,68,67,.74)';ctx.beginPath();ctx.arc(x,y,r*.52,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(197,187,155,.45)';ctx.lineWidth=Math.max(.7,1/camera.zoom);ctx.stroke();ctx.restore();
  }
  function drawCommonTree(x,y,seed){
    const r=7+hash01(seed^0x77)*3;ctx.save();ctx.fillStyle='rgba(66,83,43,.28)';ctx.beginPath();ctx.arc(x,y,r+2,0,Math.PI*2);ctx.fill();ctx.fillStyle='rgba(43,76,40,.62)';ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.fillStyle='rgba(54,43,30,.55)';ctx.fillRect(x-.8,y-.8,1.6,1.6);ctx.restore();
  }
  function drawBench(x,y,angle){
    ctx.save();ctx.translate(x,y);ctx.rotate(angle||0);ctx.fillStyle='rgba(91,66,43,.52)';ctx.fillRect(-6,-1.3,12,2.6);ctx.fillRect(-4.5,-3.2,1.2,2.2);ctx.fillRect(3.3,-3.2,1.2,2.2);ctx.restore();
  }
  function drawHaystack(x,y,scale){
    const s=scale||1;ctx.save();ctx.fillStyle='rgba(165,137,72,.34)';ctx.beginPath();ctx.arc(x,y,4.2*s,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(126,95,47,.28)';ctx.lineWidth=Math.max(.6,.8/camera.zoom);ctx.beginPath();ctx.arc(x,y,3.1*s,0,Math.PI*2);ctx.stroke();ctx.restore();
  }
  function drawMilestone(x,y){
    ctx.save();ctx.fillStyle='rgba(123,116,101,.62)';ctx.fillRect(x-1.6,y-3.2,3.2,6.4);ctx.fillStyle='rgba(180,171,149,.35)';ctx.fillRect(x-1.1,y-2.7,2.2,1.2);ctx.restore();
  }
  function drawGreen(village,seed){
    const r=22+hash01(seed^0x31)*11;ctx.save();ctx.fillStyle='rgba(103,126,75,.15)';ctx.beginPath();ctx.ellipse(village.x,village.y,r*1.35,r,.2,0,Math.PI*2);ctx.fill();ctx.restore();
    strokePath(village.x-r*1.12,village.y+2,village.x+r*1.08,village.y-3,2.4,'rgba(156,137,96,.17)');
    strokePath(village.x-3,village.y-r*.78,village.x+4,village.y+r*.78,2.0,'rgba(156,137,96,.14)');
    drawWell(village.x+7,village.y-5);drawCommonTree(village.x-r*.45,village.y+r*.12,seed);
    drawBench(village.x+r*.48,village.y+r*.30,-.18);
  }
  function drawRibbonEdges(village,seed){
    const road=roadAt(village.x,village.y);if(!road)return;
    const span=150;for(const side of[-1,1]){
      const off=road.road.width/2+18;
      const ax=village.x-road.tx*span-road.ty*side*off,ay=village.y-road.ty*span+road.tx*side*off;
      const bx=village.x+road.tx*span-road.ty*side*off,by=village.y+road.ty*span+road.tx*side*off;
      strokePath(ax,ay,bx,by,2.2,'rgba(48,79,43,.34)',[12,5]);
      const ditchOff=off+7;strokePath(village.x-road.tx*span-road.ty*side*ditchOff,village.y-road.ty*span+road.tx*side*ditchOff,village.x+road.tx*span-road.ty*side*ditchOff,village.y+road.ty*span+road.tx*side*ditchOff,1.1,'rgba(72,96,73,.16)');
      for(let i=-2;i<=2;i++){const t=i*42+hash01(seed^(side*73+i*191))*8;const ox=village.x+road.tx*t-road.ty*side*(off+10);const oy=village.y+road.ty*t+road.tx*side*(off+10);drawCommonTree(ox,oy,seed^(i*631+side*17));}
    }
  }
  function drawCrossroadsWear(village,seed){
    const road=roadAt(village.x,village.y);if(!road)return;
    const nx=-road.ty,ny=road.tx;
    ctx.save();ctx.fillStyle='rgba(126,101,67,.09)';ctx.beginPath();ctx.ellipse(village.x,village.y,29,19,-Math.atan2(road.ty,road.tx),0,Math.PI*2);ctx.fill();ctx.restore();
    for(const side of[-1,1]) strokePath(village.x+nx*side*12-road.tx*34,village.y+ny*side*12-road.ty*34,village.x+nx*side*12+road.tx*34,village.y+ny*side*12+road.ty*34,2.8,'rgba(111,88,54,.18)');
    const side=hash01(seed^0x441)>.5?1:-1;drawMilestone(village.x+road.tx*31+nx*side*18,village.y+road.ty*31+ny*side*18);
  }
  function drawAgrarianPaddocks(village,seed){
    const houses=(village.houses||[]).filter(h=>h.zone==='farm-edge');
    for(let i=0;i<houses.length;i+=2){const h=houses[i];const s=seed^(i*977+0x51);ctx.save();ctx.translate(h.x,h.y);ctx.rotate(h.angle||0);const w=Math.max(58,h.w*1.7),d=Math.max(32,h.h*1.8);ctx.strokeStyle='rgba(76,91,50,.30)';ctx.lineWidth=Math.max(.7,1/camera.zoom);ctx.setLineDash([7/camera.zoom,5/camera.zoom]);ctx.strokeRect(-w/2,-d/2,w,d);ctx.setLineDash([]);if(hash01(s)>.35){ctx.strokeStyle='rgba(126,111,70,.14)';ctx.lineWidth=Math.max(.55,.8/camera.zoom);for(let fy=-d*.32;fy<=d*.32;fy+=7){ctx.beginPath();ctx.moveTo(-w*.38,fy);ctx.lineTo(w*.38,fy);ctx.stroke();}}ctx.restore();if(hash01(s^0x19)>.25)drawHaystack(h.x+Math.cos(h.angle||0)*w*.34,h.y+Math.sin(h.angle||0)*w*.34,.85+hash01(s^0x28)*.45);}
  }
  function drawWoodlandEdge(village,seed){
    for(let i=0;i<16;i++){const a=hash01(seed^(i*149+0x90))*Math.PI*2;const d=114+hash01(seed^(i*173+0x91))*54;const x=village.x+Math.cos(a)*d,y=village.y+Math.sin(a)*d;const r=3.8+hash01(seed^(i*197+0x92))*4.2;ctx.fillStyle='rgba(35,66,38,.46)';ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();if(i%3===0){ctx.fillStyle='rgba(68,48,31,.35)';ctx.fillRect(x-.6,y-.6,1.2,1.2);}if(i%2===0){ctx.fillStyle='rgba(58,89,45,.18)';for(let j=0;j<3;j++){const ox=(hash01(seed^(i*311+j*17))-.5)*14,oy=(hash01(seed^(i*353+j*19))-.5)*14;ctx.beginPath();ctx.arc(x+ox,y+oy,1.8,0,Math.PI*2);ctx.fill();}}}
  }
  function drawHouseGateHints(village){
    for(const h of village.houses||[]){if(!Number.isFinite(h.accessX)||!Number.isFinite(h.accessY))continue;const dx=h.accessX-h.x,dy=h.accessY-h.y,d=Math.hypot(dx,dy)||1;const start=Math.min(18,d*.35);const important=h.kind==='inn'||h.kind==='chapel';strokePath(h.x+dx/d*start,h.y+dy/d*start,h.accessX,h.accessY,important?3.4:2.1,important?'rgba(149,126,83,.29)':'rgba(149,126,83,.22)');if(important){const nx=-dy/d,ny=dx/d;ctx.save();ctx.fillStyle='rgba(81,68,47,.40)';for(const side of[-1,1])ctx.fillRect(h.accessX+nx*side*3-1,h.accessY+ny*side*3-1,2,2);ctx.restore();}}
  }

  function drawVillageLandscapeV7(village){
    previous(village);
    const seed=seedFor(village);
    const type=village?.archetype||'crossroads';
    if(type==='parish-centre') drawGreen(village,seed);
    else if(type==='ribbon') drawRibbonEdges(village,seed);
    else if(type==='agrarian') drawAgrarianPaddocks(village,seed);
    else if(type==='woodland') drawWoodlandEdge(village,seed);
    else drawCrossroadsWear(village,seed);
    drawHouseGateHints(village);
  }

  const api=Object.freeze({version:'village-landscape-v7.2',base:'village-landscape-v6',archetypeLandmarks:true,roadsideEdges:true,sharedWell:true,paddocks:true,woodlandEdge:true,accessGateHints:true,commonFootpaths:true,commonTree:true,ribbonDitches:true,paddockFurrows:true,crossroadsWear:true,importantGateposts:true,parishBench:true,ribbonOrchardTrees:true,agrarianHaystacks:true,woodlandUndergrowth:true,crossroadsMilestone:true,navigationUnchanged:true});
  global.drawVillageLandscapeV7=drawVillageLandscapeV7;
  global.__VILLAGE_LANDSCAPE_V7__=api;
  nrts.subsystems.register('village-landscape-v7',api,{phase:'architecture-v2',legacyBridge:false,responsibility:'archetype-specific village character, lived-in microdetail and roadside transition without navigation changes'});
})(window);