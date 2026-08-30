'use strict';
(function installMusketeerSpritesV1(global){
  const nrts=global.NRTS;
  if(!nrts)throw new Error('NRTS foundation runtime must load before musketeer sprites.');
  const asset=global.__MUSKETEER_SPRITE_ASSET_V1__;
  if(!asset)throw new Error('Top-down musketeer sprite asset must load before the sprite renderer.');

  const previousDrawUnit=drawUnit;
  const cfg=global.NRTS_CONFIG?.rendering?.musketeerSprites||{};
  const FRAMES=asset.framesPerDirection||4,DIRECTIONS=asset.directions?.length||8;
  const SOURCE_COLS=asset.columns||8,SOURCE_ROWS=asset.rows||4;
  const sourceCellW=asset.width/SOURCE_COLS,sourceCellH=asset.height/SOURCE_ROWS;
  const displayHeight=cfg.displayHeight||44;
  const displayWidth=cfg.displayWidth||Math.round(displayHeight*(sourceCellW/sourceCellH)*1.48);
  const frameRate=cfg.frameRate||7.5;
  const idleFrame=Math.max(0,Math.min(FRAMES-1,cfg.idleFrame??1));
  const image=new Image();
  image.decoding='async';
  const sheets={france:image,britain:null};
  let loaded=false;
  const stats={spriteDraws:0,fallbackDraws:0,framesUsed:new Set(),directionsUsed:new Set()};

  function makeBritishSheet(){
    const canvas=document.createElement('canvas');canvas.width=asset.width;canvas.height=asset.height;
    const c=canvas.getContext('2d',{willReadFrequently:true});c.drawImage(image,0,0);
    const data=c.getImageData(0,0,canvas.width,canvas.height),p=data.data;
    for(let i=0;i<p.length;i+=4){
      if(p[i+3]<12)continue;
      const r=p[i],g=p[i+1],b=p[i+2];
      if(b>r*1.22&&b>g*1.08&&b-r>22){
        const luminance=(r*0.22+g*0.34+b*0.44);
        p[i]=Math.min(190,luminance*1.34+38);
        p[i+1]=Math.min(78,luminance*.42+18);
        p[i+2]=Math.min(72,luminance*.34+16);
      }
    }
    c.putImageData(data,0,0);sheets.britain=canvas;
  }
  image.onload=()=>{loaded=image.naturalWidth===asset.width&&image.naturalHeight===asset.height;if(loaded)makeBritishSheet();};
  image.onerror=()=>{loaded=false;};
  image.src=asset.src;

  function directionForFacing(facing=0){
    const raw=Math.round((facing+Math.PI/2)/(Math.PI/4));
    return ((raw%8)+8)%8;
  }
  function moving(u){return Math.hypot((u.targetX??u.x)-u.x,(u.targetY??u.y)-u.y)>3.5;}
  function frameFor(u){
    if(!moving(u))return idleFrame;
    return Math.floor(elapsed*frameRate+(u.id%4)*.73)%FRAMES;
  }
  function sourceRect(direction,frame){
    const row=Math.floor(direction/2);
    const col=(direction%2)*FRAMES+frame;
    return{x:col*sourceCellW,y:row*sourceCellH,w:sourceCellW,h:sourceCellH};
  }
  function ready(){return loaded&&!!sheets.britain;}
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
    if(u.type!=='infantry'||!ready()){
      stats.fallbackDraws++;
      return previousDrawUnit(u);
    }
    const direction=directionForFacing(Number.isFinite(u.facing)?u.facing:0),frame=frameFor(u),source=sourceRect(direction,frame);
    const sheet=u.side==='britain'?sheets.britain:sheets.france;
    stats.spriteDraws++;stats.framesUsed.add(frame);stats.directionsUsed.add(direction);
    const bob=moving(u)?Math.sin((elapsed*frameRate+u.id*.37)*Math.PI*.5)*.45:0;
    const alpha=u.routing?.82:1;
    ctx.save();ctx.globalAlpha=alpha;
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    ctx.drawImage(sheet,source.x,source.y,source.w,source.h,u.x-displayWidth/2,u.y-displayHeight/2+bob,displayWidth,displayHeight);
    ctx.restore();
    drawOverlay(u);
  };

  const api=Object.freeze({
    version:'musketeer-sprites-v1',projection:'orthographic-top-down',directions:DIRECTIONS,frames:FRAMES,
    usesGeneratedReference:true,usesImageAssets:true,sourceLayout:'8-columns-by-4-rows / two directions per row',
    source:'embedded-generated-reference',
    ready,directionForFacing,frameFor,sourceRect,
    stats:()=>({spriteDraws:stats.spriteDraws,fallbackDraws:stats.fallbackDraws,framesUsed:[...stats.framesUsed],directionsUsed:[...stats.directionsUsed],loaded,hasBritishVariant:!!sheets.britain})
  });
  global.__MUSKETEER_SPRITES_V1__=api;
  nrts.subsystems.register('infantry-sprite-renderer',api,{phase:'architecture-v2.1',legacyBridge:false,responsibility:'animated eight-direction true top-down Napoleonic infantry sprites from the approved reference asset'});
})(window);
