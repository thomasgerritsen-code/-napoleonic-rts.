'use strict';
// ---------- Napoleonic RTS v0.6.7: river barriers, bridges and fords ----------

const V067_VERSION = '0.6.7';
document.title = `Napoleonic RTS v${V067_VERSION}`;
const v067VersionBadge = document.querySelector('.version');
if (v067VersionBadge) v067VersionBadge.textContent = `v${V067_VERSION}`;

const RIVER_NAME_V067 = 'Ruisseau de la Campagne';
const RIVER_VISUAL_WIDTH_V067 = 58;
const RIVER_NAV_HALF_WIDTH_V067 = 72;
const RIVER_POINTS_V067 = Object.freeze([
  {x:1510,y:0},{x:1490,y:260},{x:1475,y:520},{x:1490,y:760},
  {x:1500,y:900},{x:1510,y:1065},{x:1420,y:1160},{x:1530,y:1280},
  {x:1580,y:1450},{x:1645,y:1700},{x:1665,y:1950},{x:1700,y:2200}
].map(p=>Object.freeze(p)));

const WATER_CROSSINGS_V067 = Object.freeze([
  Object.freeze({id:'pont-chaussee',name:'Pont de la Chaussée',type:'bridge',material:'stone',x:1500,y:900,angle:0,length:270,width:112}),
  Object.freeze({id:'pont-crete',name:'Pont de la Crête',type:'bridge',material:'wood',x:1510,y:1065,angle:-0.08,length:250,width:98}),
  Object.freeze({id:'gue-colline',name:'Gué de la Colline',type:'ford',material:'ford',x:1530,y:1280,angle:-0.52,length:310,width:154}),
  Object.freeze({id:'pont-fermes',name:'Pont des Fermes',type:'bridge',material:'wood',x:1645,y:1700,angle:-0.074,length:270,width:98})
]);

function riverHitV067(x,y){
  let best=null;
  for(let i=1;i<RIVER_POINTS_V067.length;i++){
    const hit=closestPointOnSegmentV066(x,y,RIVER_POINTS_V067[i-1],RIVER_POINTS_V067[i]);
    if(!best||hit.distance<best.distance) best={...hit,segmentIndex:i-1};
  }
  return best;
}
function crossingPassageContainsV067(c,x,y){
  const dx=x-c.x,dy=y-c.y,cos=Math.cos(c.angle),sin=Math.sin(c.angle);
  const along=dx*cos+dy*sin,perp=-dx*sin+dy*cos;
  return Math.abs(along)<=c.length/2&&Math.abs(perp)<=c.width/2;
}
function crossingAtV067(x,y){
  const raw=riverHitV067(x,y);
  if(!raw||raw.distance>RIVER_NAV_HALF_WIDTH_V067+28)return null;
  return WATER_CROSSINGS_V067.find(c=>crossingPassageContainsV067(c,x,y))||null;
}
function waterAtV067(x,y){
  const hit=riverHitV067(x,y);
  if(!hit||hit.distance>RIVER_NAV_HALF_WIDTH_V067)return false;
  return !WATER_CROSSINGS_V067.some(c=>crossingPassageContainsV067(c,x,y));
}
function riverCenterXAtYV067(y){
  const yy=Math.max(RIVER_POINTS_V067[0].y,Math.min(RIVER_POINTS_V067[RIVER_POINTS_V067.length-1].y,y));
  for(let i=1;i<RIVER_POINTS_V067.length;i++){
    const a=RIVER_POINTS_V067[i-1],b=RIVER_POINTS_V067[i];
    if(yy<a.y||yy>b.y)continue;
    const t=(yy-a.y)/Math.max(.0001,b.y-a.y);
    return a.x+(b.x-a.x)*t;
  }
  return RIVER_POINTS_V067[RIVER_POINTS_V067.length-1].x;
}
function bankSideV067(x,y){return x-riverCenterXAtYV067(y);}
function segmentWaterCrossingV067(ax,ay,bx,by){
  const distance=Math.hypot(bx-ax,by-ay),samples=Math.max(1,Math.ceil(distance/12));
  let touchesRiver=false,crossing=null,blocked=false;
  for(let i=0;i<=samples;i++){
    const t=i/samples,x=ax+(bx-ax)*t,y=ay+(by-ay)*t,raw=riverHitV067(x,y);
    if(!raw||raw.distance>RIVER_NAV_HALF_WIDTH_V067)continue;
    touchesRiver=true;
    const c=WATER_CROSSINGS_V067.find(item=>crossingPassageContainsV067(item,x,y));
    if(c)crossing=c;else blocked=true;
  }
  return touchesRiver?{crossing,blocked}:null;
}
function segmentCrossesBlockedWaterV067(ax,ay,bx,by){return !!segmentWaterCrossingV067(ax,ay,bx,by)?.blocked;}
function crossingDelayV067(c,kind='infantry'){
  if(!c)return 0;
  if(c.type==='ford')return kind==='artillery'?7.5:kind==='cavalry'?3.2:3.8;
  return kind==='artillery'?1.5:kind==='cavalry'?1.0:.8;
}
function crossingSpeedCapV067(kind='infantry',crossing){
  if(!crossing)return Infinity;
  if(crossing.type==='ford')return kind==='artillery'?12:kind==='cavalry'?36:28;
  return kind==='artillery'?18:kind==='cavalry'?52:38;
}
function nearestCrossingV067(x,y,tx,ty,kind='infantry'){
  let best=null;
  for(const c of WATER_CROSSINGS_V067){
    const distance=Math.hypot(c.x-x,c.y-y)+Math.hypot(tx-c.x,ty-c.y);
    const score=distance+crossingDelayV067(c,kind)*42;
    if(!best||score<best.score)best={crossing:c,score};
  }
  return best?.crossing||WATER_CROSSINGS_V067[0];
}
function crossingBankPointV067(c,side){
  const direction=side>=0?1:-1,reach=RIVER_NAV_HALF_WIDTH_V067+58;
  return{x:c.x+Math.cos(c.angle)*reach*direction,y:c.y+Math.sin(c.angle)*reach*direction};
}

