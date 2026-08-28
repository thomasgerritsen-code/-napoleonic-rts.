'use strict';
// ---------- v0.6.7 river / crossing debug hooks ----------
if(window.__RTS_DEBUG__){
  const formationStateV066ForV067=window.__RTS_DEBUG__.formationState?.bind(window.__RTS_DEBUG__);
  if(formationStateV066ForV067){
    window.__RTS_DEBUG__.formationState=function formationStateV067(id){
      const base=formationStateV066ForV067(id);if(!base)return null;
      const reg=getRegiment(id)||regiments.find(r=>r.id===id),m=reg?.marchV063;
      const anchor=m?{x:m.anchorX,y:m.anchorY}:base.centroid;
      return{...base,anchorWater:waterAtV067(anchor.x,anchor.y),anchorCrossing:crossingAtV067(anchor.x,anchor.y)?.name||null,routeCrossings:(reg?.routeCrossingsV067||[]).map(c=>({...c}))};
    };
  }
  window.__RTS_DEBUG__.waterSystemV067=()=>({
    name:RIVER_NAME_V067,
    visualWidth:RIVER_VISUAL_WIDTH_V067,
    navigationHalfWidth:RIVER_NAV_HALF_WIDTH_V067,
    river:RIVER_POINTS_V067.map(p=>({...p})),
    crossings:WATER_CROSSINGS_V067.map(c=>({...c})),
    bridges:WATER_CROSSINGS_V067.filter(c=>c.type==='bridge').length,
    fords:WATER_CROSSINGS_V067.filter(c=>c.type==='ford').length
  });
  window.__RTS_DEBUG__.waterInfoV067=(x,y)=>({
    water:waterAtV067(x,y),
    riverDistance:riverHitV067(x,y)?.distance??null,
    bankSide:bankSideV067(x,y),
    crossing:crossingAtV067(x,y)?.name||null
  });
  window.__RTS_DEBUG__.crossingSpeedV067=(kind='infantry',id='pont-chaussee')=>{
    const c=WATER_CROSSINGS_V067.find(x=>x.id===id);return c?crossingSpeedCapV067(kind,c):null;
  };
  window.__RTS_DEBUG__.routeWaterAuditV067=id=>{
    const reg=getRegiment(id)||regiments.find(r=>r.id===id);if(!reg)return null;
    const members=regimentMembers(reg),start=reg.marchV063?{x:reg.marchV063.anchorX,y:reg.marchV063.anchorY}:members.length?centroid(members):{x:reg.targetX,y:reg.targetY};
    let previous=start,blockedSegments=0;const crossings=new Map();
    for(const p of reg.path||[]){const hit=segmentWaterCrossingV067(previous.x,previous.y,p.x,p.y);if(hit?.blocked)blockedSegments++;if(hit?.crossing)crossings.set(hit.crossing.id,hit.crossing);previous=p;}
    return{safe:blockedSegments===0,blockedSegments,crossings:[...crossings.values()].map(c=>({id:c.id,name:c.name,type:c.type}))};
  };
  window.__RTS_DEBUG__.looseCrossingPlanV067=(x,y,tx,ty,type='infantry')=>{
    const c=nearestCrossingV067(x,y,tx,ty,type==='cavalry'?'cavalry':type==='artillery'?'artillery':'infantry');
    return{crossing:{id:c.id,name:c.name,type:c.type},entry:crossingBankPointV067(c,bankSideV067(x,y)),exit:crossingBankPointV067(c,bankSideV067(tx,ty))};
  };
}
