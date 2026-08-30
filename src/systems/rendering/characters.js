'use strict';
// ---------- Architecture v2.1: strict top-down Napoleonic character renderer ----------
(function installCharacterRenderer(global){
  const nrts=global.NRTS;
  if(!nrts) throw new Error('NRTS foundation runtime must load before character renderer.');

  const legacyDrawUnit=drawUnit;

  function motionState(u){
    if(u.routing)return'routing';
    if(u.type==='worker'){
      if(u.task==='build')return'building';
      if(u.task==='gather')return'gathering';
      if(u.task==='return'&&u.carry>0)return'carrying';
    }
    if(u.type==='cavalry'&&(u.chargeTimer||0)>0)return'charging';
    const d=Math.hypot((u.targetX??u.x)-u.x,(u.targetY??u.y)-u.y);
    if(d>4)return u.marchingV064?'marching':'moving';
    return'idle';
  }
  function phase(u,speed=1){return(elapsed*speed+(u.id%11)*.37)*Math.PI*2;}
  function palette(u){
    if(u.routing)return{coat:'#74736f',turnback:'#8b8983',trousers:'#777773',belt:'#b7b5ad',shako:'#343434',plume:'#777'};
    return u.side==='france'
      ?{coat:'#254c8d',turnback:'#c13c34',trousers:'#ddd9ca',belt:'#eee9d8',shako:'#202427',plume:'#d43b37'}
      :{coat:'#a93430',turnback:'#ede5d4',trousers:'#b7b1a2',belt:'#eee9d8',shako:'#202427',plume:'#e6d45c'};
  }
  function selectionMarks(u,radius){
    if(selectedUnits.has(u)){
      ctx.strokeStyle=COLORS.selected;ctx.lineWidth=2/camera.zoom;
      ctx.beginPath();ctx.arc(0,0,radius+6,0,Math.PI*2);ctx.stroke();
    }
    if(u.regimentId){
      ctx.strokeStyle='rgba(244,216,109,.48)';ctx.lineWidth=1/camera.zoom;
      ctx.beginPath();ctx.arc(0,0,radius+3,0,Math.PI*2);ctx.stroke();
    }
  }

  // Orthographic standing silhouette. A standing person must stay compact in plan view:
  // shoulders dominate, the head overlaps the front of the torso and only the feet peek
  // out behind it. Long head-to-foot stacking reads as a prone/crawling body and is avoided.
  function drawTopDownSoldierAt(u,state,opts={}){
    const p=palette(u),scale=opts.scale||1;
    const marching=['moving','marching','routing','carrying'].includes(state);
    const gait=marching?Math.sin(phase(u,1.8))*0.85*scale:0;
    const armSwing=marching?Math.sin(phase(u,1.8)+Math.PI/2)*0.55*scale:0;
    const coat=opts.coat||p.coat;

    // Feet remain close to the body. They alternate slightly while marching without
    // extending the full human height across the ground plane.
    ctx.fillStyle='#302b27';
    ctx.beginPath();ctx.ellipse((-4.45+gait)*scale,-2.55*scale,2.15*scale,1.3*scale,-0.12,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse((-4.45-gait)*scale,2.55*scale,2.15*scale,1.3*scale,0.12,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=opts.trousers||p.trousers;
    ctx.beginPath();ctx.ellipse((-2.9+gait*.45)*scale,-2.35*scale,2.45*scale,1.55*scale,-0.08,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse((-2.9-gait*.45)*scale,2.35*scale,2.45*scale,1.55*scale,0.08,0,Math.PI*2);ctx.fill();

    // Broad shoulders and compact torso are the primary readable shape from above.
    ctx.fillStyle=coat;ctx.beginPath();ctx.ellipse(0,0,5.25*scale,5.7*scale,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=opts.turnback||p.turnback;
    ctx.beginPath();ctx.moveTo(-3.9*scale,-3.1*scale);ctx.lineTo(-5.0*scale,0);ctx.lineTo(-3.9*scale,3.1*scale);ctx.closePath();ctx.fill();

    // Arms sit beside the shoulders and swing locally rather than stretching the body.
    ctx.fillStyle=coat;
    ctx.beginPath();ctx.ellipse((.2+armSwing)*scale,-5.0*scale,3.15*scale,1.35*scale,-.08,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse((.2-armSwing)*scale,5.0*scale,3.15*scale,1.35*scale,.08,0,Math.PI*2);ctx.fill();

    // Cross belts remain readable on the shoulder/torso mass.
    ctx.strokeStyle=opts.belt||p.belt;ctx.lineWidth=1.15*scale;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(-3.1*scale,-3.5*scale);ctx.lineTo(3.2*scale,3.4*scale);ctx.stroke();
    ctx.beginPath();ctx.moveTo(-3.1*scale,3.5*scale);ctx.lineTo(3.2*scale,-3.4*scale);ctx.stroke();

    // The head/shako overlaps the front edge of the shoulders, as it would for a
    // vertically standing soldier viewed straight down, instead of lying ahead of them.
    ctx.fillStyle='#c89d79';ctx.beginPath();ctx.arc(2.9*scale,0,2.45*scale,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=opts.shako||p.shako;ctx.beginPath();ctx.ellipse(3.8*scale,0,2.3*scale,3.05*scale,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='rgba(238,232,216,.65)';ctx.lineWidth=.65*scale;ctx.beginPath();ctx.moveTo(3.9*scale,-2.6*scale);ctx.lineTo(3.9*scale,2.6*scale);ctx.stroke();
    ctx.fillStyle=opts.plume||p.plume;ctx.beginPath();ctx.arc(5.55*scale,-1.65*scale,.95*scale,0,Math.PI*2);ctx.fill();

    if(opts.musket!==false){
      // Musket is a separate side silhouette; it must not become the apparent body axis.
      ctx.strokeStyle='#493322';ctx.lineWidth=1.35*scale;ctx.beginPath();ctx.moveTo(-4.2*scale,6.2*scale);ctx.lineTo(6.5*scale,6.2*scale);ctx.stroke();
      ctx.strokeStyle='#97948c';ctx.lineWidth=.8*scale;ctx.beginPath();ctx.moveTo(5.4*scale,6.2*scale);ctx.lineTo(9.3*scale,6.2*scale);ctx.stroke();
    }
  }

  function drawInfantry(u,state){drawTopDownSoldierAt(u,state,{musket:true});}
  function drawOfficer(u,state){
    drawTopDownSoldierAt(u,state,{scale:1.07,musket:false,plume:'#f0d86b'});
    ctx.strokeStyle='#d4c9a6';ctx.lineWidth=1.15;ctx.beginPath();ctx.moveTo(-2,-6.1);ctx.lineTo(8,-6.1);ctx.stroke();
    ctx.fillStyle='#d2b556';ctx.beginPath();ctx.arc(0,0,1.4,0,Math.PI*2);ctx.fill();
  }
  function drawDrummer(u,state){
    drawTopDownSoldierAt(u,state,{musket:false});
    ctx.fillStyle='#b9843f';ctx.beginPath();ctx.ellipse(-.8,5.8,4.2,2.45,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#ead9ac';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(-.8,5.8,4.2,2.45,0,0,Math.PI*2);ctx.stroke();
  }
  function drawWorker(u,state){
    drawTopDownSoldierAt(u,state,{coat:'#77684f',turnback:'#6d5d46',trousers:'#9c9078',belt:'#b6a98d',shako:'#685642',plume:'#685642',musket:false,scale:.94});
    const swing=['building','gathering'].includes(state)?Math.sin(phase(u,2.0))*1.8:0;
    ctx.strokeStyle='#5a402b';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-1,-5.4);ctx.lineTo(7,-6.4+swing);ctx.stroke();
    ctx.fillStyle='#77736b';ctx.fillRect(6,-7.5+swing,4,2.7);
    if(u.carry>0){ctx.fillStyle=u.carryType==='wood'?'#805a36':'#7f3d46';ctx.beginPath();ctx.ellipse(-4.5,6.2,4,3,0,0,Math.PI*2);ctx.fill();}
  }

  function drawCavalry(u,state){
    const p=palette(u),gallop=['moving','marching','charging','routing'].includes(state);
    const stride=gallop?Math.sin(phase(u,state==='charging'?2.7:1.9))*1.8:0;
    const horse=u.side==='france'?'#5a4434':'#49392f';
    // Horse body, neck, head and tail all lie along +X/-X in true plan view.
    ctx.fillStyle=horse;ctx.beginPath();ctx.ellipse(-1,0,12.4,5.6,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(9.0,0,6.2,3.5,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#3b2d25';ctx.beginPath();ctx.ellipse(14.1,0,3.8,2.8,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#3a2a22';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-12,0);ctx.lineTo(-17,-2);ctx.stroke();
    ctx.fillStyle='#332720';
    for(const [x,y,s] of [[-6,-5,1],[-6,5,-1],[5,-5,-1],[5,5,1]]){
      ctx.beginPath();ctx.ellipse(x+stride*s,y,3.1,1.35,0,0,Math.PI*2);ctx.fill();
    }
    ctx.fillStyle='#6b352d';ctx.beginPath();ctx.ellipse(-1,0,5.5,4.2,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=p.coat;ctx.beginPath();ctx.ellipse(-.2,0,4.0,3.3,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=p.belt;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-3,-2.5);ctx.lineTo(3,2.5);ctx.stroke();
    ctx.fillStyle=p.shako;ctx.beginPath();ctx.ellipse(3.4,0,2.0,2.5,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#b9b0a1';ctx.lineWidth=1.1;ctx.beginPath();ctx.moveTo(-2,-5.3);ctx.lineTo(12,-6.4);ctx.stroke();
  }

  drawUnit=function drawUnitCharacterVisualsV2(u){
    if(u.dead)return;
    if(u.type==='artillery'){legacyDrawUnit(u);return;}
    const state=motionState(u),t=TYPES[u.type];
    ctx.save();ctx.translate(u.x,u.y);ctx.rotate(u.facing||0);
    selectionMarks(u,t.radius);
    if(u.type==='worker')drawWorker(u,state);
    else if(u.type==='officer')drawOfficer(u,state);
    else if(u.type==='drummer')drawDrummer(u,state);
    else if(u.type==='cavalry')drawCavalry(u,state);
    else drawInfantry(u,state);
    ctx.rotate(-(u.facing||0));
    if(u.type!=='worker'){
      ctx.fillStyle='rgba(0,0,0,.38)';ctx.fillRect(-10,-18,20,3);
      ctx.fillStyle=u.morale>55?'#d8d06a':u.morale>25?'#d49a4b':'#b43f38';
      ctx.fillRect(-10,-18,20*Math.max(0,Math.min(1,u.morale/100)),3);
    }
    ctx.restore();
  };

  const api=Object.freeze({
    stateFor:motionState,
    drawTopDownSoldier:drawTopDownSoldierAt,
    supportedTypes:Object.freeze(['worker','infantry','officer','drummer','cavalry']),
    projection:'orthographic-top-down',
    standingSilhouette:true,
    napoleonicUniforms:true,
    version:'character-visuals-v2.1'
  });
  if(nrts.subsystems.has('character-renderer')){
    global.__CHARACTER_VISUALS_V2__=api;
  }else{
    nrts.subsystems.register('character-renderer',api,{phase:'architecture-v2.1',legacyBridge:false,responsibility:'strict top-down standing Napoleonic uniforms and cavalry silhouettes'});
    global.__CHARACTER_VISUALS_V2__=api;
  }
})(window);