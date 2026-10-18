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

  function mark(u,kind,duration){if(!u||u.kind!=='unit')return;u.combatVisualV1={kind,started:elapsed,duration,age:0,t:0};}
  function active(u){const a=u?.combatVisualV1;if(!a)return null;const age=elapsed-a.started;if(age<0||age>=a.duration)return null;a.age=age;a.t=age/a.duration;return a;}

  function addSmokeEvent(unit,kind){
    if(!unit)return;
    const facing=unit.facing||0,muzzle=kind==='artillery'?19:20;
    // Flintlock barrel runs along +X in the 2D character renderer; muzzle
    // sits slightly to the soldier's right, not at the middle of the shako.
    const lateral=kind==='artillery'?0:2.3;
    const x=unit.x+Math.cos(facing)*muzzle-Math.sin(facing)*lateral;
    const y=unit.y+Math.sin(facing)*muzzle+Math.cos(facing)*lateral;
    const regimentKey=kind==='musket'&&unit.regimentId?unit.regimentId:null;
    const previous=regimentKey?lastVolleyByRegiment.get(regimentKey):null;
    if(previous&&elapsed-previous.lastShot<=.48&&elapsed-previous.born<=2.8&&elapsed-previous.born<previous.life){
      const count=Math.min(48,previous.count+1),weight=Math.min(12,count);
      previous.x+=(x-previous.x)/weight;previous.y+=(y-previous.y)/weight;
      previous.facing+=(Math.atan2(Math.sin(facing-previous.facing),Math.cos(facing-previous.facing)))/weight;
      previous.count=count;previous.lastShot=elapsed;
      previous.life=Math.min(8.2,Math.max(previous.life,elapsed-previous.born+6.1));
      return;
    }
    const event={kind,x,y,facing,born:elapsed,lastShot:elapsed,count:1,
      life:kind==='artillery'?7.1:6.1,seed:((unit.id||1)*2654435761)>>>0,
      driftX:0,driftY:0,driftAt:elapsed};
    smokeEvents.push(event);if(regimentKey)lastVolleyByRegiment.set(regimentKey,event);
    if(smokeEvents.length>MAX_SMOKE_EVENTS)smokeEvents.splice(0,smokeEvents.length-MAX_SMOKE_EVENTS);
  }

  fire=function fireCombatAnimationsV1(unit,enemy){
    if(unit.type==='artillery'){mark(unit,'artillery-fire',1.15);addSmokeEvent(unit,'artillery');}
    else if(unit.type==='infantry'||unit.type==='officer'){const bayonet=unit.attackMode==='bayonet';mark(unit,bayonet?'bayonet-strike':'musket-fire',Math.max(.55,TYPES[unit.type].reload*.92));if(!bayonet)addSmokeEvent(unit,'musket');}
    else if(unit.type==='cavalry')mark(unit,'cavalry-strike',.7);
    return baseFire(unit,enemy);
  };

  applyDamage=function applyDamageCombatAnimationsV1(victim,damage,shock=8){
    const alive=Boolean(victim&&victim.kind==='unit'&&!victim.dead),snapshot=alive?{id:victim.id,x:victim.x,y:victim.y,facing:victim.facing||0,side:victim.side,type:victim.type}:null;
    const result=baseApplyDamage(victim,damage,shock);
    if(snapshot&&victim.dead){visualEvents.push({...snapshot,kind:'fall',born:elapsed,life:3.2});if(visualEvents.length>160)visualEvents.shift();}else if(alive&&victim.recentHit>0)mark(victim,'hit-reaction',.34);
    return result;
  };

  function visualOffset(u,a){if(!a)return 0;if(a.kind==='musket-fire')return -Math.sin(Math.min(1,a.age/.14)*Math.PI)*2.4;if(a.kind==='artillery-fire')return -Math.sin(Math.min(1,a.age/.28)*Math.PI)*7;if(a.kind==='hit-reaction')return -Math.sin(a.t*Math.PI)*2;return 0;}
  function drawCombatOverlay(u,a){
    if(!a&&!((u.attackMode==='bayonet')||(u.type==='cavalry'&&(u.chargeTimer||0)>0)))return;
    ctx.save();ctx.translate(u.x,u.y);ctx.rotate(u.facing||0);
    if(u.attackMode==='bayonet'&&u.type==='infantry'){ctx.strokeStyle='#b9bcc0';ctx.lineWidth=1.05;ctx.beginPath();ctx.moveTo(15,-1);ctx.lineTo(21,-1);ctx.stroke();}
    if(u.type==='cavalry'&&(u.chargeTimer||0)>0){ctx.strokeStyle='#d2d0c8';ctx.lineWidth=1.35;ctx.beginPath();ctx.moveTo(1,-5);ctx.lineTo(17,-8);ctx.stroke();}
    if(a?.kind==='musket-fire'&&a.age<.11){
      const f=1-a.age/.11;
      ctx.fillStyle=`rgba(255,222,131,${.92*f})`;
      ctx.beginPath();ctx.moveTo(21,2);ctx.lineTo(30,-1);ctx.lineTo(27,2);ctx.lineTo(30,5);ctx.closePath();ctx.fill();
      // Tiny flintlock pan flash by the breech precedes the main muzzle jet
      // visually. The combat event clock is not modified.
      if(a.age<.045){
        ctx.fillStyle=`rgba(255,185,91,${.65*(1-a.age/.045)})`;
        ctx.beginPath();ctx.ellipse(5,3.5,3,1.7,-.35,0,Math.PI*2);ctx.fill();
      }
    }
    if(a?.kind==='musket-fire'&&a.age>.34&&a.age<a.duration*.86){const p=(a.age-.34)/Math.max(.1,a.duration*.86-.34),ram=8+Math.sin(p*Math.PI)*7;ctx.strokeStyle='#a68c65';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(4,1);ctx.lineTo(ram,-7);ctx.stroke();}
    if(a?.kind==='artillery-fire'&&a.age<.18){ctx.fillStyle='rgba(255,212,112,.8)';ctx.beginPath();ctx.arc(15,-2,4.5*(1-a.age/.18),0,Math.PI*2);ctx.fill();}
    if(a?.kind==='cavalry-strike'){const swing=Math.sin(a.t*Math.PI)*.7;ctx.rotate(-swing);ctx.strokeStyle='#d4d1c7';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(0,-6);ctx.lineTo(15,-9);ctx.stroke();}
    ctx.restore();
  }

  drawUnit=function drawUnitCombatAnimationsV1(u){if(u.dead)return;const a=active(u),offset=visualOffset(u,a);if(Math.abs(offset)>.01){const ox=u.x,oy=u.y;u.x+=Math.cos(u.facing||0)*offset;u.y+=Math.sin(u.facing||0)*offset;baseDrawUnit(u);u.x=ox;u.y=oy;}else baseDrawUnit(u);drawCombatOverlay(u,a);};
  function seededOffset(seed,index){const n=(Math.imul((seed^(index*374761393))>>>0,668265263)>>>0)/4294967295;return n*2-1;}

  // Integrate displacement since the previous frame: changing wind direction
  // bends the smoke's trajectory instead of teleporting existing smoke.
  function advanceSmoke(e){
    const prev=e.driftAt??elapsed;
    const dt=Math.max(0,Math.min(e.life,elapsed-prev));
    e.driftAt=elapsed;
    // Midpoint integration follows gradual direction changes even when a
    // frame is delayed, without teleporting old smoke or touching gameplay.
    const w=global.__MAP_AMBIENT_MOTION_V1__?.currentWind?.(prev+dt*.5)||
      {x:.72,y:-.28,strength:1};
    const windSpeed=25*Math.max(0,Math.min(2.5,w.strength||0));
    e.driftX=(e.driftX||0)+w.x*windSpeed*dt;
    e.driftY=(e.driftY||0)+w.y*windSpeed*dt;
  }
  function smokeSnapshot(){
    return smokeEvents.filter(e=>elapsed-e.born<e.life).map(e=>{
      advanceSmoke(e);
      return{kind:e.kind,count:e.count,born:e.born,life:e.life,
        origin:{x:e.x,y:e.y},center:{x:e.x+e.driftX,y:e.y+e.driftY},
        drift:{x:e.driftX,y:e.driftY},profile:smokeProfile(e,elapsed-e.born)};
    });
  }

  // Black-powder muskets do not discharge an already-round fog ball:
  // a sharp axial muzzle jet expands into irregular white salt-particle
  // billows, which diffuse and drift. See NPS live volleys, NIJ propellant
  // comparison, and high-speed flintlock pan/vent/muzzle studies.
  // These are deliberately stylised world-space distances, not a CFD solver.
  function smokeProfile(e,age){
    const t=Math.max(0,Math.min(1,age/e.life));
    const cannon=e.kind==='artillery',ageClamped=Math.max(0,age);
    const bloom=1-Math.exp(-ageClamped*2.6);
    const jetUp=Math.min(1,ageClamped/.14);
    const jetDecay=Math.exp(-Math.max(0,ageClamped-.14)*4.6);
    const jetReach=(cannon?95:69)*jetUp*jetDecay;
    const forward=(cannon?6:4)+(cannon?42:29)*bloom;
    const breadth=(cannon?20:13)+(cannon?35:28)*Math.pow(Math.min(1,ageClamped/2.4),.65)+
      Math.min(41,(e.count||1)*.95);
    const radius=(cannon?7:4.6)+(cannon?20:15.5)*Math.pow(Math.min(1,ageClamped/2),.6)+
      Math.min(13,(e.count||1)*.22);
    const opacity=Math.pow(1-t,1.04)*Math.min(1,.37+ageClamped*5.0);
    const stage=ageClamped<.24?'muzzle-jet':ageClamped<1.05?'billowing':'wind-drift';
    return{stage,jetReach,forward,breadth,radius,opacity,
      panIntensity:cannon?0:Math.max(0,1-ageClamped/.72)};
  }
  // v270: measured-looking black-powder colours from photographs of
  // reenactment volleys. RGB stops are art-directed rather than spectral
  // measurements: bright white/ivory fresh aerosol -> neutral greys ->
  // faint cool blue-grey as a translucent bank disperses.
  // All layers transition continuously; no abrupt change at phase borders.
  const SMOKE_COLOR_STOPS=Object.freeze([
    {at:0,   core:'#d7d2c5',middle:'#e9e4d9',rim:'#f4f1e8',jet:'#f5f1e7',pan:'#d9d2c4'},
    {at:.25, core:'#cdc9be',middle:'#e6e2d7',rim:'#f1efe7',jet:'#f1efe9',pan:'#d5cdc0'},
    {at:1.2, core:'#c7c7c2',middle:'#deded8',rim:'#ebebe7',jet:'#ebebe6',pan:'#cbc6bd'},
    {at:3.0, core:'#b7b9b7',middle:'#d1d4d3',rim:'#e2e4e3',jet:'#e2e4e3',pan:'#bebeb8'},
    {at:6.5, core:'#adb4bb',middle:'#c6cdd2',rim:'#d9dfe3',jet:'#d9dfe3',pan:'#b9c0c5'}
  ]);
  function mixHex(a,b,t){
    const clamped=Math.max(0,Math.min(1,t));
    const channels=[1,3,5].map(i=>{
      const first=parseInt(a.slice(i,i+2),16),last=parseInt(b.slice(i,i+2),16);
      return Math.round(first+(last-first)*clamped).toString(16).padStart(2,'0');
    });
    return '#'+channels.join('');
  }
  function smokePalette(age){
    const t=Math.max(0,Number(age)||0);
    let left=SMOKE_COLOR_STOPS[0],right=SMOKE_COLOR_STOPS.at(-1);
    for(let i=1;i<SMOKE_COLOR_STOPS.length;i++){
      if(t<=SMOKE_COLOR_STOPS[i].at){
        left=SMOKE_COLOR_STOPS[i-1];right=SMOKE_COLOR_STOPS[i];
        break;
      }
    }
    const blend=left===right?0:Math.max(0,Math.min(1,
      (t-left.at)/Math.max(.001,right.at-left.at)));
    return {core:mixHex(left.core,right.core,blend),
      middle:mixHex(left.middle,right.middle,blend),
      rim:mixHex(left.rim,right.rim,blend),
      jet:mixHex(left.jet,right.jet,blend),
      pan:mixHex(left.pan,right.pan,blend)};
  }

  function drawSmoke(){
    if(!smokeEvents.length||global.__BATTLEFIELD_3D_V1__?.enabled?.())return;
    ctx.save();ctx.lineCap='round';
    const zoom=Math.max(.1,camera.zoom||1);
    for(let i=smokeEvents.length-1;i>=0;i--){
      const e=smokeEvents[i],age=elapsed-e.born;
      if(age>=e.life||age<0){smokeEvents.splice(i,1);continue;}
      advanceSmoke(e);
      const m=smokeProfile(e,age),cannon=e.kind==='artillery';
      const fx=Math.cos(e.facing),fy=Math.sin(e.facing),px=-fy,py=fx;
      const cx=e.x+e.driftX,cy=e.y+e.driftY;
      const extent=120+m.breadth+m.radius;
      if(!isWorldVisible(cx,cy,extent))continue;
      // One low-opacity, cool-toned translucent rim under the dense billows.
      // A single ellipse per smoke bank adds an outer layer without expensive
      // per-lobe canvas gradients or extra particle objects.
      const colors=smokePalette(age);
      ctx.fillStyle=colors.rim;
      ctx.globalAlpha=m.opacity*(cannon?.078:.066);
      ctx.beginPath();
      ctx.ellipse(cx+fx*m.forward,cy+fy*m.forward,
        m.breadth*1.22+m.radius*.34,
        m.breadth*.83+m.radius*.4,e.facing,0,Math.PI*2);
      ctx.fill();

      // At near zoom we distinguish three blended tones: the shaded central
      // smoke masses, warm/neutral middle layer and light wispy outer edges.
      // Fewer billows are painted at low zoom for 500+ soldiers.
      const lobes=zoom<.67?7:cannon?14:Math.min(15,9+Math.ceil((e.count||1)/7));
      const regFactor=1+Math.min(.75,Math.sqrt(e.count||1)*.1);
      for(let k=0;k<lobes;k++){
        const noise=seededOffset(e.seed^0xa511e9b3,k);
        const side=seededOffset(e.seed^0x9e3779b9,k);
        const curl=Math.sin(age*1.5+k*1.71+e.seed*.000009)*2.7;
        const along=m.forward+noise*m.breadth*.77+
          (k%4===0?-m.forward*.58:0);
        const lateral=side*m.breadth*.92+curl*Math.min(1,age);
        const x=cx+fx*along+px*lateral;
        const y=cy+fy*along+py*lateral;
        const radius=m.radius*(.66+(seededOffset(e.seed^0x85ebca6b,k)+1)*.23)*regFactor;
        const shaded=k%4===0,edge=!shaded&&k%3===0;
        ctx.fillStyle=shaded?colors.core:edge?colors.rim:colors.middle;
        const strength=shaded?1.06:(edge?0.72:0.94);
        ctx.globalAlpha=m.opacity*(cannon?.27:.265)*strength*
          (1-Math.min(.46,k*.018));
        ctx.beginPath();ctx.ellipse(x,y,radius*(.94+.18*Math.sin(k)),radius*.8,
          e.facing+Math.sin(k*2.7+age*.32)*.35,0,Math.PI*2);ctx.fill();
      }

      // 0–0.4 s: directed, fast, pale muzzle jet; does not permanently
      // teleport the main cloud downrange, and naturally fades into billows.
      if(m.jetReach>1.1){
        const jetFade=Math.min(1,age/.045)*Math.exp(-Math.max(0,age-.13)*8);
        ctx.fillStyle=colors.jet;
        ctx.globalAlpha=(cannon?.35:.44)*jetFade;
        for(let j=0;j<4;j++){
          const fraction=(j+.45)/4;
          const x=cx+fx*m.jetReach*fraction;
          const y=cy+fy*m.jetReach*fraction;
          const lobe=Math.max(2,(cannon?11:7)+fraction*8)*Math.max(.4,1-age*.65);
          ctx.beginPath();ctx.ellipse(x,y,lobe*1.8,lobe*.62,e.facing,0,Math.PI*2);ctx.fill();
        }
      }
      // The flash pan/vent contributes a small secondary puff beside the
      // shooter, not a second large musket smoke cloud.
      if(m.panIntensity>0&&zoom>.65){
        const nearX=cx-fx*12+px*1.2,nearY=cy-fy*12+py*1.2;
        ctx.fillStyle=colors.pan;ctx.globalAlpha=.24*m.panIntensity;
        ctx.beginPath();
        ctx.ellipse(nearX,nearY,3.8+age*10,2.4+age*7,e.facing+.35,0,Math.PI*2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
  function drawFalls(){if(global.__TOPDOWN_CASUALTIES_V272__&&!global.__BATTLEFIELD_3D_V1__?.enabled?.())return global.__TOPDOWN_CASUALTIES_V272__.drawFallen(visualEvents,elapsed);for(let i=visualEvents.length-1;i>=0;i--){const e=visualEvents[i],age=elapsed-e.born;if(age>=e.life){visualEvents.splice(i,1);continue;}const t=Math.min(1,age/.42),alpha=Math.min(.72,(e.life-age)*.7);ctx.save();ctx.globalAlpha=alpha;ctx.translate(e.x,e.y);ctx.rotate(e.facing+t*Math.PI*.42);ctx.fillStyle=e.side==='france'?'#244d9a':'#a5322f';if(e.type==='cavalry'){ctx.fillStyle='#564334';ctx.beginPath();ctx.ellipse(0,2,11,5.2,.25,0,Math.PI*2);ctx.fill();}ctx.fillStyle=e.side==='france'?'#244d9a':'#a5322f';ctx.beginPath();ctx.ellipse(0,0,5,7,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#d1a784';ctx.beginPath();ctx.arc(0,-7,2.5,0,Math.PI*2);ctx.fill();ctx.restore();}}
  drawParticles=function drawParticlesCombatAnimationsV1(){baseDrawParticles();drawSmoke();drawFalls();};

  function smokeStats(){let musketClouds=0,artilleryClouds=0,maxPooledShots=0,persistentVolleyClouds=0;for(const e of smokeEvents){if(e.kind==='artillery')artilleryClouds+=1;else{musketClouds+=1;if(e.count>=8&&elapsed-e.born>=.35)persistentVolleyClouds+=1;}maxPooledShots=Math.max(maxPooledShots,e.count||1);}return {active:smokeEvents.length,musketClouds,artilleryClouds,maxPooledShots,persistentVolleyClouds,cap:MAX_SMOKE_EVENTS};}
  const api=Object.freeze({version:'combat-animations-v1.3',eventCount:()=>visualEvents.length,animationFor:u=>active(u),smokeStats,smokeSnapshot,smokeProfile,smokePalette,smokeColorStops:SMOKE_COLOR_STOPS,features:Object.freeze(['musket-fire','reload','bayonet','cavalry-charge','artillery-recoil','hit-reaction','death-fall','pooled-volley-smoke','persistent-smoke-line','artillery-smoke','batched-smoke-canvas-state','wind-advected-dense-powder-smoke','flintlock-pan-puff','directed-jet-then-billow','age-interpolated-three-layer-smoke-colors'])});
  nrts.subsystems.register('combat-animations',api,{phase:'architecture-v2',legacyBridge:false,responsibility:'visual-only combat event animation and pooled black-powder smoke synchronized to simulation fire and damage events'});
  global.__COMBAT_ANIMATIONS_V1__=api;
})(window);
