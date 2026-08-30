'use strict';
(function installMusketeerSpritesV1(global){
  const nrts=global.NRTS;
  if(!nrts)throw new Error('NRTS foundation runtime must load before musketeer sprites.');
  const previousDrawUnit=drawUnit;
  const cfg=global.NRTS_CONFIG?.rendering?.musketeerSprites||{};
  const CELL=160,FRAMES=4,DIRECTIONS=8;
  const displaySize=cfg.displaySize||42;
  const frameRate=cfg.frameRate||7.5;
  const idleFrame=Math.max(0,Math.min(FRAMES-1,cfg.idleFrame??1));
  const sources=Object.freeze({
    france:'assets/units/musketeer-france-topdown-v1.webp?build=sprite1',
    britain:'assets/units/musketeer-britain-topdown-v1.webp?build=sprite1'
  });
  const images={};
  const loaded={france:false,britain:false};
  const stats={spriteDraws:0,fallbackDraws:0,framesUsed:new Set(),directionsUsed:new Set()};

  for(const side of Object.keys(sources)){
    const image=new Image();
    image.decoding='async';
    image.onload=()=>{loaded[side]=image.naturalWidth===CELL*FRAMES&&image.naturalHeight===CELL*DIRECTIONS;};
    image.onerror=()=>{loaded[side]=false;};
    image.src=sources[side];
    images[side]=image;
  }

  function directionForFacing(facing=0){
    const raw=Math.round((facing+Math.PI/2)/(Math.PI/4));
    return ((raw%8)+8)%8;
  }
  function moving(u){return Math.hypot((u.targetX??u.x)-u.x,(u.targetY??u.y)-u.y)>3.5;}
  function frameFor(u){
    if(!moving(u))return idleFrame;
    return Math.floor(elapsed*frameRate+(u.id%4)*.73)%FRAMES;
  }
  function ready(side=null){
    if(side)return !!loaded[side];
    return loaded.france&&loaded.britain;
  }
  function drawOverlay(u){
    const radius=TYPES[u.type]?.radius||7;
    if(selectedUnits.has(u)){
      ctx.strokeStyle=COLORS.selected;ctx.lineWidth=2/camera.zoom;
      ctx.beginPath();ctx.arc(u.x,u.y,radius+6,0,Math.PI*2);ctx.stroke();
    }
    if(u.regimentId){
      ctx.strokeStyle='rgba(244,216,109,.48)';ctx.lineWidth=1/camera.zoom;
      ctx.beginPath();ctx.arc(u.x,u.y,radius+3,0,Math.PI*2);ctx.stroke();
    }
    ctx.fillStyle='rgba(0,0,0,.38)';ctx.fillRect(u.x-10,u.y-18,20,3);
    ctx.fillStyle=u.morale>55?'#d8d06a':u.morale>25?'#d49a4b':'#b43f38';
    ctx.fillRect(u.x-10,u.y-18,20*Math.max(0,Math.min(1,u.morale/100)),3);
  }

  drawUnit=function drawUnitMusketeerSpritesV1(u){
    if(!u||u.dead)return;
    if(u.type!=='infantry'){
      stats.fallbackDraws++;
      return previousDrawUnit(u);
    }
    const side=u.side==='britain'?'britain':'france';
    const image=images[side];
    if(!loaded[side]||!image?.complete){
      stats.fallbackDraws++;
      return previousDrawUnit(u);
    }
    const direction=directionForFacing(Number.isFinite(u.facing)?u.facing:0);
    const frame=frameFor(u);
    stats.spriteDraws++;stats.framesUsed.add(frame);stats.directionsUsed.add(direction);
    const movingNow=moving(u);
    const bob=movingNow?Math.sin((elapsed*frameRate+u.id*.37)*Math.PI*.5)*.55:0;
    const size=displaySize*(u.routing?.94:1);
    const sx=frame*CELL,sy=direction*CELL;
    ctx.save();
    ctx.globalAlpha=u.routing?.82:1;
    ctx.drawImage(image,sx,sy,CELL,CELL,u.x-size/2,u.y-size/2+bob,size,size);
    ctx.restore();
    drawOverlay(u);
  };

  const api=Object.freeze({
    version:'musketeer-sprites-v1',projection:'orthographic-top-down',directions:DIRECTIONS,frames:FRAMES,
    usesImageAssets:true,sources,ready,directionForFacing,frameFor,
    stats:()=>({spriteDraws:stats.spriteDraws,fallbackDraws:stats.fallbackDraws,framesUsed:[...stats.framesUsed],directionsUsed:[...stats.directionsUsed],loaded:{...loaded}})
  });
  global.__MUSKETEER_SPRITES_V1__=api;
  nrts.subsystems.register('infantry-sprite-renderer',api,{phase:'architecture-v2.1',legacyBridge:false,responsibility:'animated 8-direction top-down Napoleonic musketeer sprites for infantry'});
})(window);
