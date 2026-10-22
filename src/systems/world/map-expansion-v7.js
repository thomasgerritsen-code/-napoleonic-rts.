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
  // v283: imperial post roads + departmental connectors + genuine village tracks.
  // Unlike disconnected, decorative polylines, intersections are EXACT shared
  // coordinates. The existing road graph and 4-wide column solver consume these
  // same authoritative segments; bridge passages alone cross the river.
  //
  // Routes impériales and routes départementales reflect the 1811 hierarchy.
  // The battlefield geography is fictional, not a historical map reproduction.
  const historicRoad=(id,name,roadClass,width,coords)=>Object.freeze({
    id:'imperial-'+id,name,roadClass,width,
    points:Object.freeze(coords.map(([x,y])=>Object.freeze({x,y})))
  });
  const strategicRoads=Object.freeze([
    // Two long bankside post roads join every crossing, north to south.
    historicRoad('western-post','Route impériale de l’Ouest','chaussee',66,[
      [650,60],[710,450],[740,1000],[950,1430],[970,1920],
      [1100,2540],[1350,3050],[1510,3900],[1740,4580],[1700,4920]]),
    historicRoad('eastern-post','Route impériale de l’Est','chaussee',68,[
      [2650,80],[2500,460],[2400,900],[1950,900],[2300,900],[2350,1180],[2350,1430],[2060,1430],[2150,1920],[2360,2540],
      [2670,3050],[2900,3900],[3140,4580],[3300,4920]]),

    // A separate legally navigable segment crosses each bridge or ford.
    // Exact end nodes connect the two riverside post roads in the route graph.
    historicRoad('chaussee-bridge','Chaussée du Grand Pont','chaussee',70,[
      [740,1000],[1150,900],[1350,900],[1500,900],[1650,900],[1950,900]]),
    historicRoad('crete-bridge','Route départementale de la Crête','secondary',46,[
      [950,1430],[1280,1430],[1510,1430],[1740,1430],[2060,1430]]),
    historicRoad('fermes-bridge','Route des Fermes','secondary',46,[
      [1100,2540],[1400,2540],[1645,2540],[1900,2540],[2360,2540]]),
    historicRoad('grands-bois-bridge','Chaussée des Grands Bois','chaussee',64,[
      [1350,3050],[1650,3050],[1900,3050],[2150,3050],[2670,3050]]),
    historicRoad('southern-bridge','Grande Route du Midi','chaussee',68,[
      [1740,4580],[2000,4580],[2250,4580],[2500,4580],[3140,4580]]),

    // Postal roads continue all the way across the eastern province and to
    // the border. Camp spurs stop outside actual building footprints.
    historicRoad('paris-est-poste','Grande Route des Postes de l’Est','chaussee',72,[
      [1950,900],[3000,900],[4100,1100],[5250,1630],[6150,2550],
      [6740,3450],[7160,4100],[7380,4190],[7900,4480]]),
    historicRoad('northern-post','Chaussée des Marchands du Nord','chaussee',64,[
      [3000,900],[3900,600],[5000,320],[6500,100],[7900,80]]),
    historicRoad('southern-post','Route impériale du Midi','chaussee',68,[
      [3140,4580],[5050,4500],[6200,4400],[7380,4190]]),
    historicRoad('frontier-post','Route de la Frontière','secondary',44,[
      [7900,80],[7820,1000],[7750,2000],[7810,3000],[7780,3900],
      [7900,4480],[7950,4850]]),

    // Regional routes follow valleys and connect real junctions, not blind ends.
    historicRoad('eastern-market','Route départementale du Marché','secondary',46,[
      [2060,1430],[3000,1470],[4100,1100]]),
    historicRoad('eastern-grain','Route des Charretiers','secondary',44,[
      [2150,1920],[3300,1960],[4400,2500],[6150,2550]]),
    historicRoad('eastern-south-valley','Route de la Vallée Orientale','secondary',48,[
      [2360,2540],[3800,3000],[5000,3400],[6740,3450]]),
    historicRoad('eastern-far-post','Route des Relais du Sud','secondary',48,[
      [2670,3050],[3880,3670],[5050,4500]]),
    historicRoad('western-northern-plateau','Route du Plateau de l’Ouest','secondary',44,[
      [250,80],[280,380],[490,700],[740,1000]]),
    historicRoad('western-hill-lane','Chemin de la Colline','secondary',42,[
      [950,1430],[400,1590],[400,2180],[970,1920]]),
    historicRoad('western-south-detour','Route Départementale des Bois','secondary',44,[
      [1100,2540],[400,2700],[420,3650],[1510,3900]]),
    historicRoad('western-valley','Chemin de la Vallée','secondary',42,[
      [1350,3050],[890,3190],[550,3700],[1510,3900]]),

    // Dirt tracks end at real farmland or border settlements, not mid-field
    // halfway along the long main road.
    historicRoad('camp-francais','Chemin du Camp français','track',26,[
      [740,1000],[625,1010],[640,1120]]),
    historicRoad('camp-britannique','Chemin du Camp britannique','track',26,[
      [7380,4190],[7240,4290]]),
    historicRoad('rural-verger','Chemin vicinal du Verger','track',26,[
      [3000,1470],[3450,1530],[3650,1750]]),
    historicRoad('rural-moulin','Chemin vicinal du Moulin','track',24,[
      [400,2180],[220,2400]]),
    historicRoad('rural-forest','Chemin forestier','track',24,[
      [5000,3400],[5420,3580],[5550,3900]])
  ]);

  const roads=Object.freeze([
    ...ROAD_NETWORK_V066.filter(road=>!omitted.has(road.id)),
    // The open map (iso view) also omits some of the strategic roads.
    ...strategicRoads.filter(road=>!omitted.has(road.id))
  ]);
  const postalRelays=Object.freeze([
    {name:'Relais de la Chaussée',x:1150,y:900},
    {name:'Marché de l’Est',x:3000,y:900},
    {name:'Saint-Pierre-des-Bois',x:2060,y:1430},
    {name:'Relais de la Colline',x:2150,y:1920},
    {name:'Bourg des Fermes',x:2360,y:2540},
    {name:'Relais des Grands Bois',x:2670,y:3050},
    {name:'Village du Val',x:5000,y:3400},
    {name:'Les Postes du Midi',x:6200,y:4400}
  ].map(h=>Object.freeze(h)));
  const hamlets=Object.freeze([...ROAD_HAMLETS_V066,...postalRelays].filter(hamlet=>{
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
    historicalRoadCount:strategicRoads.length,
    roadSystemVersion:'283',
    relayVillageCount:postalRelays.length,
    historicalHierarchy:true,
    crossMapConnectivity:true,
    originalRoadCount:ROAD_NETWORK_V066.length,
    removedRoadCount:ROAD_NETWORK_V066.filter(road=>omitted.has(road.id)).length,
    omittedRoadIds:omittedIds,
    configDriven:true,
    sparserRoadNetwork:true,
    bridgeCoordinatesPreserved:true
  });
  global.__BATTLEFIELD_EXPANSION_V7__=api;
  nrts.subsystems.register('battlefield-expansion-v7',api,{
    phase:'architecture-v2',legacyBridge:false,
    responsibility:'continuous empire-period road hierarchy, bank-side postal routes and safe bridge links across whole battlefield'
  });
})(window);
