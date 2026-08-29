'use strict';
// ---------- Architecture v2: Character Visuals v1 ----------
(function installCharacterRenderer(global){
  const nrts=global.NRTS;
  if(!nrts) throw new Error('NRTS foundation runtime must load before character renderer.');

  const legacyDrawUnit=drawUnit;

  function motionState(u){
    if(u.routing) return 'routing';
    if(u.type==='worker'){
      if(u.task==='build') return 'building';
      if(u.task==='gather') return 'gathering';
      if(u.task==='return'&&u.carry>0) return 'carrying';
    }
    if(u.type==='cavalry'&&(u.chargeTimer||0)>0) return 'charging';
    const d=Math.hypot((u.targetX??u.x)-u.x,(u.targetY??u.y)-u.y);
    if(d>4) return u.marchingV064?'marching':'moving';
    return 'idle';
  }

  function phase(u,speed=1){
    return (elapsed*speed + (u.id%11)*0.37) * Math.PI*2;
  }

  function bodyPalette(u){
    if(u.routing) return {coat:'#77756f',trim:'#99958d'};
    return u.side==='france'
      ? {coat:'#244d9a',trim:'#d9e3f5'}
      : {coat:'#a5322f',trim:'#f0d7d1'};
  }

  function selectionMarks(u,radius){
    if(selectedUnits.has(u)){
      ctx.strokeStyle=COLORS.selected;ctx.lineWidth=2/camera.zoom;
      ctx.beginPath();ctx.arc(0,0,radius+6,0,Math.PI*2);ctx.stroke();
    }
    if(u.regimentId){
      ctx.strokeStyle='rgba(244,216,109,.55)';ctx.lineWidth=1/camera.zoom;
      ctx.beginPath();ctx.arc(0,0,radius+3,0,Math.PI*2);ctx.stroke();
    }
  }

  function drawLegs(state,u,scale=1){
    const moving=['moving','marching','routing','charging','carrying'].includes(state);
    const swing=moving?Math.sin(phase(u,state==='charging'?2.4:1.55))*3.2*scale:0;
    ctx.strokeStyle='#3a3028';ctx.lineWidth=2.2*scale;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(-2*scale,2*scale);ctx.lineTo(-3*scale+swing,8*scale);ctx.stroke();
    ctx.beginPath();ctx.moveTo(2*scale,2*scale);ctx.lineTo(3*scale-swing,8*scale);ctx.stroke();
  }

  function drawHumanCore(u,state,opts={}){
    const p=bodyPalette(u),scale=opts.scale||1;
    const bob=['moving','marching','routing','charging','carrying'].includes(state)?Math.sin(phase(u,1.55))*0.65:0;
    ctx.save();ctx.translate(0,bob);
    drawLegs(state,u,scale);
    ctx.fillStyle=opts.coat||p.coat;
    ctx.beginPath();ctx.ellipse(0,0,4.5*scale,6.2*scale,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=opts.crossbelt||p.trim;
    ctx.fillRect(-.8*scale,-5*scale,1.6*scale,9.5*scale);
    ctx.fillStyle='#d8b08d';
    ctx.beginPath();ctx.arc(0,-7.1*scale,2.7*scale,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }

  function drawMusket(u,state){
    const aim=state==='idle'&&u.type==='infantry';
    const bob=['moving','marching','routing'].includes(state)?Math.sin(phase(u,1.55))*0.6:0;
    ctx.save();ctx.translate(0,bob);
    ctx.strokeStyle='#4b3526';ctx.lineWidth=1.6;ctx.lineCap='round';
    ctx.beginPath();
    if(aim){ctx.moveTo(1,-1);ctx.lineTo(15,-1);}else{ctx.moveTo(2,1);ctx.lineTo(12,-7);}
    ctx.stroke();
    ctx.strokeStyle='#8c8b86';ctx.lineWidth=.9;
    ctx.beginPath();if(aim){ctx.moveTo(14,-1);ctx.lineTo(18,-1);}else{ctx.moveTo(12,-7);ctx.lineTo(15,-10);}ctx.stroke();
    ctx.restore();
  }

  function drawInfantry(u,state){
    drawHumanCore(u,state);
    drawMusket(u,state);
    ctx.fillStyle=u.side==='france'?'#26334b':'#22262a';
    ctx.fillRect(-3.3,-10.3,6.6,2.3);
  }

  function drawOfficer(u,state){
    drawHumanCore(u,state,{scale:1.08});
    ctx.fillStyle='#d7bc57';ctx.beginPath();ctx.moveTo(-4,-9);ctx.lineTo(0,-12.7);ctx.lineTo(4,-9);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#d8d3c7';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(3,-1);ctx.lineTo(13,1);ctx.stroke();
  }

  function drawDrummer(u,state){
    drawHumanCore(u,state);
    const beat=Math.sin(phase(u,2.2));
    ctx.fillStyle='#b9823f';ctx.fillRect(-5,2,10,6);
    ctx.strokeStyle='#ead9ac';ctx.lineWidth=1;ctx.strokeRect(-5,2,10,6);
    ctx.strokeStyle='#d9c598';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-3,-1);ctx.lineTo(-5+beat,4);ctx.stroke();ctx.beginPath();ctx.moveTo(3,-1);ctx.lineTo(5-beat,4);ctx.stroke();
  }

  function drawWorker(u,state){
    drawHumanCore(u,state,{coat:'#7b684d',crossbelt:'#b8a27d'});
    const workSwing=['building','gathering'].includes(state)?Math.sin(phase(u,2.0)):0;
    ctx.strokeStyle='#5a402b';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(2,-1);ctx.lineTo(9,-7+workSwing*4);ctx.stroke();
    if(state==='building'){
      ctx.fillStyle='#8a8b84';ctx.fillRect(8,-9+workSwing*4,4,3);
    }else if(state==='gathering'){
      ctx.fillStyle='#77736b';ctx.beginPath();ctx.moveTo(8,-9+workSwing*4);ctx.lineTo(12,-7+workSwing*4);ctx.lineTo(9,-5+workSwing*4);ctx.closePath();ctx.fill();
    }
    if(u.carry>0){
      ctx.fillStyle=u.carryType==='wood'?'#805a36':'#c6a252';
      ctx.beginPath();ctx.ellipse(-6,0,4,6,0,0,Math.PI*2);ctx.fill();
    }
  }

  function drawCavalry(u,state){
    const gallop=['moving','marching','charging','routing'].includes(state);
    const stride=gallop?Math.sin(phase(u,state==='charging'?2.6:1.8))*2.2:0;
    ctx.fillStyle='#5b4635';ctx.beginPath();ctx.ellipse(-1,1,10.8,5.6,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#443225';ctx.beginPath();ctx.ellipse(8,-1,4.5,3.5,-.15,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#3a2a20';ctx.lineWidth=1.8;
    for(const s of[-1,1]){ctx.beginPath();ctx.moveTo(-5,s*2);ctx.lineTo(-8+stride*s,8);ctx.stroke();ctx.beginPath();ctx.moveTo(4,s*2);ctx.lineTo(7-stride*s,8);ctx.stroke();}
    ctx.save();ctx.translate(-1,-4);drawHumanCore(u,state,{scale:.82});ctx.restore();
    ctx.strokeStyle='#b8b0a2';ctx.lineWidth=1.1;ctx.beginPath();ctx.moveTo(2,-5);ctx.lineTo(14,-7);ctx.stroke();
  }

  drawUnit=function drawUnitCharacterVisualsV1(u){
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
      ctx.fillStyle='rgba(0,0,0,.42)';ctx.fillRect(-10,-18,20,3);
      ctx.fillStyle=u.morale>55?'#d8d06a':u.morale>25?'#d49a4b':'#b43f38';
      ctx.fillRect(-10,-18,20*Math.max(0,Math.min(1,u.morale/100)),3);
    }
    ctx.restore();
  };

  const api=Object.freeze({
    stateFor:motionState,
    supportedTypes:Object.freeze(['worker','infantry','officer','drummer','cavalry']),
    version:'character-visuals-v1'
  });
  nrts.subsystems.register('character-renderer',api,{
    phase:'architecture-v2',legacyBridge:false,
    responsibility:'top-down human silhouettes and state-driven character animation'
  });
  global.__CHARACTER_VISUALS_V1__=api;
})(window);