// Make the river a true A* barrier. The old building blocker remains authoritative too.
const pathBlockedV066ForV067=pathBlockedV06;
pathBlockedV06=function pathBlockedV067(c){
  if(pathBlockedV066ForV067(c))return true;
  const p=pathCenterV06(c);
  return waterAtV067(p.x,p.y);
};

// Terrain reports water away from designated crossings, while bridges/fords retain their road terrain.
const terrainAtV066ForV067=terrainAtV06;
terrainAtV06=function terrainAtV067(x,y){return waterAtV067(x,y)?'water':terrainAtV066ForV067(x,y);};

const terrainSpeedMultiplierV066ForV067=terrainSpeedMultiplierV06;
terrainSpeedMultiplierV06=function terrainSpeedMultiplierV067(u){
  const c=crossingAtV067(u.x,u.y);
  if(c){
    if(c.type==='ford'){
      if(u.type==='artillery')return .46;
      if(u.type==='cavalry')return .62;
      if(u.type==='worker')return .68;
      return .72;
    }
    if(u.type==='artillery')return .82;
    if(u.type==='cavalry')return .90;
    if(u.type==='worker')return .90;
    return 1;
  }
  if(waterAtV067(u.x,u.y))return .18;
  return terrainSpeedMultiplierV066ForV067(u);
};

