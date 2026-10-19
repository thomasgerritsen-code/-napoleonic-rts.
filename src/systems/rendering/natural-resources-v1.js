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
    if(r?.type==='iron')return 23;
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

  function overlapsRiver(r,ratio=1){
    const ecology=global.__BATTLEFIELD_ECOLOGY_V1__;
    return !!r && !!ecology?.riverbankConflict?.(r.type,r.x,r.y,visualRadius(r,ratio));
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

  // v293: subdued, partially buried fieldstone clusters with a touch of moss.
  // Shape/rotation are per-resource deterministic, not a repeated grey icon.
  function drawIronOre(r,ratio){
    const seed=seedFor(r,0x293),n=2+Math.floor(rand01(seed^0x722)*2);
    const width=16+ratio*3.5;
    ctx.save();
    ctx.translate(r.x,r.y);
    ctx.rotate((rand01(seed^0x12)-.5)*.34);

    // Grass and soil cover the edge of the deposit, with only a soft shadow.
    ctx.fillStyle='rgba(70,76,51,.16)';
    ctx.beginPath();ctx.ellipse(0,4,width*1.3,9,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='rgba(90,83,57,.20)';
    ctx.beginPath();ctx.ellipse(1,2,width*1.05,6.8,0,0,Math.PI*2);ctx.fill();

    const stoneColors=['#746f63','#858073','#686f65','#807869'];
    for(let i=0;i<n;i++){
      const a=rand01(seed+i*351+5)*Math.PI*2;
      const px=Math.cos(a)*width*.43,py=Math.sin(a)*4;
      const w=6+rand01(seed+i*937+12)*5;
      const h=3.8+rand01(seed+i*1057+24)*2.7;
      ctx.fillStyle='rgba(33,42,32,.15)';
      ctx.beginPath();ctx.ellipse(px+1.5,py+3,w*1.02,h*.75,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=stoneColors[Math.floor(rand01(seed+i*311+8)*stoneColors.length)];
      ctx.beginPath();ctx.moveTo(px-w,py+2);ctx.lineTo(px-w*.68,py-h*.67);
      ctx.lineTo(px-w*.12,py-h);ctx.lineTo(px+w*.70,py-h*.40);
      ctx.lineTo(px+w,py+1);ctx.lineTo(px+w*.13,py+h*.57);ctx.closePath();ctx.fill();
      ctx.fillStyle='rgba(53,86,50,.35)';
      ctx.beginPath();ctx.ellipse(px-w*.22,py-h*.18,w*.32,h*.28,-.2,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='rgba(205,194,166,.12)';
      ctx.beginPath();ctx.moveTo(px-w*.62,py-h*.54);ctx.lineTo(px-w*.12,py-h*.79);
      ctx.lineTo(px+w*.36,py-h*.39);ctx.closePath();ctx.fill();
    }
    // Irregular small meadow tufts conceal the stony outline while keeping it
    // distinguishable enough for workers to gather it on mobile screens.
    for(let i=0;i<7;i++){
      const rx=(rand01(seed+i*947+220)-.5)*width*2.25;
      const ry=2+(rand01(seed+i*843+235)-.5)*10;
      ctx.strokeStyle=i%3===0?'rgba(89,112,62,.65)':'rgba(72,97,55,.55)';
      ctx.lineWidth=1.25;ctx.lineCap='round';ctx.beginPath();
      ctx.moveTo(rx-2,ry+2);ctx.lineTo(rx-3.5,ry-1.5);
      ctx.moveTo(rx,ry+2);ctx.lineTo(rx+1,ry-2.5);
      ctx.moveTo(rx+2,ry+2);ctx.lineTo(rx+4,ry-1);ctx.stroke();
    }
    ctx.restore();
  }

  function drawFoodResource(r,ratio){
    if(overlapsRoad(r,ratio)||overlapsRiver(r,ratio))return false;
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
    if(overlapsRoad(r,ratio)||overlapsRiver(r,ratio))return;
    if(r.type==='wood')drawTree(r,ratio);
    else if(r.type==='iron')drawIronOre(r,ratio);
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
    version:'natural-resources-v1.4-road-guard-natural-ore',
    projection:'orthographic-top-down',
    treeStyle:'layered-deciduous-canopy',
    foodStyle:'berry-bush',
    ironStyle:'mossy-half-buried-fieldstones',
    localVillageBerryEmphasis:true,
    explicitLocalBerry2DPass:true,
    ecologyAware:Boolean(global.__BATTLEFIELD_ECOLOGY_V1__),
    roadRenderGuard:true,
    riverRenderGuard:true,
    overlapsRiver,
    oreNaturalBlend:true,
    overlapsRoad,
    diagnostics:()=>({foodDraws,localVillageBerryDraws,localOverlayFrames})
  });
  global.__NATURAL_RESOURCES_V1__=api;
  nrts.subsystems.register('natural-resources-renderer',api,{
    phase:'architecture-v2.1',legacyBridge:false,
    responsibility:'realistic top-down tree crowns plus guaranteed visible 2D start berry bushes with hard road-overlap exclusion'
  });
})(window);