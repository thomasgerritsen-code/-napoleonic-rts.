'use strict';
// ---------- Battlefield V7: larger world with a sparser strategic road network ----------
(function installBattlefieldExpansionV7(global) {
  const nrts=global.NRTS;
  if (!nrts) throw new Error('NRTS foundation runtime must load before Battlefield V7 expansion.');
  if (typeof ROAD_NETWORK_V066==='undefined' || typeof ROAD_HAMLETS_V066==='undefined') {
    throw new Error('v0.6.6 roads must load before Battlefield V7 expansion.');
  }

  const worldConfig=global.NRTS_CONFIG?.world;
  if (!worldConfig) throw new Error('Central world config must load before Battlefield V7 expansion.');
  const targetWorld=worldConfig.battlefield;
  WORLD.width=Math.max(WORLD.width,targetWorld.width);
  WORLD.height=Math.max(WORLD.height,targetWorld.height);

  // Keep the roads that carry strategic traffic or anchor settlements. Removing the close,
  // mostly decorative parallel routes creates wider open fields without moving bridge mouths.
  const omittedIds=worldConfig.roads.omittedIds;
  const omitted=new Set(omittedIds);
  const roads=Object.freeze(ROAD_NETWORK_V066.filter(road=>!omitted.has(road.id)));
  const hamlets=Object.freeze(ROAD_HAMLETS_V066.filter(hamlet=>{
    for(const road of roads){
      for(let i=1;i<road.points.length;i++){
        if(closestPointOnSegmentV066(hamlet.x,hamlet.y,road.points[i-1],road.points[i]).distance<=road.width/2+30) return true;
      }
    }
    return false;
  }));

  global.NRTS_ROAD_NETWORK_V7=roads;
  global.NRTS_ROAD_HAMLETS_V7=hamlets;

  function roadNetworkAtV7(x,y){
    let best=null;
    for(const road of roads){
      for(let i=1;i<road.points.length;i++){
        const hit=closestPointOnSegmentV066(x,y,road.points[i-1],road.points[i]);
        if(hit.distance>road.width/2) continue;
        const priority=ROAD_CLASS_PRIORITY_V066[road.roadClass]||0;
        const score=hit.distance/Math.max(1,road.width/2)-priority*.08;
        if(!best||score<best.score) best={...hit,road,segmentIndex:i-1,score};
      }
    }
    return best;
  }
  roadNetworkAtV066=roadNetworkAtV7;

  nearestStrategicRoadPointV066=function nearestStrategicRoadPointV7(point,kind='infantry'){
    const already=roadNetworkAtV7(point.x,point.y);
    if(already) return {x:point.x,y:point.y,road:already.road,distance:0};
    let best=null;
    for(const road of roads){
      const speed=roadSpeedV066(kind,road);
      for(let i=1;i<road.points.length;i++){
        const hit=closestPointOnSegmentV066(point.x,point.y,road.points[i-1],road.points[i]);
        const score=hit.distance/Math.max(1,speed);
        if(!best||score<best.score) best={x:hit.x,y:hit.y,road,distance:hit.distance,score};
      }
    }
    return best||{x:point.x,y:point.y,road:null,distance:0};
  };

  function drawHamletsV7(){
    ctx.save();
    for(const h of hamlets){
      ctx.fillStyle='rgba(92,70,48,.80)';
      ctx.fillRect(h.x-17,h.y-13,12,10);
      ctx.fillRect(h.x+4,h.y-9,14,11);
      ctx.fillRect(h.x-3,h.y+5,11,9);
      ctx.fillStyle='rgba(226,210,170,.62)';
      ctx.font=`${Math.max(9,11/camera.zoom)}px serif`;
      ctx.textAlign='center';
      ctx.fillText(h.name,h.x,h.y-22);
    }
    ctx.restore();
    ctx.textAlign='start';
  }

  drawTerrain=function drawTerrainBattlefieldV7(){
    ctx.fillStyle=COLORS.grass;
    ctx.fillRect(0,0,WORLD.width,WORLD.height);
    ctx.strokeStyle=COLORS.grid;
    ctx.lineWidth=1/camera.zoom;
    for(let x=0;x<WORLD.width;x+=100){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,WORLD.height);ctx.stroke();}
    for(let y=0;y<WORLD.height;y+=100){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(WORLD.width,y);ctx.stroke();}
    ctx.save();
    for(const w of TERRAIN_WOODS){ctx.fillStyle='rgba(37,67,38,.18)';ctx.fillRect(w.x,w.y,w.w,w.h);}
    for(const h of TERRAIN_HILLS){
      ctx.fillStyle='rgba(171,151,101,.17)';ctx.beginPath();ctx.ellipse(h.x,h.y,h.rx,h.ry,0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='rgba(210,193,143,.24)';ctx.lineWidth=8;ctx.beginPath();ctx.ellipse(h.x,h.y,h.rx*.72,h.ry*.72,0,0,Math.PI*2);ctx.stroke();
    }
    ctx.restore();
    for(const cls of ['track','secondary','chaussee']) for(const road of roads) if(road.roadClass===cls) drawRoadPolylineV066(road);
    drawHamletsV7();
  };

  if(typeof drawMinimapV065ForV066==='function'){
    drawMinimap=function drawMinimapBattlefieldV7(){
      drawMinimapV065ForV066();
      miniCtx.save();miniCtx.lineCap='round';miniCtx.lineJoin='round';
      for(const road of roads){
        miniCtx.strokeStyle=road.roadClass==='chaussee'?'rgba(224,207,163,.72)':road.roadClass==='secondary'?'rgba(188,153,103,.55)':'rgba(159,118,73,.42)';
        miniCtx.lineWidth=road.roadClass==='chaussee'?1.7:road.roadClass==='secondary'?1.1:.7;
        for(let i=1;i<road.points.length;i++){
          const a=road.points[i-1],b=road.points[i],mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
          if(typeof isExploredV06==='function'&&!isExploredV06(mx,my)) continue;
          const ma=miniPoint(a.x,a.y),mb=miniPoint(b.x,b.y);
          miniCtx.beginPath();miniCtx.moveTo(ma.x,ma.y);miniCtx.lineTo(mb.x,mb.y);miniCtx.stroke();
        }
      }
      const viewW=innerWidth/camera.zoom/WORLD.width*minimap.width;
      const viewH=innerHeight/camera.zoom/WORLD.height*minimap.height;
      const c=miniPoint(camera.x,camera.y);
      miniCtx.strokeStyle='#f3df83';miniCtx.lineWidth=1.4;
      miniCtx.strokeRect(c.x-viewW/2,c.y-viewH/2,viewW,viewH);
      miniCtx.restore();
    };
  }

  const api=Object.freeze({
    version:'battlefield-expansion-v7',
    width:WORLD.width,
    height:WORLD.height,
    roadCount:roads.length,
    originalRoadCount:ROAD_NETWORK_V066.length,
    removedRoadCount:ROAD_NETWORK_V066.length-roads.length,
    omittedRoadIds:omittedIds,
    configDriven:true,
    sparserRoadNetwork:true,
    bridgeCoordinatesPreserved:true
  });
  global.__BATTLEFIELD_EXPANSION_V7__=api;
  nrts.subsystems.register('battlefield-expansion-v7',api,{
    phase:'architecture-v2',legacyBridge:false,
    responsibility:'increase playable battlefield area and reduce road density while preserving strategic junction and bridge coordinates'
  });
})(window);