// Route-graph Dijkstra now rejects road edges that would cross the river anywhere except a bridge/ford.
roadGraphRouteV066=function roadGraphRouteV067(startNode,goalNode,kind){
  if(!startNode||!goalNode)return null;
  const dist=new Map([[startNode.key,0]]),previous=new Map(),open=new Set([startNode.key]);
  let iterations=0;
  while(open.size&&iterations++<5000){
    let current=null,currentCost=Infinity;
    for(const key of open){const d=dist.get(key)??Infinity;if(d<currentCost){current=key;currentCost=d;}}
    if(current===goalNode.key)break;
    open.delete(current);
    const node=ROAD_GRAPH_V066.get(current);if(!node)continue;
    for(const edge of node.edges){
      const target=ROAD_GRAPH_V066.get(edge.to);if(!target)continue;
      const crossing=segmentWaterCrossingV067(node.x,node.y,target.x,target.y);
      if(crossing?.blocked)continue;
      const travel=edge.distance/Math.max(1,roadSpeedV066(kind,edge.road))+crossingDelayV067(crossing?.crossing,kind);
      const tentative=currentCost+travel;
      if(tentative>=(dist.get(edge.to)??Infinity))continue;
      dist.set(edge.to,tentative);previous.set(edge.to,{from:current,edge,crossing:crossing?.crossing||null});open.add(edge.to);
    }
  }
  if(!dist.has(goalNode.key))return null;
  const steps=[];let key=goalNode.key;
  while(key!==startNode.key){
    const prev=previous.get(key);if(!prev)return null;
    const node=ROAD_GRAPH_V066.get(key);steps.push({x:node.x,y:node.y,road:prev.edge.road,crossing:prev.crossing});key=prev.from;
  }
  steps.reverse();
  return{points:steps.map(s=>({x:s.x,y:s.y})),roads:steps.map(s=>s.road),crossings:steps.map(s=>s.crossing).filter(Boolean),time:dist.get(goalNode.key)};
};

// Include bridge/ford delay in travel-time comparisons so a nearby ford is not always preferred.
const pathStatsV066ForV067=pathStatsV065;
pathStatsV065=function pathStatsV067(start,points,kind='infantry'){
  const stats=pathStatsV066ForV067(start,points,kind),seen=new Set();
  let previous={x:start.x,y:start.y},delay=0;
  for(const p of points||[]){
    const hit=segmentWaterCrossingV067(previous.x,previous.y,p.x,p.y),c=hit?.crossing;
    if(c&&!seen.has(c.id)){seen.add(c.id);delay+=crossingDelayV067(c,kind);}
    previous=p;
  }
  return{...stats,time:stats.time+delay,crossingDelay:delay,crossings:[...seen]};
};

const desiredGroupSpeedV066ForV067=desiredGroupSpeedV064;
desiredGroupSpeedV064=function desiredGroupSpeedV067(reg,march,roadMarch){
  const base=desiredGroupSpeedV066ForV067(reg,march,roadMarch),c=crossingAtV067(march.anchorX,march.anchorY);
  return c?Math.min(base,crossingSpeedCapV067(groupKindV06(reg),c)):base;
};

function routeCrossingsForPathV067(start,path){
  const used=new Map();let previous={x:start.x,y:start.y};
  for(const p of path||[]){
    const hit=segmentWaterCrossingV067(previous.x,previous.y,p.x,p.y);
    if(hit?.crossing)used.set(hit.crossing.id,hit.crossing);
    previous=p;
  }
  return[...used.values()].map(c=>({id:c.id,name:c.name,type:c.type,material:c.material}));
}

const orderGroupPathV066ForV067=orderGroupPathV06;
orderGroupPathV06=function orderGroupPathV067(reg,x,y,formation=reg.formation,finalFacing=null){
  const members=regimentMembers(reg),start=members.length?centroid(members):{x:reg.targetX||x,y:reg.targetY||y};
  orderGroupPathV066ForV067(reg,x,y,formation,finalFacing);
  if(!reg||reg.destroyed)return;
  reg.routeCrossingsV067=routeCrossingsForPathV067(start,reg.path||[]);
};

// Prevent group-anchor corner cutting across the water barrier.
const updateGroupPathsV066ForV067=updateGroupPathsV06;
updateGroupPathsV06=function updateGroupPathsV067(){
  const before=new Map();
  for(const reg of regiments){const m=reg.marchV063;if(m)before.set(reg.id,{x:m.anchorX,y:m.anchorY});}
  updateGroupPathsV066ForV067();
  for(const reg of regiments){
    const old=before.get(reg.id),m=reg.marchV063;if(!old||!m)continue;
    if(segmentCrossesBlockedWaterV067(old.x,old.y,m.anchorX,m.anchorY)){
      m.anchorX=old.x;m.anchorY=old.y;
      if(Number.isFinite(m.speedV064))m.speedV064*=.35;
    }
  }
};

