'use strict';
// ---------- Architecture v2: Map Ambient Motion v1 ----------
(function installMapAmbientMotion(global){
  const nrts=global.NRTS;
  if(!nrts) throw new Error('NRTS foundation runtime must load before map ambient motion.');

  const baseDrawTerrain=drawTerrain;
  const baseDrawParticles=drawParticles;
  const wind={x:.72,y:-.28,strength:1};

  function clock(){return performance.now()/1000;}

  function drawGrassMotion(t){
    ctx.save();ctx.lineCap='round';ctx.lineWidth=.8;
    for(let gy=70;gy<WORLD.height;gy+=95){
      for(let gx=55;gx<WORLD.width;gx+=105){
        const seed=(gx*13+gy*7)%97;
        const sway=Math.sin(t*.85+seed*.19)*2.2;
        const lift=Math.cos(t*.62+seed*.11)*.7;
        ctx.strokeStyle='rgba(210,218,174,.075)';
        ctx.beginPath();ctx.moveTo(gx,gy);ctx.lineTo(gx+sway,gy-5+lift);ctx.stroke();
        ctx.beginPath();ctx.moveTo(gx+5,gy+2);ctx.lineTo(gx+3+sway*.65,gy-3+lift);ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawWoodSway(t){
    if(typeof TERRAIN_WOODS==='undefined')return;
    ctx.save();
    TERRAIN_WOODS.forEach((w,wi)=>{
      const count=Math.max(6,Math.floor(w.w*w.h/7600));
      for(let i=0;i<count;i++){
        const fx=((i*37+wi*19)%101)/101,fy=((i*61+wi*11)%97)/97;
        const x=w.x+fx*w.w,y=w.y+fy*w.h;
        const sway=Math.sin(t*.72+i*.71+wi)*2.4;
        const bob=Math.cos(t*.55+i*.43)*1.1;
        ctx.fillStyle='rgba(104,137,76,.095)';
        ctx.beginPath();ctx.arc(x+sway,y+bob,5+(i%4),0,Math.PI*2);ctx.fill();
      }
    });
    ctx.restore();
  }

  function drawFieldRipple(t){
    const map=global.__MAP_REALISM_V1__;
    if(!map)return;
    ctx.save();
    ctx.strokeStyle='rgba(222,204,135,.055)';ctx.lineWidth=1.2;
    for(let y=160;y<WORLD.height;y+=180){
      const shift=Math.sin(t*.48+y*.013)*12;
      ctx.beginPath();ctx.moveTo(80+shift,y);ctx.lineTo(WORLD.width-80+shift*.3,y+4);ctx.stroke();
    }
    ctx.restore();
  }

  drawTerrain=function drawTerrainAmbientMotionV1(){
    baseDrawTerrain();
    const t=clock();
    drawGrassMotion(t);
    drawFieldRipple(t);
    drawWoodSway(t);
  };

  drawParticles=function drawParticlesAmbientMotionV1(){
    baseDrawParticles();
    const t=clock();
    ctx.save();
    for(const p of particles){
      if(p.dead||!Number.isFinite(p.life)||!Number.isFinite(p.maxLife)||p.maxLife<=0)continue;
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
    version:'map-ambient-motion-v1',
    wind:Object.freeze({...wind}),
    visualOnly:true,
    features:Object.freeze(['grass-sway','tree-canopy-sway','field-ripple','smoke-drift'])
  });
  nrts.subsystems.register('map-ambient-motion',api,{
    phase:'architecture-v2',legacyBridge:false,
    responsibility:'subtle visual battlefield motion layered over the deterministic map without changing terrain or navigation'
  });
  global.__MAP_AMBIENT_MOTION_V1__=api;
})(window);
