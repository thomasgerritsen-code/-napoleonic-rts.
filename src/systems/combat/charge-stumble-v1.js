'use strict';
// Temporary, simulation-owned falls: no casualties, per-frame rolls or timers.
(function installChargeStumble(root){
  if(document.readyState!=='complete'){addEventListener('load',()=>installChargeStumble(root),{once:true});return;}
  let charges=new WeakMap();
  const duration=1.9,stats={falls:0,recovered:0};
  const down=u=>!!u&&!u.dead&&!u.routing&&Number.isFinite(u.chargeFallAt)&&elapsed<u.chargeFallUntil;
  function clear(u){delete u.chargeFallAt;delete u.chargeFallUntil;delete u.chargeFallFacing;}
  function fall(u,seconds=duration){
    if(!u||u.dead||u.routing||down(u)||(u.type!=='infantry'&&u.type!=='cavalry'))return false;
    u.chargeFallAt=elapsed;u.chargeFallUntil=elapsed+Math.max(.8,Math.min(2.5,seconds));
    u.chargeFallFacing=u.facing||0;u.chargeMomentumV1=0;
    if(u.slotFollowerV071)u.slotFollowerV071.vx=u.slotFollowerV071.vy=0;
    stats.falls++;return true;
  }
  function sample(id,sequence,salt){
    let n=Math.imul(id^Math.imul(sequence,0x9e3779b1)^salt,0x85ebca6b);
    n=Math.imul(n^(n>>>16),0xc2b2ae35);return((n^(n>>>13))>>>0)/4294967296;
  }
  function safe(u){
    const reg=u.regimentId?getRegiment(u.regimentId):null;
    if(reg?.crossingTrafficV068?.forcedColumn||u.waterCrossingIdV067)return false;
    if(typeof crossingAtV067==='function'&&crossingAtV067(u.x,u.y))return false;
    if(typeof waterAtV067==='function'&&waterAtV067(u.x,u.y))return false;
    return !nearestEnemyEntity(u,45);
  }
  const baseMove=moveToward;
  moveToward=function moveChargeStumble(u,...args){if(down(u))return false;return baseMove(u,...args);};
  const baseFire=fire;
  fire=function fireChargeStumble(u,...args){if(down(u))return;return baseFire(u,...args);};
  const baseUnit=updateUnit;
  updateUnit=function updateChargeStumble(u,dt){
    if(!u||u.dead||u.routing||(u.type!=='infantry'&&u.type!=='cavalry')||!(dt>0)){
      if(u){clear(u);charges.delete(u);}return baseUnit(u,dt);
    }
    if(Number.isFinite(u.chargeFallAt)&&!down(u)){clear(u);stats.recovered++;}
    let s=charges.get(u);
    const timer=u.chargeTimer||0;
    if(!s){s={timer:0,sequence:0,travel:0,used:false};charges.set(u,s);}
    if(timer>0&&(s.timer<=0||timer>s.timer+.2)){
      s.sequence++;s.travel=0;s.used=false;
      // About one in twelve chargers, selected once per charge by identity.
      s.chosen=sample(u.id,s.sequence,19)<1/12;
      s.after=70+sample(u.id,s.sequence,71)*65;
    }
    s.timer=timer;
    const x=u.x,y=u.y,facing=u.facing;
    const held=down(u),result=baseUnit(u,dt);
    if(u.dead||u.routing){clear(u);return result;}
    if(held){u.facing=u.chargeFallFacing;u.chargeMomentumV1=0;return result;}
    const distance=Math.hypot(u.x-x,u.y-y);
    if(timer>0&&!s.used){
      // Real running distance, never time spent standing, fighting or queuing.
      if(distance/dt>35)s.travel+=distance;
      if(s.chosen&&s.travel>=s.after&&distance/dt>35&&safe(u)){
        s.used=true;fall(u);u.chargeFallFacing=facing;
      }
    }
    return result;
  };
  const baseDraw=drawUnit;
  drawUnit=function drawChargeStumble(u){
    if(!down(u))return baseDraw(u);
    const age=elapsed-u.chargeFallAt,tip=Math.max(0,Math.min(1,age/.55,(duration-age)/.75));
    ctx.save();ctx.translate(u.x,u.y);ctx.rotate(tip*.65);
    ctx.scale(1+tip*.2,1-tip*.55);ctx.translate(-u.x,-u.y);
    try{return baseDraw(u);}finally{ctx.restore();}
  };
  root.NRTS.events.on('game:reset',()=>{charges=new WeakMap();stats.falls=stats.recovered=0;});
  root.__CHARGE_STUMBLE_V1__=Object.freeze({down,fall,duration,stats:()=>({...stats})});
})(window);
