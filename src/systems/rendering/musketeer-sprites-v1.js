'use strict';
(function installMusketeerSpritesV1(global){
  const nrts=global.NRTS;
  if(!nrts)throw new Error('NRTS foundation runtime must load before musketeer sprites.');

  const embedded=global.__MUSKETEER_SPRITE_ASSET_V1__;
  const asset=Object.freeze({
    width:embedded?.width||145,height:embedded?.height||109,
    columns:embedded?.columns||8,rows:embedded?.rows||4,
    framesPerDirection:embedded?.framesPerDirection||4,
    directions:Object.freeze(['north','north-east','east','south-east','south','south-west','west','north-west']),
    src:embedded?.src||null
  });
  global.NRTS_MUSKETEER_SPRITE_V1=asset;

  const previousDrawUnit=drawUnit;
  const cfg=global.NRTS_CONFIG?.rendering?.musketeerSprites||{};
  const FRAMES=asset.framesPerDirection,DIRECTIONS=asset.directions.length;
  const sourceCellW=asset.width/asset.columns,sourceCellH=asset.height/asset.rows;
  const displayHeight=cfg.displayHeight||44;
  const displayWidth=cfg.displayWidth||Math.round(displayHeight*(sourceCellW/sourceCellH)*1.48);
  const frameRate=cfg.frameRate||7.5;
  const idleFrame=Math.max(0,Math.min(FRAMES-1,cfg.idleFrame??1));
  const stats={spriteDraws:0,fallbackDraws:0,framesUsed:new Set(),directionsUsed:new Set(),embeddedUpgrades:0};

  function sourceRect(direction,frame){
    const row=Math.floor(direction/2);
    const col=(direction%2)*FRAMES+frame;
    return{x:col*sourceCellW,y:row*sourceCellH,w:sourceCellW,h:sourceCellH};
  }

  function makeGeneratedSheet(side){
    const canvas=document.createElement('canvas');
    canvas.width=asset.width;canvas.height=asset.height;
    const g=canvas.getContext('2d');
    const coat=side==='britain'?'#a4312d':'#244f8f';
    const facings=[-Math.PI/2,-Math.PI/4,0,Math.PI/4,Math.PI/2,3*Math.PI/4,Math.PI,5*Math.PI/4];
    for(let direction=0;direction<DIRECTIONS;direction++){
      for(let frame=0;frame<FRAMES;frame++){
        const r=sourceRect(direction,frame),cx=r.x+r.w/2,cy=r.y+r.h/2;
        const stride=[-1.0,-.35,.35,1.0][frame];
        g.save();g.translate(cx,cy);g.rotate(facings[direction]);
        // Tiny overhead shadow, torso, head/hat and a long musket silhouette. The
        // leg/arm offsets change per frame, giving a readable march cycle while
        // preserving a genuinely orthographic top-down silhouette.
        g.fillStyle='rgba(0,0,0,.22)';g.beginPath();g.ellipse(0,2,5.2,8.6,0,0,Math.PI*2);g.fill();
        g.fillStyle='#222';g.fillRect(-1.1,-11,2.2,21);
        g.fillStyle='#75552d';g.fillRect(.55,-12.2,1.15,24.2);
        g.strokeStyle='#252525';g.lineWidth=1.7;g.lineCap='round';
        g.beginPath();g.moveTo(-2.2,3);g.lineTo(-4.2+stride,8.7);g.moveTo(2.2,3);g.lineTo(4.2-stride,8.7);g.stroke();
        g.fillStyle=coat;g.beginPath();g.ellipse(0,0,4.25,6.8,0,0,Math.PI*2);g.fill();
        g.strokeStyle='#e9e0c4';g.lineWidth=1;g.beginPath();g.moveTo(-3,-2+stride*.45);g.lineTo(2.5,2-stride*.45);g.stroke();
        g.fillStyle='#d4ad83';g.beginPath();g.arc(0,-6.2,2.15,0,Math.PI*2);g.fill();
        g.fillStyle='#202020';g.beginPath();g.ellipse(0,-7.2,3.05,1.55,0,0,Math.PI*2);g.fill();
        g.fillStyle='#eee';g.fillRect(-3.7,-1.4,1.05,3.3);
        g.restore();
      }
    }
    return canvas;
  }

  const sheets={france:makeGeneratedSheet('france'),britain:makeGeneratedSheet('britain')};
  const loaded={france:true,britain:true};

  // Prefer the approved embedded WebP when the browser accepts it. Generated
  // canvases remain the synchronous fallback, so rendering can never stall on an
  // image decode or a placeholder file.
  if(asset.src){
    for(const side of ['france','britain']){
      const image=new Image();image.decoding='async';
      image.onload=()=>{
        if(image.naturalWidth===asset.width&&image.naturalHeight===asset.height){sheets[side]=image;stats.embeddedUpgrades++;}
      };
      image.src=asset.src;
    }
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
  function ready(){return loaded.france&&loaded.britain;}
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
    source:'generated-canvas-with-embedded-webp-upgrade',
    ready,directionForFacing,frameFor,sourceRect,
    stats:()=>({spriteDraws:stats.spriteDraws,fallbackDraws:stats.fallbackDraws,framesUsed:[...stats.framesUsed],directionsUsed:[...stats.directionsUsed],loaded:ready(),hasBritishVariant:loaded.britain,embeddedUpgrades:stats.embeddedUpgrades})
  });
  global.__MUSKETEER_SPRITES_V1__=api;
  nrts.subsystems.register('infantry-sprite-renderer',api,{phase:'architecture-v2.1',legacyBridge:false,responsibility:'synchronous animated eight-direction orthographic infantry sprites with optional embedded-WebP upgrade'});
})(window);
