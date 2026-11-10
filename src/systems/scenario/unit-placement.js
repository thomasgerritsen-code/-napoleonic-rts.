'use strict';
// Placement work runs at the opening or when training completes, never per frame.
(function installUnitPlacement(root){
  if(!root.NRTS_CONFIG?.balancedStart||root.__UNIT_PLACEMENT__)return;
  const houses=(root.VILLAGE_SCENERY_V4||root.__VILLAGE_SCENERY_V4_DATA__||[]).flatMap(v=>v.houses).map(h=>({x:h.x,y:h.y,c:Math.cos(h.angle||0),s:Math.sin(h.angle||0),hw:h.w*.8,hh:h.h*.8}));
  const woods=typeof TERRAIN_WOODS!=='undefined'?TERRAIN_WOODS:[];
  const radius=type=>Math.max(TYPES[type]?.radius||7,type==='officer'?9:0);
  function clear(p,type='infantry',{ignore=null,reserved=false,origin=null}={}){
    const r=radius(type),body=({worker:16,infantry:18,drummer:18,officer:38,cavalry:38,artillery:40})[type]||18,margin=body+24;
    if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<margin||p.y<margin||p.x>WORLD.width-margin||p.y>WORLD.height-margin||waterAtV067(p.x,p.y))return false;
    if(origin&&segmentCrossesBlockedWaterV067(origin.x,origin.y,p.x,p.y))return false;
    for(const w of woods)if(p.x>w.x-margin&&p.x<w.x+w.w+margin&&p.y>w.y-margin&&p.y<w.y+w.h+margin)return false;
    for(const h of houses){const dx=p.x-h.x,dy=p.y-h.y;if(Math.abs(dx*h.c+dy*h.s)<h.hw+margin&&Math.abs(-dx*h.s+dy*h.c)<h.hh+margin)return false;}
    for(const b of buildings)if(!b.dead&&Math.abs(p.x-b.x)<b.w/2+margin&&Math.abs(p.y-b.y)<b.h/2+margin)return false;
    for(const t of resources)if(t.type==='wood'&&!t.dead&&t.amount>0&&(t.x-p.x)**2+(t.y-p.y)**2<(body+38)**2)return false;
    for(const u of units){if(u===ignore||u.dead)continue;const gap=r+radius(u.type)+4;if((u.x-p.x)**2+(u.y-p.y)**2<gap*gap)return false;if(reserved&&Number.isFinite(u.targetX)&&(u.targetX-p.x)**2+(u.targetY-p.y)**2<gap*gap)return false;}
    return true;
  }
  function search(point,accept){
    if(accept(point))return{x:point.x,y:point.y};
    // Deterministic concentric candidates: no random-state changes between peers.
    for(let ring=1;ring<=40;ring++){
      const distance=ring*20,count=Math.max(16,Math.ceil(distance/16)*4);
      for(let i=0;i<count;i++){const angle=i/count*Math.PI*2,p={x:point.x+Math.cos(angle)*distance,y:point.y+Math.sin(angle)*distance};if(accept(p))return p;}
    }
    return null;
  }
  function nearest(point,type='infantry',options={}){return search(point,p=>clear(p,type,options));}
  function formation(home,layout){return search(home,p=>layout.every(slot=>clear({x:p.x+slot.dx,y:p.y+slot.dy},slot.type,{origin:home})));}
  const oldBuildings=updateBuildings;
  updateBuildings=function updateBuildingsWithClearExit(dt){
    const count=units.length,result=oldBuildings(dt);
    for(let i=count;i<units.length;i++){
      const u=units[i];if(u.dead)continue;
      const p=nearest(u,u.type,{ignore:u});
      if(p){u.x=p.x;u.y=p.y;}
      const target=nearest({x:u.targetX,y:u.targetY},u.type,{ignore:u,reserved:true,origin:u});
      // If no legal rally area exists, wait at the safe exit for a new order.
      u.targetX=target?.x??u.x;u.targetY=target?.y??u.y;
    }
    return result;
  };
  root.__UNIT_PLACEMENT__=Object.freeze({clear,nearest,formation});
})(window);
