'use strict';
// ---------- Architecture v2.1: strict top-down artillery renderer ----------
(function installArtilleryTopDownV1(global){
  const nrts=global.NRTS;
  if(!nrts)throw new Error('NRTS foundation runtime must load before artillery renderer.');
  if(typeof drawBatteryCompositeV061!=='function')throw new Error('Artillery composite renderer must load first.');

  function drawCrew(member,ox,oy,moving){
    const renderer=global.__CHARACTER_VISUALS_V2__;
    ctx.save();ctx.translate(ox,oy);
    if(renderer?.drawTopDownSoldier)renderer.drawTopDownSoldier(member,moving?'marching':'idle',{scale:.92,musket:false});
    else{ctx.fillStyle=member.side==='france'?COLORS.france:COLORS.britain;ctx.beginPath();ctx.arc(0,0,6,0,Math.PI*2);ctx.fill();}
    ctx.restore();
  }

  drawBatteryCompositeV061=function drawBatteryCompositeTopDownV1(cannon,reg){
    if(cannon.side==='britain'&&typeof isVisibleToFrance==='function'&&!isVisibleToFrance(cannon))return;
    const crew=artilleryCrewV06(reg).slice(0,2);
    const facing=cannon.facing||reg.facing||0;
    const moving=!!cannon.batteryMovingV061||batteryMovingV061(reg,cannon);
    const offsets=batteryCrewLocalOffsetsV061(reg,cannon);
    const selected=selectedUnits.has(cannon)||crew.some(member=>selectedUnits.has(member));
    const phase=global.__TOPDOWN_GUN_CREW_V273__?.phaseFor(cannon)||
      {stage:'ready',recoil:0,ram:0,crewShift:0};

    ctx.save();ctx.translate(cannon.x,cannon.y);ctx.rotate(facing);
    if(selected){ctx.strokeStyle=COLORS.selected;ctx.lineWidth=2.2/camera.zoom;ctx.beginPath();ctx.ellipse(-7,0,40,32,0,0,Math.PI*2);ctx.stroke();}

    // Carriage kicks back against the wheels then recovers, while the cannon
    // and crew retain their true simulated world coordinates.
    ctx.save();ctx.translate(-phase.recoil,0);
    // Gun carriage and wheels in orthographic plan view.
    ctx.fillStyle='#654b32';ctx.beginPath();ctx.moveTo(-22,-5);ctx.lineTo(6,-4);ctx.lineTo(12,0);ctx.lineTo(6,4);ctx.lineTo(-22,5);ctx.closePath();ctx.fill();
    ctx.fillStyle='#282522';ctx.beginPath();ctx.ellipse(-3,-10,5.5,2.7,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.ellipse(-3,10,5.5,2.7,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#1b1b1a';ctx.lineWidth=5.5;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(2,0);ctx.lineTo(24,0);ctx.stroke();
    ctx.strokeStyle='#77736b';ctx.lineWidth=1.1;ctx.beginPath();ctx.moveTo(11,-1.6);ctx.lineTo(24,-1.6);ctx.stroke();
    ctx.fillStyle='#4a3728';ctx.beginPath();ctx.arc(-14,0,3.2,0,Math.PI*2);ctx.fill();
    ctx.restore();

    crew.forEach((member,index)=>{
      const off=offsets[index]||{ox:-12,oy:index?-22:22};
      // The first gunner leans in with the sponge/ramrod. The second gunner
      // shifts slightly back when bringing up the cartridge. Visual only.
      const crewX=off.ox+(moving?0:index===0?phase.crewShift:-phase.crewShift*.4);
      drawCrew(member,crewX,off.oy,moving||!!reg.crewApproachV1?.active);
      if(!moving&&phase.ram>0&&index===0){
        const reach=10+11*phase.ram;
        ctx.strokeStyle='#9b855f';ctx.lineWidth=1.4;
        ctx.beginPath();ctx.moveTo(crewX+4,off.oy*.65);
        ctx.lineTo(reach,off.oy>0?2:-2);ctx.stroke();
        ctx.fillStyle='#3c332d';ctx.beginPath();
        ctx.arc(reach,off.oy>0?2:-2,2.0,0,Math.PI*2);ctx.fill();
      }
      if(!moving&&phase.stage==='charge'&&index===1){
        ctx.fillStyle='#c1a778';ctx.beginPath();
        ctx.ellipse(crewX+7,off.oy*.65,4.2,2.8,0,0,Math.PI*2);ctx.fill();
      }
    });

    if(moving&&!reg.crewApproachV1?.active){
      ctx.strokeStyle='rgba(225,218,196,.65)';ctx.lineWidth=1.4;
      for(const off of offsets){ctx.beginPath();ctx.moveTo(off.ox+4,off.oy*.72);ctx.lineTo(-19,off.oy>0?4:-4);ctx.stroke();}
    }

    if(crew.length){
      const morale=crew.reduce((sum,m)=>sum+(m.morale??100),0)/crew.length;
      ctx.fillStyle='rgba(0,0,0,.45)';ctx.fillRect(-20,-35,40,4);
      ctx.fillStyle=morale>55?'#d8d06a':morale>25?'#d49a4b':'#b43f38';ctx.fillRect(-20,-35,40*Math.max(0,Math.min(1,morale/100)),4);
    }
    ctx.restore();
  };

  const api=Object.freeze({version:'artillery-topdown-v1.2',projection:'orthographic-top-down',crewUsesNapoleonicRenderer:true,crewUsesMuskets:false});
  global.__ARTILLERY_TOPDOWN_V1__=api;
  nrts.subsystems.register('artillery-renderer',api,{phase:'architecture-v2.1',legacyBridge:false,responsibility:'strict top-down cannon, carriage and unified crew rendering'});
})(window);
