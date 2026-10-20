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
    // Actual physical displacement wins over distant formation targets.
    // Without this, blocked bridge followers run in place indefinitely.
    if(global.__TOPDOWN_MARCH_V262__?.samplesFor(u)){
      return global.__TOPDOWN_MARCH_V262__.isMoving(u)?(u.marchingV064?'marching':'moving'):'idle';
    }
    const d=Math.hypot((u.targetX??u.x)-u.x,(u.targetY??u.y)-u.y);
    if(d>4)return u.marchingV064?'marching':'moving';
    return'idle';
  }
  function phase(u,speed=1){
    const renderTime=global.__NRTS_RENDER_CLOCK_V312__?.simulationTime ?? elapsed;
    return(renderTime*speed+(u.id%11)*.37)*Math.PI*2;
  }
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

  function marchingAnimationAmplitude(marching,speed){
    if(!marching)return 0;
    return .65+Math.min(.5,speed/100);
  }

  function clampMusket01(v){return Math.max(0,Math.min(1,v));}
  function smoothMusket01(v){
    const t=clampMusket01(v);
    return t*t*(3-2*t);
  }
  function musketPose(u){
    const aim=()=>global.__TOPDOWN_VOLLEY_V271__?.preFirePose(u)||
      {phase:'carry',shoulder:0,recoil:0,ramrod:0};
    const anim=global.__COMBAT_ANIMATIONS_V1__?.animationFor(u);
    // The combat marker normally expires slightly before the real randomized
    // reload timer (0.90–1.15 times the unit's base reload). Continue only
    // the weapon motion from that marker until the actual reload completes.
    const marker=u?.combatVisualV1;
    const pending=Number.isFinite(u?.reload)&&u.reload>0;
    const afterEvent=marker?.kind==='musket-fire'&&pending&&
      Number.isFinite(marker.started)&&elapsed>=marker.started&&
      elapsed-marker.started<Math.max(5,TYPES[u.type]?.reload*1.35||0);
    const shot=anim?.kind==='musket-fire'?anim:
      afterEvent?{age:elapsed-marker.started}:null;
    if(!shot)return aim();

    const age=Math.max(0,Number(shot.age)||0);
    // The first instant is exactly the real shot: no artificial staggered
    // muzzle flashes. Only the recovery spring varies by a few milliseconds.
    const rebound=.18+((Number(u.id)||0)%5)*.007;
    if(age<rebound){
      return{phase:'fire',shoulder:1,
        recoil:Math.sin(Math.PI*age/rebound),ramrod:0};
    }
    if(age<.5){
      return{phase:'lower',shoulder:1-.86*smoothMusket01(
        (age-rebound)/(.5-rebound)),recoil:0,ramrod:0};
    }

    // Recover, take a cartridge, ram, then shoulder again according to the
    // *live* reload value. Never render a fully ready gun while reloading.
    const remaining=Math.max(0,Number(u.reload)||0);
    const cycle=Math.max(.6,age+remaining);
    const p=clampMusket01(age/cycle);
    if(p<.84){
      const ramPhase=clampMusket01((p-.47)/.29);
      const ramrod=(p>=.47&&p<=.76)?Math.sin(Math.PI*ramPhase):0;
      return{phase:'reload',shoulder:.14+.045*Math.sin(p*Math.PI),
        recoil:0,ramrod};
    }
    return{phase:'ready',shoulder:.14+.86*smoothMusket01(
      (p-.84)/.16),recoil:0,ramrod:0};
  }

  // v278: the two arm chains and single ramrod are owned by the character
  // renderer alone. All positions are local top-down coordinates; they are
  // deterministic drawings, never positions fed back into the simulation.
  function musketHands(u,pose){
    const shoulder=clampMusket01(pose.shoulder||0);
    const barrel=shoulder*7;
    const gunY=6.05-3.75*shoulder+(pose.recoil||0)*.3;
    const marker=u?.combatVisualV1;
    const age=marker?.kind==='musket-fire'&&Number.isFinite(marker.started)?
      Math.max(0,elapsed-marker.started):0;
    const remaining=Math.max(0,Number(u?.reload)||0);
    const reloadProgress=clampMusket01(age/Math.max(.6,age+remaining));
    // The left hand reaches the cartridge pouch, then travels back to the
    // barrel. The other hand keeps a firm grip; both meet the weapon again.
    const cartridge=pose.phase==='reload'?
      Math.max(0,1-Math.abs(reloadProgress-.30)/.18):0;
    const ram=clampMusket01(pose.ramrod||0);
    const individuality=(((Number(u?.id)||0)%5)-2)*.13;
    return{
      support:{
        elbowX:.8+shoulder*.8,elbowY:-4.7+cartridge*.65,
        handX:3+barrel*.33-cartridge*5.0+ram*2+individuality,
        handY:gunY-cartridge*3.6
      },
      trigger:{
        elbowX:1.0+shoulder*.9,elbowY:4.7-cartridge*.4,
        handX:6+barrel*.52-cartridge*1.8+ram*.6,
        handY:gunY+cartridge*.65
      },
      cartridge,ramrod:ram
    };
  }

  // Orthographic standing silhouette. A standing person must stay compact in plan view:
  // shoulders dominate, the enlarged head overlaps the torso and only the feet peek out
  // behind it. Long head-to-foot stacking reads as a prone/crawling body and is avoided.
  function drawTopDownSoldierAt(u,state,opts={}){
    const p=palette(u),scale=opts.scale||1;
    const marching=['moving','marching','routing','carrying'].includes(state);
    const speed=global.__TOPDOWN_MARCH_V262__?.speedFor(u)||0;
    // One shared gait phase per soldier, fast enough for marching but bounded.
    const cadence=1.6+Math.min(.65,speed/150);
    const amplitude=marchingAnimationAmplitude(marching,speed);
    const stridePhase=phase(u,cadence);
    const gait=Math.sin(stridePhase)*.85*scale*amplitude;
    const armSwing=Math.sin(stridePhase+Math.PI/2)*.55*scale*amplitude;
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

    // v1.1.2: larger head moved rearward into the shoulder mass. This keeps facing
    // readable without making the soldier look stretched out along the ground.
    ctx.fillStyle='#c89d79';ctx.beginPath();ctx.arc(2.15*scale,0,2.85*scale,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=opts.shako||p.shako;ctx.beginPath();ctx.ellipse(3.05*scale,0,2.6*scale,3.35*scale,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='rgba(238,232,216,.65)';ctx.lineWidth=.65*scale;ctx.beginPath();ctx.moveTo(3.1*scale,-2.85*scale);ctx.lineTo(3.1*scale,2.85*scale);ctx.stroke();
    ctx.fillStyle=opts.plume||p.plume;ctx.beginPath();ctx.arc(4.75*scale,-1.7*scale,1.05*scale,0,Math.PI*2);ctx.fill();

    if(opts.musket!==false){
      // Articulated musket: shoulder the weapon for the shot, absorb recoil,
      // lower it for cartridge work, ram the charge, and return to carry.
      // These are render-only transforms; no combat timing or physics change.
      const pose=musketPose(u);
      const hands=musketHands(u,pose);
      // Slight stock kick and a smoothly lowering barrel; only drawn, never
      // applied to the unit's position, facing or gameplay hit calculation.
      const y=(6.05-3.75*pose.shoulder+pose.recoil*.3)*scale;
      const recoil=(pose.recoil*2.8)*scale;
      const barrel=pose.shoulder*7;
      ctx.lineCap='round';
      ctx.strokeStyle='#493322';ctx.lineWidth=1.6*scale;
      ctx.beginPath();ctx.moveTo((-4.5-recoil)*scale,y);ctx.lineTo((7+barrel-recoil)*scale,y);ctx.stroke();
      ctx.strokeStyle='#a9aaa5';ctx.lineWidth=1.05*scale;
      ctx.beginPath();ctx.moveTo((5+barrel-recoil)*scale,y);ctx.lineTo((9.7+barrel-recoil)*scale,y);ctx.stroke();
      // Shoulder-to-elbow coat and elbow-to-hand flesh form two readable
      // articulated arms. A single left-hand cartridge gesture replaces the
      // old overlapping, floating lines from effects/overlay renderers.
      ctx.strokeStyle=coat;ctx.lineWidth=2.25*scale;
      ctx.beginPath();
      ctx.moveTo(-.5*scale,-3.7*scale);
      ctx.lineTo(hands.support.elbowX*scale,hands.support.elbowY*scale);
      ctx.moveTo(1.3*scale,4.6*scale);
      ctx.lineTo(hands.trigger.elbowX*scale,hands.trigger.elbowY*scale);
      ctx.stroke();
      ctx.strokeStyle='#cda585';ctx.lineWidth=1.4*scale;
      ctx.beginPath();
      ctx.moveTo(hands.support.elbowX*scale,hands.support.elbowY*scale);
      ctx.lineTo(hands.support.handX*scale,hands.support.handY*scale);
      ctx.moveTo(hands.trigger.elbowX*scale,hands.trigger.elbowY*scale);
      ctx.lineTo(hands.trigger.handX*scale,hands.trigger.handY*scale);
      ctx.stroke();
      // One loading hand grips a cartridge near the belt, rendered only
      // during its own brief reload phase.
      if(hands.cartridge>.1){
        ctx.fillStyle='#ad9981';
        ctx.beginPath();ctx.arc(hands.support.handX*scale,
          hands.support.handY*scale,.85*hands.cartridge*scale,0,Math.PI*2);
        ctx.fill();
      }
      if(hands.ramrod>0){
        ctx.strokeStyle='#b5b2a6';ctx.lineWidth=.85*scale;
        const reach=4+Math.sin(hands.ramrod*Math.PI)*6;
        ctx.beginPath();
        ctx.moveTo((reach-2)*scale,y-4*scale);
        ctx.lineTo((reach+7)*scale,y-4*scale);
        ctx.stroke();
      }
    }
  }

  function drawInfantry(u,state){drawTopDownSoldierAt(u,state,{musket:true});}
  function drawOfficer(u,state){
    drawTopDownSoldierAt(u,state,{scale:1.08,musket:false,plume:'#f0d86b'});
    // Officer sabre stays close to the shoulder line so the unit remains compact.
    ctx.strokeStyle='#d4c9a6';ctx.lineWidth=1.15;ctx.beginPath();ctx.moveTo(-1.5,-5.4);ctx.lineTo(7.5,-5.4);ctx.stroke();
    ctx.fillStyle='#d2b556';ctx.beginPath();ctx.arc(.8,0,1.45,0,Math.PI*2);ctx.fill();
  }
  function drawDrummer(u,state){
    drawTopDownSoldierAt(u,state,{musket:false});
    ctx.fillStyle='#b9843f';ctx.beginPath();ctx.ellipse(-.6,5.35,4.3,2.55,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#ead9ac';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(-.6,5.35,4.3,2.55,0,0,Math.PI*2);ctx.stroke();
  }
  function drawWorker(u,state){
    drawTopDownSoldierAt(u,state,{coat:'#77684f',turnback:'#6d5d46',trousers:'#9c9078',belt:'#b6a98d',shako:'#685642',plume:'#685642',musket:false,scale:.95});
    const swing=['building','gathering'].includes(state)?Math.sin(phase(u,2.0))*1.7:0;
    // Tool is kept near the shoulder rather than extending the visual body axis.
    ctx.strokeStyle='#5a402b';ctx.lineWidth=1.45;ctx.beginPath();ctx.moveTo(-.5,-4.9);ctx.lineTo(6.8,-5.9+swing);ctx.stroke();
    ctx.fillStyle='#77736b';ctx.fillRect(5.8,-7.0+swing,3.8,2.5);
    if(u.carry>0){ctx.fillStyle=u.carryType==='wood'?'#805a36':'#7f3d46';ctx.beginPath();ctx.ellipse(-4.2,5.7,3.8,2.9,0,0,Math.PI*2);ctx.fill();}
  }

  function drawCavalry(u,state){
    const p=palette(u),gallop=['moving','marching','charging','routing'].includes(state);
    const speed=global.__TOPDOWN_MARCH_V262__?.speedFor(u)||0;
    const charge=state==='charging';
    const momentum=global.__CAVALRY_ARTILLERY_V1__?.momentum?.(u)||0;
    // Hoof rhythm rises from walk to canter/charge, but a horse that has
    // stopped in front of a bridge does not keep galloping in place.
    const physicallyMoving=speed>2.5;
    const cadence=1.45+Math.min(1.7,speed/130)+(charge?.45:0);
    const stride=physicallyMoving&&gallop?
      Math.sin(phase(u,cadence))*(1.15+Math.min(1.15,speed/135)+momentum*.25):0;
    const horse=u.side==='france'?'#5a4434':'#49392f';
    // Horse body, neck, head and tail all lie along +X/-X in true plan view.
    ctx.fillStyle=horse;ctx.beginPath();ctx.ellipse(-1,0,12.4,5.8,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(8.8,0,6.0,3.6,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#3b2d25';ctx.beginPath();ctx.ellipse(13.8,0,3.8,2.9,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#3a2a22';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-12.2,0);ctx.lineTo(-16.8,-2);ctx.stroke();
    ctx.fillStyle='#332720';
    for(const [x,y,s] of [[-6.5,-5,1],[-6.5,5,-1],[4.8,-5,-1],[4.8,5,1]]){
      ctx.beginPath();ctx.ellipse(x+stride*s,y,2.8,1.25,0,0,Math.PI*2);ctx.fill();
    }

    // Saddle and compact upright rider mass.
    ctx.fillStyle='#6b352d';ctx.beginPath();ctx.ellipse(-1.2,0,5.6,4.4,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=p.coat;ctx.beginPath();ctx.ellipse(0,0,4.3,3.55,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=p.belt;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-2.8,-2.4);ctx.lineTo(2.8,2.4);ctx.stroke();

    // v1.1.2: rider gets the same larger/rearward head logic as troops on foot.
    // The skin circle is intentionally visible around the shako to read as a person.
    ctx.fillStyle='#c89d79';ctx.beginPath();ctx.arc(1.85,0,2.0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=p.shako;ctx.beginPath();ctx.ellipse(2.75,0,1.95,2.55,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=p.plume;ctx.beginPath();ctx.arc(4.05,-1.05,.78,0,Math.PI*2);ctx.fill();

    // Shorter sabre/carbine accent keeps rider readable without stretching silhouette.
    ctx.strokeStyle='#b9b0a1';ctx.lineWidth=1.1;ctx.beginPath();ctx.moveTo(-1.5,-5.15);ctx.lineTo(9.8,-5.9);ctx.stroke();
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
    enlargedRearwardHead:true,
    cavalryRiderHead:true,
    napoleonicUniforms:true,
    musketPose,
    musketHands,
    version:'character-visuals-v2.5'
  });
  if(nrts.subsystems.has('character-renderer')){
    global.__CHARACTER_VISUALS_V2__=api;
  }else{
    nrts.subsystems.register('character-renderer',api,{phase:'architecture-v2.1',legacyBridge:false,responsibility:'strict top-down standing Napoleonic uniforms and cavalry silhouettes'});
    global.__CHARACTER_VISUALS_V2__=api;
  }
})(window);