function looseCrossingTargetV067(u,tx,ty){
  const currentSide=bankSideV067(u.x,u.y),targetSide=bankSideV067(tx,ty);
  if(currentSide*targetSide>=0||Math.abs(targetSide)<RIVER_NAV_HALF_WIDTH_V067*.35){u.waterCrossingIdV067=null;return{x:tx,y:ty,detour:false};}
  let crossing=WATER_CROSSINGS_V067.find(c=>c.id===u.waterCrossingIdV067);
  if(!crossing){crossing=nearestCrossingV067(u.x,u.y,tx,ty,u.type==='artillery'?'artillery':u.type==='cavalry'?'cavalry':'infantry');u.waterCrossingIdV067=crossing.id;}
  const entry=crossingBankPointV067(crossing,currentSide),exit=crossingBankPointV067(crossing,targetSide);
  const inPassage=crossingPassageContainsV067(crossing,u.x,u.y);
  if(!inPassage&&Math.hypot(u.x-entry.x,u.y-entry.y)>34)return{x:entry.x,y:entry.y,detour:true,crossing};
  return{x:exit.x,y:exit.y,detour:true,crossing};
}

// Loose soldiers/workers get a simple crossing detour; regiment members trust the formal group path.
const moveTowardV066ForV067=moveToward;
moveToward=function moveTowardV067(u,tx,ty,dt,speed=TYPES[u.type].speed){
  const reg=u.regimentId?getRegiment(u.regimentId):null;
  const target=reg?{x:tx,y:ty,detour:false}:looseCrossingTargetV067(u,tx,ty);
  const ox=u.x,oy=u.y,result=moveTowardV066ForV067(u,target.x,target.y,dt,speed);
  if(segmentCrossesBlockedWaterV067(ox,oy,u.x,u.y)){
    u.x=ox;u.y=oy;u.arrivedAtTarget=false;return false;
  }
  return target.detour?false:result;
};

// Clicking directly in deep water redirects the order to the nearest legal crossing.
const issueMoveWithFacingV066ForV067=issueMoveWithFacingV06;
issueMoveWithFacingV06=function issueMoveWithFacingV067(x,y,finalFacing=null){
  let adjusted=false,crossing=null;
  if(waterAtV067(x,y)){crossing=nearestCrossingV067(x,y,x,y,'infantry');x=crossing.x;y=crossing.y;adjusted=true;}
  issueMoveWithFacingV066ForV067(x,y,finalFacing);
  if(adjusted)statusEl.textContent=`Water blokkeert de positie; order verplaatst naar ${crossing.name}.`;
};

