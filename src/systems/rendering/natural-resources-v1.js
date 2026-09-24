'use strict';
// ---------- Architecture v2.1: top-down natural resource renderer ----------
(function installNaturalResourcesV1(global){
  const nrts=global.NRTS;
  if(!nrts) throw new Error('NRTS foundation runtime must load before natural resources renderer.');
  const cfg=global.NRTS_CONFIG?.world?.vegetation || {};
  let foodDraws=0;
  let localVillageBerryDraws=0;
  let localOverlayFrames=0;

  function rand01(seed){
    let x=(seed>>>0)||1;x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296;
  }
  function seedFor(r,salt=0){return(((r.id||1)*2654435761)^((Math.round(r.x)*73856093)>>>0)^((Math.round(r.y)*19349663)>>>0)^salt)>>>0;}
  function berryScale(r){return r?.localVillageBerry===true?1.16:1;}
  function visualRadius(r,ratio=1){
    if(r?.type==='wood'){
      const scale=(cfg.treeCanopyScale??1.18)*(0.88+ratio*.16);
      return 16.5*scale*1.12;
    }
    return (cfg.berryRadius??19)*(0.88+ratio*.12)*1.08*berryScale(r);
  }
  function overlapsRoad(r,ratio=1){
    const ecology=global.__BATTLEFIELD_ECOLOGY_V1__;
    if(!ecology||!r)return false;
    if(typeof ecology.roadConflictAt==='function'){
      return ecology.roadConflictAt(r.x,r.y,visualRadius(r,ratio),ecology.roadPadding??8);
    }
    if(typeof ecology.roadConflict==='function')return ecology.roadConflict(r.type,r.x,r.y);
    return false;
  }

  function drawTree(r,ratio){
    const scale=(cfg.treeCanopyScale??1.18)*(0.88+ratio*.16);
    const base=16.5*scale;
    ctx.save();ctx.translate(r.x,r.y);

    ctx.fillStyle='rgba(28,31,22,.18)';ctx.beginPath();ctx.ellipse(2.5,3.5,base*1.08,base*.94,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#5a402c';ctx.beginPath();ctx.arc(0,0,3.0,0,Math.PI*2);ctx.fill();

    const lobes=7;
    for(let i=0;i<lobes;i++){
      const seed=seedFor(r,100+i*31),a=i/lobes*Math.PI*2+rand01(seed)*.35;
      const d=base*(.34+rand01(seed^0x77)*.24);
      const rr=base*(.46+rand01(seed^0x55)*.18);
      const x=Math.cos(a)*d,y=Math.sin(a)*d;
      ctx.fillStyle=i%3===0?'rgba(38,80,39,.96)':i%3===1?'rgba(47,91,43,.96)':'rgba(55,99,47,.95)';
      ctx.beginPath();ctx.arc(x,y,rr,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='rgba(116,139,75,.18)';ctx.beginPath();ctx.arc(x-rr*.25,y-rr*.27,rr*.52,0,Math.PI*2);ctx.fill();
    }
    ctx.fillStyle='rgba(31,72,36,.96)';ctx.beginPath();ctx.arc(0,0,base*.66,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='rgba(121,145,78,.20)';ctx.beginPath();ctx.arc(-base*.18,-base*.20,base*.36,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }

  function drawBerryBush(r,ratio){
    ctx.save();ctx.translate(r.x,r.y);
    const local=r.localVillageBerry===true;
    const radius=(cfg.berryRadius??19)*(0.88+ratio*.12)*berryScale(r);
    ctx.fillStyle='rgba(39,50,29,.17)';ctx.beginPath();ctx.ellipse(2,3,radius*1.05,radius*.78,0,0,Math.PI*2);ctx.fill();
    const lobes=local?10:8;
    for(let i=0;i<lobes;i++){
      const seed=seedFor(r,500+i*41),a=i/lobes*Math.PI*2+rand01(seed)*.32;
      const d=radius*(.26+rand01(seed^0x91)*.30),rr=radius*(.30+rand01(seed^0x33)*.15);
      const x=Math.cos(a)*d,y=Math.sin(a)*d;
      ctx.fillStyle=i%2?'#45673d':'#527744';ctx.beginPath();ctx.ellipse(x,y,rr,rr*.82,a*.15,0,Math.PI*2);ctx.fill();
    }
    ctx.fillStyle=local?'#416b39':'#3d5f37';ctx.beginPath();ctx.arc(0,0,radius*.52,0,Math.PI*2);ctx.fill();
    const berryCount=Math.max(5,Math.round(5+ratio*7)+(local?4:0));
    for(let i=0;i<berryCount;i++){
      const seed=seedFor(r,900+i*67),a=rand01(seed)*Math.PI*2,d=rand01(seed^0x1234)*radius*.68;
      const x=Math.cos(a)*d,y=Math.sin(a)*d;
      ctx.fillStyle=i%3===0?'#7b2f48':'#a44257';ctx.beginPath();ctx.arc(x,y,1.35+rand01(seed^0x44)*.75,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='rgba(239,194,199,.40)';ctx.beginPath();ctx.arc(x-.35,y-.35,.45,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }

  function drawFoodResource(r,ratio){
    if(overlapsRoad(r,ratio))return false;
    drawBerryBush(r,ratio);
    foodDraws++;
    if(r.localVillageBerry===true)localVillageBerryDraws++;
    return true;
  }

  drawResource=function drawNaturalResourceV1(r){
    if(!r||r.dead)return;
    const ratio=Math.max(0,Math.min(1,r.amount/Math.max(1,r.maxAmount)));
    // Guaranteed start berries are deliberately drawn by the explicit 2D overlay
    // pass below. This prevents later viewport/performance wrappers from silently
    // removing the bushes while still allowing them to cull ordinary resources.
    if(r.localVillageBerry===true)return;
    if(overlapsRoad(r,ratio))return;
    if(r.type==='wood')drawTree(r,ratio);
    else drawFoodResource(r,ratio);
  };

  // Keep guaranteed start berries on the authoritative 2D canvas regardless of
  // later drawResource wrappers. Only the ten small local bushes use this pass.
  // World visibility is still respected, so off-screen bases cost virtually nothing.
  const previousDraw=draw;
  draw=function drawWithGuaranteedLocalBerriesV1(){
    previousDraw();
    const local=resources.filter(r=>r&&!r.dead&&r.amount>0&&r.type==='food'&&r.localVillageBerry===true);
    if(!local.length)return;
    ctx.save();
    ctx.translate(innerWidth/2,innerHeight/2);
    ctx.scale(camera.zoom,camera.zoom);
    ctx.translate(-camera.x,-camera.y);
    let drawn=0;
    for(const r of local){
      if(typeof isWorldVisible==='function'&&!isWorldVisible(r.x,r.y,42))continue;
      const ratio=Math.max(0,Math.min(1,r.amount/Math.max(1,r.maxAmount)));
      if(drawFoodResource(r,ratio))drawn++;
    }
    ctx.restore();
    if(drawn)localOverlayFrames++;
  };

  const api=Object.freeze({
    version:'natural-resources-v1.3-local-berry-2d-overlay',
    projection:'orthographic-top-down',
    treeStyle:'layered-deciduous-canopy',
    foodStyle:'berry-bush',
    localVillageBerryEmphasis:true,
    explicitLocalBerry2DPass:true,
    ecologyAware:Boolean(global.__BATTLEFIELD_ECOLOGY_V1__),
    roadRenderGuard:true,
    overlapsRoad,
    diagnostics:()=>({foodDraws,localVillageBerryDraws,localOverlayFrames})
  });
  global.__NATURAL_RESOURCES_V1__=api;
  nrts.subsystems.register('natural-resources-renderer',api,{
    phase:'architecture-v2.1',legacyBridge:false,
    responsibility:'realistic top-down tree crowns plus guaranteed visible 2D start berry bushes with hard road-overlap exclusion'
  });
})(window);