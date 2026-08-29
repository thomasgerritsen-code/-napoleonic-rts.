'use strict';
// ---------- Architecture v2: Combat Animations v1 ----------
(function installCombatAnimations(global){
  const nrts=global.NRTS;
  if(!nrts) throw new Error('NRTS foundation runtime must load before combat animations.');

  const visualEvents=[];
  const baseFire=fire;
  const baseApplyDamage=applyDamage;
  const baseDrawUnit=drawUnit;
  const baseDrawParticles=drawParticles;

  function mark(u,kind,duration){
    if(!u||u.kind!=='unit')return;
    u.combatVisualV1={kind,started:elapsed,duration};
  }
  function active(u){
    const a=u?.combatVisualV1;
    if(!a)return null;
    const age=elapsed-a.started;
    return age>=0&&age<a.duration?{...a,age,t:age/a.duration}:null;
  }

  fire=function fireCombatAnimationsV1(unit,enemy){
    if(unit.type==='artillery')mark(unit,'artillery-fire',1.15);
    else if(unit.type==='infantry'||unit.type==='officer')mark(unit,unit.attackMode==='bayonet'?'bayonet-strike':'musket-fire',Math.max(.55,TYPES[unit.type].reload*.92));
    else if(unit.type==='cavalry')mark(unit,'cavalry-strike',.7);
    return baseFire(unit,enemy);
  };

  applyDamage=function applyDamageCombatAnimationsV1(victim,damage,shock=8){
    const alive=Boolean(victim&&victim.kind==='unit'&&!victim.dead);
    const snapshot=alive?{x:victim.x,y:victim.y,facing:victim.facing||0,side:victim.side,type:victim.type}:null;
    const result=baseApplyDamage(victim,damage,shock);
    if(snapshot&&victim.dead){
      visualEvents.push({...snapshot,kind:'fall',born:elapsed,life:3.2});
    }else if(alive&&victim.recentHit>0){
      mark(victim,'hit-reaction',.34);
    }
    return result;
  };

  function visualOffset(u,a){
    if(!a)return 0;
    if(a.kind==='musket-fire')return -Math.sin(Math.min(1,a.age/.14)*Math.PI)*2.4;
    if(a.kind==='artillery-fire')return -Math.sin(Math.min(1,a.age/.28)*Math.PI)*7;
    if(a.kind==='hit-reaction')return -Math.sin(a.t*Math.PI)*2;
    return 0;
  }

  function drawCombatOverlay(u,a){
    if(!a&&!((u.attackMode==='bayonet')||(u.type==='cavalry'&&(u.chargeTimer||0)>0)))return;
    ctx.save();ctx.translate(u.x,u.y);ctx.rotate(u.facing||0);

    if(u.attackMode==='bayonet'&&u.type==='infantry'){
      ctx.strokeStyle='#b9bcc0';ctx.lineWidth=1.05;
      ctx.beginPath();ctx.moveTo(15,-1);ctx.lineTo(21,-1);ctx.stroke();
    }
    if(u.type==='cavalry'&&(u.chargeTimer||0)>0){
      ctx.strokeStyle='#d2d0c8';ctx.lineWidth=1.35;
      ctx.beginPath();ctx.moveTo(1,-5);ctx.lineTo(17,-8);ctx.stroke();
    }
    if(a?.kind==='musket-fire'&&a.age<.12){
      const f=1-a.age/.12;
      ctx.fillStyle=`rgba(255,220,126,${.85*f})`;
      ctx.beginPath();ctx.moveTo(16,-1);ctx.lineTo(23,-4);ctx.lineTo(21,-1);ctx.lineTo(23,2);ctx.closePath();ctx.fill();
    }
    if(a?.kind==='musket-fire'&&a.age>.34&&a.age<a.duration*.86){
      const p=(a.age-.34)/Math.max(.1,a.duration*.86-.34);
      const ram=8+Math.sin(p*Math.PI)*7;
      ctx.strokeStyle='#a68c65';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(4,1);ctx.lineTo(ram,-7);ctx.stroke();
    }
    if(a?.kind==='artillery-fire'&&a.age<.18){
      ctx.fillStyle='rgba(255,212,112,.8)';ctx.beginPath();ctx.arc(15,-2,4.5*(1-a.age/.18),0,Math.PI*2);ctx.fill();
    }
    if(a?.kind==='cavalry-strike'){
      const swing=Math.sin(a.t*Math.PI)*.7;
      ctx.rotate(-swing);
      ctx.strokeStyle='#d4d1c7';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(0,-6);ctx.lineTo(15,-9);ctx.stroke();
    }
    ctx.restore();
  }

  drawUnit=function drawUnitCombatAnimationsV1(u){
    if(u.dead)return;
    const a=active(u),offset=visualOffset(u,a);
    if(Math.abs(offset)>.01){
      const ox=u.x,oy=u.y;
      u.x+=Math.cos(u.facing||0)*offset;u.y+=Math.sin(u.facing||0)*offset;
      baseDrawUnit(u);
      u.x=ox;u.y=oy;
    }else baseDrawUnit(u);
    drawCombatOverlay(u,a);
  };

  function drawFalls(){
    for(let i=visualEvents.length-1;i>=0;i--){
      const e=visualEvents[i],age=elapsed-e.born;
      if(age>=e.life){visualEvents.splice(i,1);continue;}
      const t=Math.min(1,age/.42),alpha=Math.min(.72,(e.life-age)*.7);
      ctx.save();ctx.globalAlpha=alpha;ctx.translate(e.x,e.y);ctx.rotate(e.facing+t*Math.PI*.42);
      ctx.fillStyle=e.side==='france'?'#244d9a':'#a5322f';
      if(e.type==='cavalry'){
        ctx.fillStyle='#564334';ctx.beginPath();ctx.ellipse(0,2,11,5.2,.25,0,Math.PI*2);ctx.fill();
      }
      ctx.fillStyle=e.side==='france'?'#244d9a':'#a5322f';ctx.beginPath();ctx.ellipse(0,0,5,7,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#d1a784';ctx.beginPath();ctx.arc(0,-7,2.5,0,Math.PI*2);ctx.fill();
      ctx.restore();
    }
  }

  drawParticles=function drawParticlesCombatAnimationsV1(){
    baseDrawParticles();
    drawFalls();
  };

  const api=Object.freeze({
    version:'combat-animations-v1',
    eventCount:()=>visualEvents.length,
    animationFor:u=>active(u),
    features:Object.freeze(['musket-fire','reload','bayonet','cavalry-charge','artillery-recoil','hit-reaction','death-fall'])
  });
  nrts.subsystems.register('combat-animations',api,{
    phase:'architecture-v2',legacyBridge:false,
    responsibility:'visual-only combat event animation synchronized to simulation fire and damage events'
  });
  global.__COMBAT_ANIMATIONS_V1__=api;
})(window);
