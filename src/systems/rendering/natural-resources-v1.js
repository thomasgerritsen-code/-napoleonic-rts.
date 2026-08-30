'use strict';
// ---------- Architecture v2.1: top-down natural resource renderer ----------
(function installNaturalResourcesV1(global){
  const nrts=global.NRTS;
  if(!nrts) throw new Error('NRTS foundation runtime must load before natural resources renderer.');
  const cfg=global.NRTS_CONFIG?.world?.vegetation || {};

  function rand01(seed){
    let x=(seed>>>0)||1;x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296;
  }
  function seedFor(r,salt=0){return(((r.id||1)*2654435761)^((Math.round(r.x)*73856093)>>>0)^((Math.round(r.y)*19349663)>>>0)^salt)>>>0;}

  function drawTree(r,ratio){
    const scale=(cfg.treeCanopyScale??1.18)*(0.88+ratio*.16);
    const base=16.5*scale;
    ctx.save();ctx.translate(r.x,r.y);

    // Soft ground shadow directly below the crown keeps the projection orthographic.
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
    const radius=(cfg.berryRadius??19)*(0.88+ratio*.12);
    ctx.fillStyle='rgba(39,50,29,.15)';ctx.beginPath();ctx.ellipse(2,3,radius*1.05,radius*.78,0,0,Math.PI*2);ctx.fill();
    const lobes=8;
    for(let i=0;i<lobes;i++){
      const seed=seedFor(r,500+i*41),a=i/lobes*Math.PI*2+rand01(seed)*.32;
      const d=radius*(.26+rand01(seed^0x91)*.30),rr=radius*(.30+rand01(seed^0x33)*.15);
      const x=Math.cos(a)*d,y=Math.sin(a)*d;
      ctx.fillStyle=i%2?'#45673d':'#527744';ctx.beginPath();ctx.ellipse(x,y,rr,rr*.82,a*.15,0,Math.PI*2);ctx.fill();
    }
    ctx.fillStyle='#3d5f37';ctx.beginPath();ctx.arc(0,0,radius*.52,0,Math.PI*2);ctx.fill();
    const berryCount=Math.max(5,Math.round(5+ratio*7));
    for(let i=0;i<berryCount;i++){
      const seed=seedFor(r,900+i*67),a=rand01(seed)*Math.PI*2,d=rand01(seed^0x1234)*radius*.68;
      const x=Math.cos(a)*d,y=Math.sin(a)*d;
      ctx.fillStyle=i%3===0?'#7b2f48':'#923d50';ctx.beginPath();ctx.arc(x,y,1.35+rand01(seed^0x44)*.75,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='rgba(225,181,185,.35)';ctx.beginPath();ctx.arc(x-.35,y-.35,.45,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }

  drawResource=function drawNaturalResourceV1(r){
    if(!r||r.dead)return;
    const ratio=Math.max(0,Math.min(1,r.amount/Math.max(1,r.maxAmount)));
    if(r.type==='wood')drawTree(r,ratio);else drawBerryBush(r,ratio);
  };

  const api=Object.freeze({
    version:'natural-resources-v1',
    projection:'orthographic-top-down',
    treeStyle:'layered-deciduous-canopy',
    foodStyle:'berry-bush',
    ecologyAware:Boolean(global.__BATTLEFIELD_ECOLOGY_V1__)
  });
  global.__NATURAL_RESOURCES_V1__=api;
  nrts.subsystems.register('natural-resources-renderer',api,{
    phase:'architecture-v2.1',legacyBridge:false,
    responsibility:'realistic top-down tree crowns and berry bushes without changing resource economy'
  });
})(window);
