'use strict';
// ---------- Architecture v2: Combat Animations v1 ----------
(function installCombatAnimations(global){
  const nrts=global.NRTS;
  if(!nrts) throw new Error('NRTS foundation runtime must load before combat animations.');

  const visualEvents=[];
  const smokeEvents=[];
  const lastVolleyByRegiment=new Map();
  const MAX_SMOKE_EVENTS=80;
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

  function addSmokeEvent(unit,kind){
    if(!unit)return;
    const facing=unit.facing||0;
    const muzzle=kind==='artillery'?19:18;
    const x=unit.x+Math.cos(facing)*muzzle;
    const y=unit.y+Math.sin(facing)*muzzle;
    const regimentKey=kind==='musket'&&unit.regimentId?unit.regimentId:null;
    const previous=regimentKey?lastVolleyByRegiment.get(regimentKey):null;
    if(previous&&elapsed-previous.born<=.22){
      const count=Math.min(36,previous.count+1);
      previous.x+=(x-previous.x)/count;
      previous.y+=(y-previous.y)/count;
      previous.count=count;
      previous.lastShot=elapsed;
      return;
    }
    const event={
      kind,x,y,facing,born:elapsed,lastShot:elapsed,count:1,
      life:kind==='artillery'?4.4:3.35,
      seed:((unit.id||1)*2654435761)>>>0
    };
    smokeEvents.push(event);
    if(regimentKey)lastVolleyByRegiment.set(regimentKey,event);
    if(smokeEvents.length>MAX_SMOKE_EVENTS)smokeEvents.splice(0,smokeEvents.length-MAX_SMOKE_EVENTS);
  }

  fire=function fireCombatAnimationsV1(unit,enemy){
    if(unit.type==='artillery'){
      mark(unit,'artillery-fire',1.15);
      addSmokeEvent(unit,'artillery');
    }else if(unit.type==='infantry'||unit.type==='officer'){
      const bayonet=unit.attackMode==='bayonet';
      mark(unit,bayonet?'bayonet-strike':'musket-fire',Math.max(.55,TYPES[unit.type].reload*.92));
      if(!bayonet)addSmokeEvent(unit,'musket');
    }else if(unit.type==='cavalry')mark(unit,'cavalry-strike',.7);
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

  function seededOffset(seed,index){
    const n=(Math.imul((seed^(index*374761393))>>>0,668265263)>>>0)/4294967295;
    return n*2-1;
  }

  function drawSmoke(){
    for(let i=smokeEvents.length-1;i>=0;i--){
      const e=smokeEvents[i],age=elapsed-e.born;
      if(age>=e.life){smokeEvents.splice(i,1);continue;}
      const t=Math.max(0,Math.min(1,age/e.life));
      const fade=Math.pow(1-t,1.45);
      const artillery=e.kind==='artillery';
      const lobeCount=artillery?7:Math.min(7,3+Math.ceil(e.count/7));
      const forward=(artillery?24:12)*t;
      const spread=(artillery?28:16)*(0.35+t*.9)+Math.min(18,e.count*.45);
      const baseRadius=(artillery?9:5.5)+(artillery?24:14)*t+Math.min(8,e.count*.22);
      const fx=Math.cos(e.facing),fy=Math.sin(e.facing),px=-fy,py=fx;
      ctx.save();
      for(let l=0;l<lobeCount;l++){
        const lateral=seededOffset(e.seed,l)*spread;
        const along=forward+seededOffset(e.seed^0x9e3779b9,l)*spread*.45;
        const radius=baseRadius*(.72+(seededOffset(e.seed^0x85ebca6b,l)+1)*.18);
        const alpha=fade*(artillery?.17:.12)*(1-Math.min(.45,l*.045));
        ctx.fillStyle=`rgba(210,207,194,${alpha})`;
        ctx.beginPath();
        ctx.arc(e.x+fx*along+px*lateral,e.y+fy*along+py*lateral,radius,0,Math.PI*2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

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
    drawSmoke();
    drawFalls();
  };

  function smokeStats(){
    let musketClouds=0,artilleryClouds=0,maxPooledShots=0;
    for(const e of smokeEvents){
      if(e.kind==='artillery')artilleryClouds+=1;else musketClouds+=1;
      maxPooledShots=Math.max(maxPooledShots,e.count||1);
    }
    return {active:smokeEvents.length,musketClouds,artilleryClouds,maxPooledShots,cap:MAX_SMOKE_EVENTS};
  }

  const api=Object.freeze({
    version:'combat-animations-v1.1',
    eventCount:()=>visualEvents.length,
    animationFor:u=>active(u),
    smokeStats,
    features:Object.freeze(['musket-fire','reload','bayonet','cavalry-charge','artillery-recoil','hit-reaction','death-fall','pooled-volley-smoke','artillery-smoke'])
  });
  nrts.subsystems.register('combat-animations',api,{
    phase:'architecture-v2',legacyBridge:false,
    responsibility:'visual-only combat event animation and pooled black-powder smoke synchronized to simulation fire and damage events'
  });
  global.__COMBAT_ANIMATIONS_V1__=api;
})(window);