function drawRiverV067(){
  const trace=()=>{ctx.beginPath();ctx.moveTo(RIVER_POINTS_V067[0].x,RIVER_POINTS_V067[0].y);for(let i=1;i<RIVER_POINTS_V067.length;i++)ctx.lineTo(RIVER_POINTS_V067[i].x,RIVER_POINTS_V067[i].y);};
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
  ctx.strokeStyle='rgba(45,54,47,.55)';ctx.lineWidth=RIVER_VISUAL_WIDTH_V067+16;trace();ctx.stroke();
  ctx.strokeStyle='rgba(70,119,139,.86)';ctx.lineWidth=RIVER_VISUAL_WIDTH_V067;trace();ctx.stroke();
  ctx.strokeStyle='rgba(166,204,207,.33)';ctx.lineWidth=3;ctx.setLineDash([18,24]);trace();ctx.stroke();ctx.restore();
}
function drawCrossingsV067(){
  ctx.save();
  for(const c of WATER_CROSSINGS_V067){
    ctx.save();ctx.translate(c.x,c.y);ctx.rotate(c.angle);
    if(c.type==='ford'){
      ctx.fillStyle='rgba(173,151,111,.64)';ctx.beginPath();ctx.ellipse(0,0,c.length*.34,c.width*.28,0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='rgba(222,207,164,.62)';ctx.lineWidth=4;ctx.setLineDash([12,10]);ctx.beginPath();ctx.moveTo(-c.length*.38,0);ctx.lineTo(c.length*.38,0);ctx.stroke();
    }else{
      ctx.fillStyle=c.material==='stone'?'rgba(174,164,139,.96)':'rgba(142,104,65,.96)';ctx.fillRect(-c.length*.38,-c.width*.30,c.length*.76,c.width*.60);
      ctx.strokeStyle='rgba(70,58,44,.78)';ctx.lineWidth=4;ctx.strokeRect(-c.length*.38,-c.width*.30,c.length*.76,c.width*.60);
      ctx.strokeStyle='rgba(232,216,177,.34)';ctx.lineWidth=2;
      for(let x=-c.length*.32;x<c.length*.34;x+=22){ctx.beginPath();ctx.moveTo(x,-c.width*.27);ctx.lineTo(x,c.width*.27);ctx.stroke();}
    }
    ctx.restore();
    ctx.fillStyle='rgba(226,219,188,.78)';ctx.font=`${Math.max(9,10/camera.zoom)}px serif`;ctx.textAlign='center';ctx.fillText(c.name,c.x,c.y-38);
  }
  ctx.restore();ctx.textAlign='start';
}

drawTerrain=function drawTerrainV067(){
  ctx.fillStyle=COLORS.grass;ctx.fillRect(0,0,WORLD.width,WORLD.height);
  ctx.strokeStyle=COLORS.grid;ctx.lineWidth=1/camera.zoom;
  for(let x=0;x<WORLD.width;x+=100){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,WORLD.height);ctx.stroke();}
  for(let y=0;y<WORLD.height;y+=100){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(WORLD.width,y);ctx.stroke();}
  ctx.save();
  for(const w of TERRAIN_WOODS){ctx.fillStyle='rgba(37,67,38,.18)';ctx.fillRect(w.x,w.y,w.w,w.h);}
  for(const h of TERRAIN_HILLS){ctx.fillStyle='rgba(171,151,101,.17)';ctx.beginPath();ctx.ellipse(h.x,h.y,h.rx,h.ry,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(210,193,143,.24)';ctx.lineWidth=8;ctx.beginPath();ctx.ellipse(h.x,h.y,h.rx*.72,h.ry*.72,0,0,Math.PI*2);ctx.stroke();}
  ctx.restore();
  drawRiverV067();
  for(const cls of['track','secondary','chaussee'])for(const road of ROAD_NETWORK_V066)if(road.roadClass===cls)drawRoadPolylineV066(road);
  drawHamletsV066();drawCrossingsV067();
};

const drawMinimapV066ForV067=drawMinimap;
drawMinimap=function drawMinimapV067(){
  drawMinimapV066ForV067();miniCtx.save();miniCtx.lineCap='round';miniCtx.lineJoin='round';
  miniCtx.strokeStyle='rgba(92,151,174,.88)';miniCtx.lineWidth=2.1;
  for(let i=1;i<RIVER_POINTS_V067.length;i++){
    const a=RIVER_POINTS_V067[i-1],b=RIVER_POINTS_V067[i],mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
    if(typeof isExploredV06==='function'&&!isExploredV06(mx,my))continue;
    const ma=miniPoint(a.x,a.y),mb=miniPoint(b.x,b.y);miniCtx.beginPath();miniCtx.moveTo(ma.x,ma.y);miniCtx.lineTo(mb.x,mb.y);miniCtx.stroke();
  }
  for(const c of WATER_CROSSINGS_V067){if(typeof isExploredV06==='function'&&!isExploredV06(c.x,c.y))continue;const p=miniPoint(c.x,c.y);miniCtx.fillStyle=c.type==='ford'?'rgba(218,192,137,.95)':'rgba(236,221,177,.95)';miniCtx.fillRect(p.x-1.6,p.y-1.6,3.2,3.2);}
  const viewW=innerWidth/camera.zoom/WORLD.width*minimap.width,viewH=innerHeight/camera.zoom/WORLD.height*minimap.height,c=miniPoint(camera.x,camera.y);
  miniCtx.strokeStyle='#f3df83';miniCtx.lineWidth=1.4;miniCtx.strokeRect(c.x-viewW/2,c.y-viewH/2,viewW,viewH);miniCtx.restore();
};

const resetGameV066ForV067=resetGame;
resetGame=function resetGameV067(){resetGameV066ForV067();statusEl.textContent='v0.6.7: rivierbarrière actief — bruggen en voorden bepalen waar legers kunnen oversteken.';};
