'use strict';
// v262: Canvas2D animation sampled from ACTUAL soldier displacement.
// Drawing never modifies physical positions, orders or simulation time.
(function installTopdownMarchV262(root){
  if(!root.NRTS || typeof drawUnit!=='function')return;
  const previous=drawUnit;
  const motion=new Map();
  const footprints=[];
  const MAX_FOOTPRINTS=180;
  const stats={samples:0,moving:0,standing:0,footprints:0,renderedFootprints:0};
  const in2d=()=>true;
  const time=()=>Number(elapsed)||0;
  function sample(u){
    let data=motion.get(u.id);
    const now=time();
    // A regiment may be recreated with the same member id after a game reset.
    if(!data||now<data.t || now-data.t>1.2){
      data={t:now,x:u.x,y:u.y,v:0,distance:0,lastFoot:now};motion.set(u.id,data);
      return data;
    }
    const dt=now-data.t;
    if(dt>=0.015){
      const shift=Math.hypot(u.x-data.x,u.y-data.y);
      const actual=shift/Math.max(dt,.015);
      data.v=actual>1.1?Math.min(210,actual):0;
      data.distance+=shift;
      data.t=now;data.x=u.x;data.y=u.y;
      stats.samples++;
      if(data.v>1.8){
        stats.moving++;
        if(in2d()&&['infantry','officer','drummer','cavalry'].includes(u.type)&&
            now-data.lastFoot>.17&&shift<22&&data.distance>12){
          const facing=u.facing||0;
          const side=Math.floor(data.distance/12)%2?1:-1;
          const px=u.x-Math.cos(facing)*5-Math.sin(facing)*side*3;
          const py=u.y-Math.sin(facing)*5+Math.cos(facing)*side*3;
          footprints.push({x:px,y:py,born:now,horse:u.type==='cavalry'});
          if(footprints.length>MAX_FOOTPRINTS)footprints.shift();
          data.lastFoot=now;data.distance%=12;stats.footprints++;
        }
      }else stats.standing++;
    }
    return data;
  }
  drawUnit=function drawUnitTopdownMarchV262(u){
    if(!u||u.dead)return previous(u);
    sample(u);
    return previous(u);
  };
  function drawGroundFootprints(){
    if(!in2d())return;
    const now=time();
    ctx.save();ctx.fillStyle='#634b34';
    for(let i=footprints.length-1;i>=0;i--){
      const p=footprints[i],age=now-p.born;
      if(age>=2.6||age<0){footprints.splice(i,1);continue;}
      if(!isWorldVisible(p.x,p.y,10))continue;
      ctx.globalAlpha=Math.min(.17,(1-age/2.6)*.17);
      ctx.beginPath();ctx.ellipse(p.x,p.y,p.horse?3.1:1.9,p.horse?1.5:.9,0,0,Math.PI*2);ctx.fill();
      stats.renderedFootprints++;
    }
    ctx.restore();
  }
  // Keep footprints BELOW units, by drawing them after terrain and before
  // resources. Do not wrap drawUnit position or the existing 3D renderer.
  const baseDrawTerrain=drawTerrain;
  drawTerrain=function drawTerrainTopdownFootprintsV262(){
    baseDrawTerrain();drawGroundFootprints();
  };
  const oldReset=resetGame;
  resetGame=function resetTopdownMotionV262(){
    motion.clear();footprints.length=0;return oldReset.apply(this,arguments);
  };
  const api=Object.freeze({
    version:'262.0',visualOnly:true,projection:'Canvas2D',
    speedFor:u=>motion.get(u?.id)?.v||0,
    isMoving:u=>(motion.get(u?.id)?.v||0)>1.8,
    samplesFor:u=>{const v=motion.get(u?.id);return v?{speed:v.v,t:v.t}:null;},
    stats:()=>({...stats,tracked:motion.size,footprintsActive:footprints.length})
  });
  root.__TOPDOWN_MARCH_V262__=api;
  root.NRTS.subsystems.register('topdown-march-v262',api,{
    phase:'2d-only',legacyBridge:false,
    responsibility:'render actual stride cadence and limited footstep trails without changing marching authority'
  });
})(window);
