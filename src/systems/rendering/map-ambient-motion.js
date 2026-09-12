'use strict';
// ---------- Architecture v2: Map Ambient Motion v1 ----------
(function installMapAmbientMotion(global){
  const nrts=global.NRTS;
  if(!nrts) throw new Error('NRTS foundation runtime must load before map ambient motion.');

  const baseDrawTerrain=drawTerrain;
  const baseDrawParticles=drawParticles;
  const wind={x:.72,y:-.28,strength:1};

  function clock(){return performance.now()/1000;}
  function visibleBounds(margin=0){
    const map=global.__MAP_REALISM_V2__;
    if(map?.visibleBounds)return map.visibleBounds(margin);
    const halfW=innerWidth/(2*Math.max(.05,camera.zoom))+margin;
    const halfH=innerHeight/(2*Math.max(.05,camera.zoom))+margin;
    return{left:Math.max(0,camera.x-halfW),right:Math.min(WORLD.width,camera.x+halfW),top:Math.max(0,camera.y-halfH),bottom:Math.min(WORLD.height,camera.y+halfH)};
  }
  function pointVisible(b,x,y,margin=0){return x>=b.left-margin&&x<=b.right+margin&&y>=b.top-margin&&y<=b.bottom+margin;}
  function rectVisible(b,x,y,w,h,margin=0){return x+w>=b.left-margin&&x<=b.right+margin&&y+h>=b.top-margin&&y<=b.bottom+margin;}

  function drawGrassMotion(t,b){
    ctx.save();ctx.lineCap='round';ctx.lineWidth=.8;ctx.strokeStyle='rgba(210,218,174,.075)';
    const startY=Math.max(70,70+Math.floor((b.top-70)/95)*95);
    const endY=Math.min(WORLD.height,b.bottom+95);
    const startX=Math.max(55,55+Math.floor((b.left-55)/105)*105);
    const endX=Math.min(WORLD.width,b.right+105);
    for(let gy=startY;gy<endY;gy+=95){
      for(let gx=startX;gx<endX;gx+=105){
        const seed=(gx*13+gy*7)%97;
        const sway=Math.sin(t*.85+seed*.19)*2.2;
        const lift=Math.cos(t*.62+seed*.11)*.7;
        ctx.beginPath();ctx.moveTo(gx,gy);ctx.lineTo(gx+sway,gy-5+lift);ctx.moveTo(gx+5,gy+2);ctx.lineTo(gx+3+sway*.65,gy-3+lift);ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawWoodSway(t,b){
    if(typeof TERRAIN_WOODS==='undefined')return;
    ctx.save();ctx.fillStyle='rgba(104,137,76,.095)';
    TERRAIN_WOODS.forEach((w,wi)=>{
      if(!rectVisible(b,w.x,w.y,w.w,w.h,20))return;
      const count=Math.max(6,Math.floor(w.w*w.h/7600));
      for(let i=0;i<count;i++){
        const fx=((i*37+wi*19)%101)/101,fy=((i*61+wi*11)%97)/97;
        const x=w.x+fx*w.w,y=w.y+fy*w.h;
        if(!pointVisible(b,x,y,12))continue;
        const sway=Math.sin(t*.72+i*.71+wi)*2.4;
        const bob=Math.cos(t*.55+i*.43)*1.1;
        ctx.beginPath();ctx.arc(x+sway,y+bob,5+(i%4),0,Math.PI*2);ctx.fill();
      }
    });
    ctx.restore();
  }

  function drawFieldRipple(t,b){
    ctx.save();ctx.strokeStyle='rgba(222,204,135,.055)';ctx.lineWidth=1.2;
    const startY=Math.max(160,160+Math.floor((b.top-160)/180)*180);
    for(let y=startY;y<Math.min(WORLD.height,b.bottom+180);y+=180){
      const shift=Math.sin(t*.48+y*.013)*12;
      ctx.beginPath();ctx.moveTo(b.left+shift,y);ctx.lineTo(b.right+shift*.3,y+4);ctx.stroke();
    }
    ctx.restore();
  }

  function drawAmbientTerrainOverlay(){
    const t=clock(),b=visibleBounds(35);
    drawGrassMotion(t,b);
    drawFieldRipple(t,b);
    drawWoodSway(t,b);
  }

  drawTerrain=function drawTerrainAmbientMotionV1(){
    baseDrawTerrain();
    drawAmbientTerrainOverlay();
  };

  drawParticles=function drawParticlesAmbientMotionV1(){
    baseDrawParticles();
    const t=clock(),b=visibleBounds(45);
    ctx.save();
    for(const p of particles){
      if(p.dead||!Number.isFinite(p.life)||!Number.isFinite(p.maxLife)||p.maxLife<=0||!pointVisible(b,p.x,p.y,30))continue;
      const age=Math.max(0,p.maxLife-p.life);
      if(age>.05){
        const drift=age*6*wind.strength;
        ctx.globalAlpha=Math.max(0,Math.min(.14,p.life/p.maxLife*.14));
        ctx.fillStyle='rgba(226,222,207,.55)';
        ctx.beginPath();ctx.arc(p.x+wind.x*drift,p.y+wind.y*drift,Math.max(1,p.size*.7),0,Math.PI*2);ctx.fill();
      }
    }
    ctx.restore();ctx.globalAlpha=1;
  };

  const api=Object.freeze({
    version:'map-ambient-motion-v1.3.2',
    wind:Object.freeze({...wind}),
    visualOnly:true,
    viewportCulling:true,
    baseTerrainDraw:baseDrawTerrain,
    drawOverlay:drawAmbientTerrainOverlay,
    features:Object.freeze(['grass-sway','tree-canopy-sway','field-ripple','smoke-drift'])
  });
  nrts.subsystems.register('map-ambient-motion',api,{
    phase:'architecture-v2',legacyBridge:false,
    responsibility:'viewport-culled subtle battlefield motion layered over the deterministic map without changing terrain or navigation'
  });
  global.__MAP_AMBIENT_MOTION_V1__=api;
})(window);
